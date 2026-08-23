# Diagnóstico: pedido 7cdfff12 (Paulo Victor) — statusPedido PENDENTE no Trier

**Escopo: somente diagnóstico. Nenhuma alteração de código ou banco foi feita. Nenhum reenvio foi executado.**

## 1. O que aconteceu com o pedido (fatos confirmados no banco e nos logs)

- Pedido criado em 21/08/2026 20:13:15 UTC, pagamento `approved`, enviado ao Trier às 20:13:23 (1ª tentativa, `trier_attempts = 1`).
- Envio: `POST /rest/integracao/venda/ecommerce/efetuar-venda-v1` → **HTTP 200**, resposta registrada em `trier_order_logs`:
  `numeroPedido: 7125043194`, `numeroNota: 250416`, `statusPedido: { codigo: 1, descricao: "PENDENTE" }`.
- `numeroPedido 7125043194` = dígitos do UUID do pedido (função `shortNumericOrderId` em `send-order-to-trier`). Gravado em `orders.trier_order_id`.
- Estado local hoje: `trier_sent = true`, `trier_status = "sent"`, `trier_status_code = 200`, **`trier_last_status_check_at = null` (nunca foi consultado com sucesso)**.

## 2. Significado operacional do PENDENTE (código 1)

Pelo fluxo implementado (Trier 1.5.23), o `efetuar-venda-v1` **registra a venda no gateway SGF** (`api-sgf-gateway.triersistemas.com.br/sgfpod1`). O HTTP 200 com `statusPedido.codigo = 1 (PENDENTE)` significa:

> A venda foi **aceita e está na fila do gateway**, mas ainda **não foi importada/processada pelo SGF local da farmácia** (o servidor da loja). O mapa de status usado no código (`STATUS_MAP` em `supabase/functions/trier/index.ts`) é: 1 pendente → 2 disponível p/ retirada → 5 em entrega → 3 entregue (ou 4 cancelado).

Ou seja: **PENDENTE é o estado inicial normal** — não é erro de payload nem de pagamento (o pagamento já foi enviado com `pagamentoRealizado: true`, modo `site_pix_card`).

### Condições para a venda sair de PENDENTE / ser importada no ERP

1. **SGF local da loja online e conectado ao gateway.** Quando o SGF está fora, a API responde HTTP 545/554 (erro já visto neste projeto). O envio às 20:13 retornou 200, ou seja, o gateway aceitou — mas a importação depende do SGF da loja buscar/processar a venda e-commerce pendente.
2. **Rotina de importação de vendas e-commerce ativa no SGF.** A venda só avança de `1 (PENDENTE)` quando o SGF importa/efetiva o pedido (separação, impressão, baixa). Enquanto isso não ocorre, ela permanece PENDENTE no gateway indefinidamente.
3. **Não é necessário (nem recomendado) reenviar.** O `numeroPedido` já está registrado; reenvio com `force` corre risco de gerar nota duplicada.

## 3. Como a consulta (`consult-trier-ecommerce-sale`) deve ser usada para este pedido

Uso correto (já suportado pelo código atual):

- **Pelo admin:** Admin → Trier → Vendas E-commerce → botão "Consultar" do pedido. A função recebe `{ order_id }`, resolve `numeroPedido` a partir de `orders.trier_order_id` (= 7125043194) e chama `GET /rest/integracao/venda/ecommerce/consultar-venda-v1?numeroPedido=7125043194`.
- Também aceita diretamente `{ numeroPedido: "7125043194" }` ou `{ numeroNota: "250416" }`.
- A função grava o resultado em `trier_order_logs` (`action: consult_sale`) e atualiza `trier_last_status_check_at`. Ela **não** atualiza `trier_status` do pedido — apenas reporta o retorno.
- A base da consulta (`trier_settings.base_url`) é a mesma do envio (gateway sgfpod1) — confirmado, sem divergência de URL.

## 4. Falha encontrada: a consulta automática nunca vai funcionar para este pedido

O agendador (`trier` → `actionCheckOrderStatus`, habilitado: `check_order_status_enabled = true`) monta a consulta assim:

```text
numerosPedidos=<UUID do pedido local>   (ex.: 7cdfff12-50eb-4319-b46e-...)
```

Mas o Trier só conhece o `numeroPedido` **numérico** enviado na venda (`7125043194`, salvo em `trier_order_id`). Resultado:

- O Trier não encontra nada para o UUID → resposta vazia → nada é atualizado.
- É exatamente o que se observa: pedido enviado há ~16h, `trier_status` travado em `"sent"` e `trier_last_status_check_at = null`.
- Causa raiz: convivem dois remetentes com convenções diferentes — `send-order-to-trier` envia `numeroPedido` numérico, enquanto o legado `actionSendOrder` (em `trier/index.ts`) usa o UUID; o verificador automático consulta pelo UUID, herdado da convenção antiga.

## 5. Ações corretivas propostas (NÃO executadas — aguardando aprovação)

1. Em `actionCheckOrderStatus` (`supabase/functions/trier/index.ts`): consultar usando `trier_order_id` (fallback para o ID curto numérico) em vez do UUID do pedido.
2. Opcional: fazer a consulta automática também persistir o código/descricao do `statusPedido` retornado pelo `consultar-venda-v1` (hoje ela lê `r.status ?? r.statusVenda`; vale confirmar o nome do campo real na resposta de consulta).
3. Operacional (fora do código): confirmar na loja se o SGF está online e se a importação de vendas e-commerce está rodando — é o que efetivamente tira a venda 250416 de PENDENTE no ERP.

## Detalhes técnicos

- Arquivos envolvidos: `supabase/functions/send-order-to-trier/index.ts` (envio, idempotência, lock), `supabase/functions/consult-trier-ecommerce-sale/index.ts` (consulta manual admin), `supabase/functions/trier/index.ts` (`actionCheckOrderStatus` linhas ~2369-2406, `STATUS_MAP` linha 2296), `src/pages/admin/AdminTrierEcommerceSales.tsx` (botão Consultar).
- Nenhuma linha foi alterada; nenhuma venda foi reenviada.
