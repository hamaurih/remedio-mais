# ERP Order Persistence — preparação segura

## Estado

Código preparado, mas NÃO implantado em produção.

## Homologação

A branch Supabase antiga está com `MIGRATIONS_FAILED` e não será usada para novas escritas.

Uma nova branch limpa deverá ser criada a partir da produção atual antes de testar persistência.

## Custo informado pelo Supabase

A criação de uma nova branch custa US$ 0,01344 por hora enquanto existir.
A criação depende de confirmação explícita do usuário.

## Guardas de segurança

A função `erp-order-command-staging` só aceita escrita quando:

1. `ERP_ORDER_COMMAND_ENABLED=true`;
2. `ERP_ORDER_COMMAND_ENV=staging`;
3. o project ref NÃO é o projeto de produção `jzltdocmvvdlyaukwzix`;
4. o chamador é admin autenticado;
5. a RPC transacional está instalada.

Mesmo que a Edge Function seja implantada por engano no projeto de produção, a guarda `production_blocked` impede a operação.

## Transação candidata

`erp_create_order_with_reservation(jsonb)`:

- SECURITY INVOKER;
- execução exclusiva de `service_role`;
- idempotência por `external_idempotency_key`;
- valida loja/tenant;
- bloqueia saldos em ordem estável;
- valida todos os itens;
- cria pedido;
- cria itens;
- cria reserva;
- grava ledger `reservation`;
- trigger existente atualiza `inventory_balances.reserved`;
- qualquer erro faz rollback da transação inteira.

## Importante

Nesta primeira homologação:
- pedidos são `pending`;
- `trier_eligible=false`;
- não há Cielo;
- não há Trier;
- não há publicação no site;
- não há cliente real.

Depois de validar reserva/commit/release/idempotência, a integração com pagamento será desenhada separadamente.
