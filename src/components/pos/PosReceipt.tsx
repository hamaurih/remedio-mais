import { PAYMENT_LABELS, PosPayment, brl } from "@/lib/pos";

export type PosReceiptData = {
  saleNumber: number;
  createdAt: string;
  operator: string;
  storeName: string;
  cnpj?: string | null;
  customer?: string | null;
  items: { name: string; quantity: number; unit_price: number; total: number }[];
  subtotal: number;
  discount: number;
  delivery?: {
    address: string;
    fee: number;
    distance_km?: number | null;
  } | null;
  total: number;
  payments: PosPayment[];
  change: number;
};

export function printReceipt(d: PosReceiptData) {
  const rows = d.items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${brl(i.unit_price)}</td><td style="text-align:right">${brl(i.total)}</td></tr>`,
    )
    .join("");
  const pays = d.payments.map((p) => `<div>${PAYMENT_LABELS[p.method]}: ${brl(p.amount)}</div>`).join("");
  const delivery = d.delivery
    ? `<div>Entrega: ${brl(d.delivery.fee)}</div>
<div>Endereço: ${escapeHtml(d.delivery.address)}</div>
${d.delivery.distance_km != null ? `<div>Distância: ${Number(d.delivery.distance_km).toFixed(1)} km</div>` : ""}`
    : "";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Comprovante ${d.saleNumber}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;padding:12px;max-width:320px}
  h1{font-size:14px;margin:0 0 4px} table{width:100%;border-collapse:collapse;margin:8px 0}
  td,th{padding:2px 0;font-size:11px} hr{border:none;border-top:1px dashed #999;margin:6px 0}
  .tot{font-size:14px;font-weight:700;display:flex;justify-content:space-between}
</style></head><body>
<h1>${escapeHtml(d.storeName)}</h1>
<div>${d.cnpj ? "CNPJ: " + escapeHtml(d.cnpj) : ""}</div>
<div>Venda nº ${d.saleNumber} · ${new Date(d.createdAt).toLocaleString("pt-BR")}</div>
<div>Operador: ${escapeHtml(d.operator)}</div>
<div>Cliente: ${escapeHtml(d.customer || "Consumidor não identificado")}</div>
<hr/>
<table><thead><tr><th style="text-align:left">Item</th><th>Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
<hr/>
<div>Subtotal: ${brl(d.subtotal)}</div>
<div>Desconto: ${brl(d.discount)}</div>
${delivery}
<div class="tot"><span>TOTAL</span><span>${brl(d.total)}</span></div>
<hr/>
${pays}
<div>Troco: ${brl(d.change)}</div>
<hr/>
<div style="text-align:center">DOCUMENTO NÃO FISCAL</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
