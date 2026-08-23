import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AddressAutocomplete, SelectedAddress } from "@/components/AddressAutocomplete";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL } from "@/lib/store";
import { Loader2, Plus, Trash2, Star, LogOut, MapPin } from "lucide-react";
import { Seo } from "@/components/Seo";
import { CpfInput } from "@/components/CpfInput";
import { formatCpf, isValidCpf, normalizeCpf } from "@/lib/cpf";

export default function Account() {
  const { user, profile, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) nav("/auth?next=/minha-conta", { replace: true });
  }, [user, loading, nav]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const cpfHasValue = normalizeCpf(cpf).length > 0;
  const cpfInvalid = cpfHasValue && !isValidCpf(cpf);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name || "");
      setPhone(profile.phone || "");
      setCpf(formatCpf(profile.cpf || ""));
    }
  }, [profile]);

  const saveProfile = async () => {
    if (!user) return;
    const normalizedCpf = normalizeCpf(cpf);
    if (normalizedCpf && !isValidCpf(normalizedCpf)) {
      toast.error("CPF inválido. Confira os números antes de salvar.");
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: name || null,
      phone: phone || null,
      cpf: normalizedCpf || null,
      email: user.email,
    }, { onConflict: "id" });
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Dados salvos");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    nav("/", { replace: true });
  };

  // Endereços
  const { data: addresses = [], isLoading: addrLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my_addresses", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", user!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [newAddr, setNewAddr] = useState<{
    label: string; cep: string; street: string; number: string; complement: string;
    neighborhood: string; city: string; state: string; reference: string;
    lat: number | null; lng: number | null; place_id: string | null;
  }>({ label: "Casa", cep: "", street: "", number: "", complement: "",
       neighborhood: "", city: "", state: "", reference: "",
       lat: null, lng: null, place_id: null });

  const onPickAddress = (a: SelectedAddress) => {
    setNewAddr((p) => ({
      ...p,
      street: a.street || p.street,
      number: a.number || p.number,
      neighborhood: a.neighborhood || p.neighborhood,
      city: a.city || p.city,
      state: a.state || p.state,
      cep: a.cep || p.cep,
      lat: a.lat,
      lng: a.lng,
      place_id: a.place_id,
    }));
  };

  // Edição manual de campos de endereço invalida coordenadas do Google
  // (evita calcular frete para o ponto antigo).
  const editGeoField = (field: "street" | "number" | "neighborhood" | "city" | "state" | "cep", value: string) => {
    setNewAddr((p) => ({ ...p, [field]: value, lat: null, lng: null, place_id: null }));
  };

  const saveAddress = async () => {
    if (!user) return;
    if (!newAddr.street || !newAddr.number || !newAddr.city) {
      toast.error("Preencha rua, número e cidade");
      return;
    }
    const { error } = await supabase.from("customer_addresses").insert({
      customer_id: user.id,
      label: newAddr.label || "Endereço",
      cep: newAddr.cep, street: newAddr.street, number: newAddr.number,
      complement: newAddr.complement, neighborhood: newAddr.neighborhood,
      city: newAddr.city, state: newAddr.state, reference: newAddr.reference,
      lat: newAddr.lat, lng: newAddr.lng, place_id: newAddr.place_id,
      is_default: addresses.length === 0,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Endereço adicionado");
    setAddOpen(false);
    setNewAddr({ label: "Casa", cep: "", street: "", number: "", complement: "",
                 neighborhood: "", city: "", state: "", reference: "",
                 lat: null, lng: null, place_id: null });
    qc.invalidateQueries({ queryKey: ["my_addresses", user.id] });
  };

  const setDefault = async (id: string) => {
    if (!user) return;
    await supabase.from("customer_addresses").update({ is_default: false } as any).eq("customer_id", user.id);
    await supabase.from("customer_addresses").update({ is_default: true } as any).eq("id", id);
    qc.invalidateQueries({ queryKey: ["my_addresses", user.id] });
  };

  const removeAddress = async (id: string) => {
    const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Endereço removido");
    qc.invalidateQueries({ queryKey: ["my_addresses", user?.id] });
  };

  // Pedidos
  const { data: orders = [] } = useQuery({
    enabled: !!user,
    queryKey: ["my_orders", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, created_at, total, status, payment_status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  if (loading || !user) {
    return (
      <Layout>
      <Seo title="Minha conta" description="Gerencie seus dados, endereços e pedidos." path="/minha-conta" noindex />
        <div className="container py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const firstName = (name || user.email || "").split(/\s+/)[0];

  return (
    <Layout>
      <div className="container max-w-4xl py-8 space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold">Olá, {firstName} 👋</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus dados, endereços e pedidos.</p>
          </div>
          <Button variant="outline" onClick={logout} className="gap-2">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>

        <Tabs defaultValue="perfil" className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="perfil">Perfil</TabsTrigger>
            <TabsTrigger value="enderecos">Endereços</TabsTrigger>
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="pt-4">
            <Card className="p-5 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nome completo</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input value={user.email || ""} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone / WhatsApp</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(83) 9 9999-9999" />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF</Label>
                  <CpfInput value={cpf} onChange={setCpf} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={savingProfile || cpfInvalid}>
                  {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="enderecos" className="pt-4 space-y-3">
            {addrLoading ? (
              <div className="text-sm text-muted-foreground">Carregando...</div>
            ) : addresses.length === 0 && !addOpen ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                Você ainda não tem endereços salvos.
              </Card>
            ) : (
              <div className="space-y-2">
                {addresses.map((a: any) => (
                  <Card key={a.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="flex gap-3 min-w-0">
                      <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{a.label || "Endereço"}</span>
                          {a.is_default && <Badge>Padrão</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {a.street}, {a.number}{a.complement ? ` - ${a.complement}` : ""}<br />
                          {a.neighborhood ? `${a.neighborhood} · ` : ""}{a.city}/{a.state}{a.cep ? ` · CEP ${a.cep}` : ""}
                          {a.reference && <><br />Ref: {a.reference}</>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {!a.is_default && (
                        <Button size="sm" variant="ghost" onClick={() => setDefault(a.id)} className="gap-1">
                          <Star className="h-3.5 w-3.5" /> Padrão
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={() => removeAddress(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {!addOpen ? (
              <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" /> Adicionar endereço
              </Button>
            ) : (
              <Card className="p-5 space-y-3">
                <div className="font-semibold">Novo endereço</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Rótulo</Label>
                    <Input value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} placeholder="Casa, Trabalho..." />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Buscar endereço</Label>
                    <AddressAutocomplete onSelect={onPickAddress} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Rua</Label>
                    <Input value={newAddr.street} onChange={(e) => editGeoField("street", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Número</Label>
                    <Input value={newAddr.number} onChange={(e) => editGeoField("number", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Complemento</Label>
                    <Input value={newAddr.complement} onChange={(e) => setNewAddr({ ...newAddr, complement: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bairro</Label>
                    <Input value={newAddr.neighborhood} onChange={(e) => editGeoField("neighborhood", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CEP</Label>
                    <Input value={newAddr.cep} onChange={(e) => editGeoField("cep", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cidade</Label>
                    <Input value={newAddr.city} onChange={(e) => editGeoField("city", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Estado</Label>
                    <Input value={newAddr.state} onChange={(e) => editGeoField("state", e.target.value)} maxLength={2} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Ponto de referência</Label>
                    <Input value={newAddr.reference} onChange={(e) => setNewAddr({ ...newAddr, reference: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
                  <Button onClick={saveAddress}>Salvar endereço</Button>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pedidos" className="pt-4">
            {orders.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                Você ainda não fez nenhum pedido.
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-3">Pedido</th>
                      <th className="p-3">Data</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Pagamento</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o: any) => (
                      <tr key={o.id} className="border-t">
                        <td className="p-3 font-mono text-xs">#{o.id.slice(0, 8)}</td>
                        <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                        <td className="p-3"><Badge variant="outline">{o.status}</Badge></td>
                        <td className="p-3 text-xs">{o.payment_status || "—"}</td>
                        <td className="p-3 text-right font-semibold">{formatBRL(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
