
# Plano — Checkout Mercado Pago e fluxo de compra completo

Esta é uma mudança grande. Vou dividir em fases para entregar com segurança, sem quebrar home/Trier/banners. Quero sua confirmação antes de começar.

## Fase 1 — Banco de dados

Migrations:

1. **`orders`** — adicionar colunas:
   - `user_id`, `customer_email`, `customer_cpf`
   - `subtotal`, `discount`
   - `delivery_type` (`pickup`/`delivery`), `delivery_cep`, `delivery_street`, `delivery_number`, `delivery_complement`, `delivery_neighborhood`, `delivery_city`, `delivery_state`, `delivery_reference`, `delivery_fee`
   - `payment_gateway`, `payment_method` (`pix`/`credit_card`), `payment_status` (`pending`/`approved`/`rejected`/`cancelled`/`expired`/`refunded`)
   - `order_status` novo enum textual (`aguardando_pagamento`/`pago`/`em_separacao`/`pronto_para_retirada`/`saiu_para_entrega`/`entregue`/`cancelado`) — manter coluna `status` antiga como alias durante transição
   - `mercado_pago_preference_id`, `mercado_pago_payment_id`, `mercado_pago_order_id`, `mercado_pago_checkout_url`, `external_reference`
   - `paid_at`, `cancelled_at`
   - Ajustar policy de INSERT para exigir `auth.uid() = user_id` e `payment_status='pending'`

2. **`order_items`** — adicionar `product_image_url`, `total`, `requires_prescription`, `controlled`.

3. **`payment_events`** (nova) — `order_id`, `gateway`, `event_type`, `external_id` (unique), `payload jsonb`, `processed`.

4. **`admin_notifications`** (nova) — `type`, `title`, `message`, `order_id`, `read`.

5. **`payment_settings`** (nova, singleton) — `gateway`, `environment` (`sandbox`/`production`), `pix_enabled`, `credit_card_enabled`, `boleto_enabled`, `modo_integracao`. Token/secret ficam em **Secrets** (`MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_PUBLIC_KEY`), nunca na tabela.

6. **`prescriptions`** — adicionar `product_id`, `user_id`, `approved_at`. Status novos: `recebida`/`em_analise`/`aprovada`/`reprovada`.

7. Todas com GRANTs + RLS adequados.

## Fase 2 — Secrets e Edge Functions

Pedir via `add_secret`:
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_PUBLIC_KEY`
- `MERCADO_PAGO_WEBHOOK_SECRET`

Edge functions:
- **`create-mercado-pago-checkout`** — exige JWT, valida carrinho no banco, recalcula preços, bloqueia sem estoque e controlados sem receita aprovada, cria `order` com `payment_status=pending`, cria preference no MP (Pix ou Cartão), salva `preference_id`+`checkout_url`, retorna URL.
- **`mercado-pago-webhook`** (público, valida assinatura) — salva em `payment_events` (idempotente via `external_id` unique), busca pagamento na API MP, valida `external_reference` e valor, atualiza `payment_status`/`order_status`, cria `admin_notifications` em caso de approved.
- **`check-mercado-pago-status`** — consulta status sob demanda (página de retorno e admin).

## Fase 3 — Frontend público

- **`ProductCard`** + **`ProductQuickView`**: botão principal "Adicionar"; controlado/receita → "Enviar receita"; WhatsApp vira botão pequeno "Tirar dúvida". Sem estoque → não renderiza (filtro nas queries).
- Queries das prateleiras/categoria/busca/PromoMosaic/CampaignShelf: filtrar `stock > 0`.
- **`Cart`**: remover finalização WhatsApp; botão "Finalizar compra" → `/checkout`.
- **`Checkout`** (novo, multi-step):
  1. exige login (redireciona p/ `/auth?next=/checkout`)
  2. dados (nome/email/telefone/CPF — preenche do profile)
  3. entrega/retirada com CEP (ViaCEP) + endereço
  4. revisão
  5. método de pagamento Pix/Cartão → chama `create-mercado-pago-checkout` → redireciona p/ `init_point`
- **Páginas de retorno**: `/pedido/sucesso`, `/pedido/pendente`, `/pedido/falha` (todas usam `check-mercado-pago-status`).

## Fase 4 — Admin

- **`AdminPayments`** (novo) — configurar ambiente, toggles, botão "Testar conexão", aviso de que tokens vivem em Secrets.
- **`AdminOrders`** — adicionar colunas pagamento, endereço completo, MP IDs, botões "Verificar pagamento" / "Atualizar status" / "Enviar para Trier" (só após `approved`).
- **`AdminPrescriptions`** — fluxo `recebida`/`em_analise`/`aprovada`/`reprovada` vinculado a produto+usuário.
- **Sino de notificações** no header do admin lendo `admin_notifications`.

## Fase 5 — Trier e profile

- Bloquear envio para Trier enquanto `payment_status ≠ approved` (ajuste mínimo, sem mexer na integração em si).
- Adicionar `phone`, `cpf` em `profiles` para preencher checkout.

---

## Detalhes técnicos

- Mercado Pago via **Checkout Pro redirect** (`/checkout/v1/redirect?pref_id=...`), sem dados de cartão no nosso código.
- Webhook valida `x-signature` HMAC com `MERCADO_PAGO_WEBHOOK_SECRET`.
- Idempotência: `payment_events.external_id` UNIQUE + `processed` flag.
- `external_reference = order.id` para casar webhook ↔ pedido.
- Não removo a coluna `status` antiga de orders nesta fase para não quebrar AdminOrders/Trier; faço alias.

## Confirmações que preciso de você

1. Pode pedir os 3 secrets do Mercado Pago agora? (Access Token, Public Key, Webhook Secret — Sandbox primeiro)
2. CPF: obrigatório no cadastro ou só no checkout? Sugiro **só no checkout** (Pix exige; cartão pode exigir).
3. Frete: deixar fixo em `store_settings.delivery_fee` por enquanto (já existe), sem cálculo por CEP?
4. Posso entregar em duas mensagens (Fase 1+2 banco/backend → você confirma → Fase 3+4 front/admin)? Isso reduz risco.

Confirma para eu começar pela Fase 1 (migration).
