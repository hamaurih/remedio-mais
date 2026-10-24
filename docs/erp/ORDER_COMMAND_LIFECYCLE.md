# ERP Order Command — lifecycle controlado

## Estado desta etapa

A camada oficial de comando de pedido continua isolada da produção e não substitui o checkout atual.

Branch: `erp-order-command-lifecycle`

Base: `erp-order-persistence-prep`

## Objetivo

Fechar o contrato de escrita do ERP Core antes de qualquer cutover do site:

1. precificar no servidor;
2. validar produto/estoque;
3. criar pedido e itens em transação única;
4. reservar estoque;
5. permitir commit da reserva;
6. permitir release da reserva;
7. liberar reserva vencida;
8. manter Cielo e Trier fora desta etapa.

## Guardas

A Edge Function só escreve quando todas as condições abaixo são verdadeiras:

- `ERP_ORDER_COMMAND_ENABLED=true`;
- `ERP_ORDER_COMMAND_ENV=staging`;
- project ref diferente da produção;
- usuário autenticado com role admin;
- canal presente em `ERP_ORDER_COMMAND_ALLOWED_CHANNELS`.

Sem allowlist de canal, nenhum canal é aceito.

## Preço

O cliente não define `unit_price`.

O comando consulta `products`, aplica o mesmo Product Read Model usado no dry-run e monta internamente o payload com o preço resolvido no servidor.

Para o canal site, `site_price` e `site_promo_price` continuam sendo campos manuais e não são sobrescritos pelo Trier.

`expected_unit_price` é apenas uma trava otimista: se o preço visto pelo cliente estiver diferente do preço atual, o pedido é recusado antes de qualquer escrita.

## Reserva

A RPC candidata:

- bloqueia `inventory_balances` em ordem estável;
- valida todos os itens antes do INSERT do pedido;
- cria pedido, itens, reservas e ledger na mesma transação;
- usa idempotência por `external_idempotency_key`;
- rejeita produto duplicado no payload;
- usa `fulfillment_policies.reservation_minutes`, com limite de 5 a 240 minutos.

## Lifecycle

A Edge Function de staging aceita quatro ações:

- `create`: cria pedido e reserva;
- `commit`: converte reserva ativa em venda no ledger;
- `release`: libera reserva por cancelamento, falha de pagamento, expiração ou teste;
- `expire_due`: libera em lote pedidos com reserva vencida.

A rotina `erp_expire_due_reservations` é service-role only e orquestra a função existente `release_order_inventory_internal`.

## Cutover

Nada nesta branch altera o checkout, o PDV ou o WhatsApp atuais.

O cutover futuro será por canal e por flag. A sequência recomendada é:

1. homologação isolada;
2. site em canário interno;
3. pequena parcela controlada;
4. expansão progressiva;
5. Cielo;
6. Trier;
7. desligamento do fluxo legado somente após reconciliação.

## Fora de escopo desta etapa

- ativar produção;
- chamar Cielo;
- enviar venda ao Trier;
- mudar preço do site;
- mudar layout;
- migrar todos os canais de uma vez;
- criar job de produção para expiração.

O job automático de produção só será criado depois da prova da rotina de expiração em homologação.
