# ERP Order Command — Dry Run

## Objetivo

Simular a futura criação de pedidos pelo ERP Core sem gravar nenhuma venda.

## O dry-run valida

- canal;
- existência do produto;
- disponibilidade;
- estoque;
- preço efetivo do canal;
- preço esperado pelo cliente/tela;
- subtotal;
- desconto;
- frete;
- total.

## Regra crítica de preço

Para o canal Site, o dry-run usa o mesmo Product Service da etapa anterior.

Portanto:
- `site_price` manual é preservado;
- `site_promo_price` manual é preservado;
- Trier não escreve nesses campos;
- nenhuma rotina desta etapa recalcula `site_price`.

## O dry-run NÃO faz

- INSERT em orders;
- INSERT em order_items;
- reserva de estoque;
- baixa de estoque;
- pagamento;
- Cielo;
- Trier;
- envio de notificações.

## Uso

A Edge Function `erp-order-dry-run` é inicialmente admin-only e existe para homologação técnica.

Resultado:

```text
would_create_order = true | false
issues = [...]
writes = 0
```

## Próxima fase

Somente após paridade e homologação:
1. criar Command Service com persistência atrás de feature flag;
2. começar por um canal não crítico/teste;
3. idempotência obrigatória;
4. reserva de estoque;
5. pagamento desacoplado;
6. Site em produção será migrado por último.
