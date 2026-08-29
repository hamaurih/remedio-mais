import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AddressAutocomplete, type SelectedAddress } from "@/components/AddressAutocomplete";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { customerAccount } from "@/lib/customerAccountApi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL } from "@/lib/store";
import { Loader2, Plus, Trash2, Star, LogOut, MapPin, KeyRound } from "lucide-react";
import { Seo } from "@/components/Seo";
import { CpfInput } from "@/components/CpfInput";
import { formatCpf, isValidCpf, normalizeCpf } from "@/lib/cpf";
import { lookupCep as lookupCepAddress, onlyDigits, formatCep } from "@/lib/addressLookup";

export default function Account() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) nav("/auth?next=/minha-conta", { replace: true });
  }, [user, loading, nav]);

  const { data: account, isLoading: accountLoading } = useQuery({
    enabled: !!user,
    queryKey: ["customer_account", user?.id],
    queryFn: () => customerAccount<any>("account", { limit: 50 }),
  });

  const profile = account?.profile || null;
  const addresses = account?.addresses || [];
  const orders = account?.orders || [];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const cpfHasValue = normalizeCpf(cpf).length > 0;
  const cpfInvalid = cpfHasValue && !isValidCpf(cpf);

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name || "");
    setPhone(profile.phone || "");
    setCpf(formatCpf(profile.cpf || ""));
  }, [profile]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["customer_account", user?.id] });

  const saveProfile = async () => {
    if (!user) return;
    const normalizedCpf = normalizeCpf(cpf);
    if (normalizedCpf && !isValidCpf(normalizedCpf)) {
      toast.error("CPF inválido. Confira os números antes de salvar.");
      return;
    }
    setSavingProfile(true);
    try {
      await customerAccount("update-profile", { full_name: name, phone, cpf: normalizedCpf });
      toast.success("Dados salvos");
      await refresh();
    } catch {
      toast.error("Não foi possível salvar seus dados.");
    } finally {
      setSavingProfile(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    nav("/", { replace: true });
  };

  const [addOpen, setAddOpen] = useState(false);
  const [newAddr, setNewAddr] = useState<{
    label: string; cep: string; street: string; number: string; complement: string;
    neighborhood: string; city: string; state: string; reference: string;
    lat: number | null; lng: number | null; place_id: string | null;
  }>({ label: "Casa", cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", reference: "", lat: null, lng: null, place_id: null });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  const resetAddress = () => setNewAddr({ label: "Casa", cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", reference: "", lat: null, lng: null, place_id: null });

  const onPickAddress = (a: SelectedAddress) => {
    setCepError(null);
    setNewAddr((p) => ({
      ...p,
      street: a.street || p.street,
      number: p.number || a.number || "",
      neighborhood: a.neighborhood || p.neighborhood,
      city: a.city || p.city,
      state: a.state || p.state,
      cep: a.cep || p.cep,
      lat: a.lat,
      lng: a.lng,
      place_id: a.place_id,
    }));
  };

  const editGeoField = (field: "street" | "number" | "neighborhood" | "city" | "state" | "cep", value: string) => {
    setNewAddr((p) => ({ ...p, [field]: value, lat: null, lng: null, place_id: null }));
  };

  const onCepChange = async (value: string) => {
    const c = onlyDigits(value).slice(0, 8);
    setCepError(null);
    editGeoField("cep", c);
    if (c.length !== 8) return;
    setCepLoading(true);
    try {
      const parts = await lookupCepAddress(c);
      if (!parts) {
        setCepError("CEP não encontrado. Preencha manualmente.");
        return;
      }
      setNewAddr((p) => ({
        ...p,
        street: parts.street || p.street,
        neighborhood: parts.neighborhood || p.neighborhood,
        city: parts.city || p.city,
        state: parts.state || p.state,
      }));
    } catch {
      setCepError("Não conseguimos consultar o CEP agora. Preencha manualmente.");
    } finally {
      setCepLoading(false);
    }
  };

  const saveAddress = async () => {
    if (!user) return;
    if (!newAddr.cep || !newAddr.street || !newAddr.number || !newAddr.city || !newAddr.state) {
      toast.error("Preencha CEP, rua, número, cidade e estado.");
      return;
    }
    try {
      await customerAccount("add-address", {
        address: { ...newAddr, is_default: addresses.length === 0 },
      });
      toast.success("Endereço adicionado");
      setAddOpen(false);
      resetAddress();
      await refresh();
    } catch {
      toast.error("Não foi possível adicionar o endereço.");
    }
  };

  const setDefault = async (id: string) => {
    try {
      await customerAccount("set-default-address", { id });
      await refresh();
    } catch {
      toast.error("Não foi possível alterar o endereço padrão.");
    }
  };

  const removeAddress = async (id: string) => {
    try {
      await customerAccount("delete-address", { id });
      toast.success("Endereço removido");
      await refresh();
    } catch {
      toast.error("Não foi possível remover o endereço.");
    }
  };

  if (loading || accountLoading || !user) {
    return (
      <Layout>
        <Seo title="Minha conta" description="Gerencie seus dados, endereços e pedidos." path="/minha-conta" noindex />
        <div className="container py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </Layout>
    );
  }

  const firstName = (name || user.email || "").split(/\s+/)[0];

  return (
    <Layout>
      <Seo title="Minha conta" description="Gerencie seus dados, endereços e pedidos." path="/minha-conta" noindex />
      <div className="container max-w-4xl py-8 space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold">Olá, {firstName} 👋</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus dados, endereços, senha e pedidos.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => nav("/redefinir-senha?mode=change")} className="gap-2">
              <KeyRound className="h-4 w-4" /> Alterar senha
            </Button>
            <Button variant="outline" onClick={logout} className="gap-2"><LogOut className="h-4 w-4" /> Sair</Button>
          </div>
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
                <div className="space-y-1.5"><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={120} /></div>
                <div className="space-y-1.5"><Label>E-mail</Label><Input value={user.email || ""} disabled /></div>
                <div className="space-y-1.5"><Label>Telefone / WhatsApp</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(83) 9 9999-9999" maxLength={20} /></div>
                <div className="space-y-1.5"><Label>CPF</Label><CpfInput value={cpf} onChange={setCpf} /></div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={savingProfile || cpfInvalid}>{savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="enderecos" className="pt-4 space-y-3">
            {addresses.length === 0 && !addOpen ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">Você ainda não tem endereços salvos.</Card>
            ) : (
              <div className="space-y-2">
                {addresses.map((a: any) => (
                  <Card key={a.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="flex gap-3 min-w-0">
                      <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold">{a.label || "Endereço"}</span>{a.is_default && <Badge>Padrão</Badge>}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {a.street}, {a.number}{a.complement ? ` - ${a.complement}` : ""}<br />
                          {a.neighborhood ? `${a.neighborhood} · ` : ""}{a.city}/{a.state}{a.cep ? ` · CEP ${formatCep(a.cep)}` : ""}
                          {a.reference && <><br />Ref: {a.reference}</>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {!a.is_default && <Button size="sm" variant="ghost" onClick={() => setDefault(a.id)} className="gap-1"><Star className="h-3.5 w-3.5" /> Padrão</Button>}
                      <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={() => removeAddress(a.id)}><Trash2 className="h-3.5 w-3.5" /> Excluir</Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {!addOpen ? (
              <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Adicionar endereço</Button>
            ) : (
              <Card className="p-5 space-y-3">
                <div className="font-semibold">Novo endereço</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Rótulo</Label><Input value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} placeholder="Casa, Trabalho..." /></div>
                  <div className="space-y-1.5"><Label>CEP</Label><div className="relative"><Input value={formatCep(newAddr.cep)} onChange={(e) => void onCepChange(e.target.value)} placeholder="00000-000" />{cepLoading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin" />}</div>{cepError && <p className="text-xs text-destructive">{cepError}</p>}</div>
                  <div className="space-y-1.5 md:col-span-2"><Label>Buscar endereço</Label><AddressAutocomplete onSelect={onPickAddress} /></div>
                  <div className="space-y-1.5 md:col-span-2"><Label>Rua</Label><Input value={newAddr.street} onChange={(e) => editGeoField("street", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Número</Label><Input value={newAddr.number} onChange={(e) => editGeoField("number", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Complemento</Label><Input value={newAddr.complement} onChange={(e) => setNewAddr({ ...newAddr, complement: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Bairro</Label><Input value={newAddr.neighborhood} onChange={(e) => editGeoField("neighborhood", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Cidade</Label><Input value={newAddr.city} onChange={(e) => editGeoField("city", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Estado</Label><Input value={newAddr.state} onChange={(e) => editGeoField("state", e.target.value.toUpperCase().slice(0, 2))} maxLength={2} /></div>
                  <div className="space-y-1.5"><Label>Referência</Label><Input value={newAddr.reference} onChange={(e) => setNewAddr({ ...newAddr, reference: e.target.value })} /></div>
                </div>
                <div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => { setAddOpen(false); resetAddress(); }}>Cancelar</Button><Button onClick={saveAddress}>Salvar endereço</Button></div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pedidos" className="pt-4 space-y-2">
            {orders.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">Você ainda não fez pedidos.</Card>
            ) : orders.map((o: any) => (
              <Card key={o.id} className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-muted/40" onClick={() => nav(`/pedido/pix/${o.id}`)}>
                <div><div className="font-semibold">Pedido #{o.id.slice(0, 8)}</div><div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</div></div>
                <div className="text-right"><div className="font-bold">{formatBRL(Number(o.total || 0))}</div><Badge variant="secondary">{o.order_status || o.status || o.payment_status}</Badge></div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
