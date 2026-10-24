# ERP Order Command — paridade com checkout

## Objetivo

Fechar a diferença funcional entre o Order Command e o checkout Cielo atual sem ativar o canário real.

## Escopo desta etapa

O novo contrato passa a representar:

- usuário autenticado;
- nome, e-mail, telefone e CPF;
- retirada ou entrega;
- endereço completo, coordenadas e frete;
- método Pix ou cartão Cielo;
- metadados Meta fbp/fbc;
- receita vinculada ao usuário e produto;
- condição de entrega da receita original;
- variante e rótulo da variante;
- preço validado no servidor;
- reserva de estoque por produto simples;
- reserva de estoque por variante;
- idempotência;
- kill switch.

## Variantes

A produção atual tem uma loja ativa e nenhum registro em `product_variants`. Mesmo assim, o banco passa a ter um modelo explícito:

- `variant_inventory_balances`;
- `variant_inventory_ledger`;
- `order_inventory_reservations.variant_id`.

Quando existe exatamente uma loja ativa de fulfillment por tenant, uma variante já existente pode ter seu saldo legado migrado com segurança. Em ambiente multi-loja a migration não inventa distribuição de estoque; o saldo por loja deverá ser carregado explicitamente.

O primeiro canário real continuará excluindo variantes. Isso reduz o raio de impacto inicial sem deixar a arquitetura incompleta.

## Receita

Para item controlado ou que exija receita, o RPC exige:

- `user_id`;
- `prescription_id`;
- mesma receita vinculada ao usuário;
- mesma receita vinculada ao produto;
- status de receita aceito pelo fluxo atual.

A necessidade da receita original é derivada no servidor, não confiada ao cliente.

## Cielo e reserva

A reserva agora é tratada nos pontos onde o status de pagamento realmente muda.

### Rejeição, cancelamento ou falha antes da cobrança

A reserva é liberada por `release_order_inventory_internal`.

### Aprovação

A reserva é consolidada por `commit_order_inventory_internal` antes do envio operacional ao Trier.

### Pix

A criação do QR não faz commit. Pix só consolida estoque quando webhook, consulta de status ou reconciliação oficial confirmar aprovação.

## Compatibilidade com pedidos legados

Os helpers de settlement também são chamados para pedidos legados. Como esses pedidos não possuem `order_inventory_reservations`, as funções retornam zero itens e o comportamento existente permanece inalterado.

## Falha de settlement após pagamento aprovado

Se a Cielo confirmar o pagamento e o commit de estoque falhar:

- o pagamento não é revertido automaticamente;
- um `payment_errors` é criado;
- o admin recebe aviso de revisão;
- o envio ao Trier é bloqueado naquele caminho;
- o pedido fica para reconciliação operacional.

Essa regra evita enviar ao ERP uma venda cujo estoque não foi consolidado.

## Canário

Esta branch não habilita execução real. O canário continua `off|observe`.

A progressão recomendada depois de homologação é:

1. 1% — retirada, produto simples, sem receita;
2. 5%;
3. 10%;
4. 25%;
5. 50%;
6. 100%.

A progressão depende de métricas de erro, divergência de estoque, duplicidade, falha Cielo e envio Trier, não apenas de tempo.
