import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-catalog-search`;

export default function AdminWhatsAppAgent() {
  const [query, setQuery] = useState("dipirona");
  const [channel, setChannel] = useState("whatsapp");
  const [agentKey, setAgentKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<any>(null);

  const test = async () => {
    if (!agentKey.trim()) {
      toast.error("Cole a chave do agente (x-agent-key) para testar.");
      return;
    }
    setLoading(true); setResp(null);
    try {
      const r = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agent-key": agentKey.trim() },
        body: JSON.stringify({ mensagem: query, query, channel, limit: 5 }),
      });
      const data = await r.json().catch(() => ({}));
      setResp({ status: r.status, data });
      if (r.status === 401) toast.error("Chave inválida (401).");
      else if (!r.ok) toast.error(`Erro ${r.status}`);
      else toast.success(`OK — ${data?.count ?? 0} resultado(s)`);
    } catch (e: any) {
      toast.error(e.message || "Falha de rede");
    } finally {
      setLoading(false);
    }
  };

  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success("Copiado"); };

  const results = resp?.data?.results || [];
  const keyConfigured = agentKey.trim().length >= 8;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold">Agente WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Teste a API segura usada pelo agente externo para consultar o catálogo.
          A chave fica armazenada como secret de backend (<code>WHATSAPP_AGENT_API_KEY</code>) e nunca trafega pelo frontend em produção.
        </p>
      </header>

      <section className="border rounded-lg p-4 space-y-3 bg-card">
        <h2 className="font-bold">Endpoint</h2>
        <div className="flex items-center gap-2">
          <Input readOnly value={FN_URL} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copy(FN_URL)}><Copy className="h-4 w-4" /></Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Método <strong>POST</strong> · Header obrigatório <code>x-agent-key</code> ·
          Body: <code>{`{ "mensagem": "...", "channel": "whatsapp", "limit": 5 }`}</code>
        </div>
      </section>

      <section className="border rounded-lg p-4 space-y-3 bg-card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Chave do agente</h2>
          <div className={`text-xs flex items-center gap-1 ${keyConfigured ? "text-emerald-700" : "text-amber-700"}`}>
            {keyConfigured ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            {keyConfigured ? "Chave informada (apenas para teste local)" : "Sem chave — informe para testar"}
          </div>
        </div>
        <Label>Cole aqui o valor da WHATSAPP_AGENT_API_KEY (use só para testar)</Label>
        <Input type="password" value={agentKey} onChange={(e) => setAgentKey(e.target.value)} placeholder="cole a chave secreta" />
        <p className="text-[11px] text-muted-foreground">
          ⚠ A chave nunca é exibida nem armazenada pelo painel. Em produção, o agente WhatsApp envia este header diretamente.
        </p>
      </section>

      <section className="border rounded-lg p-4 space-y-3 bg-card">
        <h2 className="font-bold">Testar consulta</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 space-y-1">
            <Label>Termo de busca / mensagem</Label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex: tem dipirona?" />
          </div>
          <div className="space-y-1">
            <Label>Canal</Label>
            <select className="w-full h-10 border rounded px-2 bg-background" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="whatsapp">whatsapp</option>
              <option value="site">site</option>
              <option value="balcao">balcao</option>
              <option value="telefone">telefone</option>
            </select>
          </div>
        </div>
        <Button onClick={test} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Testar consulta
        </Button>
      </section>

      {resp && (
        <section className="border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Resposta</h2>
            <span className="text-xs">HTTP {resp.status}</span>
          </div>
          {results.length > 0 ? (
            <div className="grid gap-2">
              {results.map((r: any) => (
                <div key={r.id} className="border rounded p-3 flex gap-3">
                  <div className="w-16 h-16 bg-secondary/40 rounded shrink-0 flex items-center justify-center overflow-hidden">
                    {r.image_url ? <img src={r.image_url} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-muted-foreground">sem imagem</span>}
                  </div>
                  <div className="text-sm flex-1">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.brand || "—"} · {r.category || "—"}</div>
                    <div className="text-xs mt-1">
                      <strong>{r.price_label}:</strong> R$ {Number(r.effective_price).toFixed(2).replace(".", ",")}
                      {r.discount_percentage > 0 && <span className="ml-2 text-emerald-700">-{r.discount_percentage}%</span>}
                      <span className="ml-2">· Estoque: {r.stock}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Imagem: {r.image_url ? "sim" : "não"} ·
                      Receita: {r.requires_prescription ? "sim" : "não"} ·
                      Controlado: {r.controlled ? "sim" : "não"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{resp.data?.message || "Sem resultados."}</div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer">Ver JSON completo</summary>
            <pre className="mt-2 p-2 bg-muted rounded overflow-auto text-[11px]">{JSON.stringify(resp.data, null, 2)}</pre>
          </details>
        </section>
      )}

      <section className="border rounded-lg p-4 space-y-3 bg-card text-sm">
        <h2 className="font-bold">Configuração da ferramenta no agente</h2>
        <p className="text-xs text-muted-foreground">Copie este preset para a sua plataforma de agente (n8n, Typebot, Z-API + GPT, etc).</p>
        <pre className="p-3 bg-muted rounded overflow-auto text-[11px]">{`Nome: consultar_estoque_farmacia
Método: POST
URL: ${FN_URL}
Headers:
{
  "Content-Type": "application/json",
  "x-agent-key": "SUA_CHAVE_SEGURA"
}
Body:
{
  "mensagem": "{{mensagem}}",
  "channel": "whatsapp",
  "limit": 5
}`}</pre>
        <div className="border-l-4 border-primary/60 bg-primary/5 p-3 text-xs space-y-1">
          <strong>Instrução de uso (cole no system prompt do agente):</strong>
          <p>Quando o cliente perguntar sobre produto, preço, desconto, estoque, imagem, marca ou disponibilidade, use a ferramenta <code>consultar_estoque_farmacia</code> antes de responder. Nunca invente preço. Nunca invente estoque. Nunca ofereça produto sem estoque. Produtos controlados ou com <code>requires_prescription=true</code> só podem ser liberados após receita. A venda continua pela conversa do WhatsApp — não envie link de compra do site como CTA principal.</p>
        </div>
      </section>
    </div>
  );
}
