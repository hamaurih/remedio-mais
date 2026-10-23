# ERP Order Omnichannel v1

## Objetivo

Transformar os pedidos existentes em um contrato único de ERP antes de mudar qualquer escrita.

## Fonte atual

A tabela `orders` já é o ponto comum do e-commerce e está preparada para os outros canais.

No baseline de 2026-10-23:
- 561 pedidos históricos em `orders`;
- todos os 561 são `sales_channel=site` / `source=site`;
- PDV e WhatsApp possuem código para criar pedidos, mas ainda não há histórico real desses canais nesta tabela.

## Contrato canônico

Todo pedido ERP passa a ser lido como:

- identidade: id + order_code;
- canal canônico;
- cliente;
- loja;
- subtotal/desconto/frete/total;
- pagamento;
- lifecycle operacional;
- integração Trier independente;
- itens;
- dados de receita quando aplicável.

## Princípio importante

Status comercial e integração não são a mesma coisa.

Exemplo:

```text
payment.status = approved
order_status = pago
trier.status = error
```

O pedido continua pago mesmo se a integração Trier falhar.

## Canais

- site
- pdv
- whatsapp_ia
- whatsapp_humano
- telefone
- b2b
- marketplace

## Nesta etapa

`erp-order-read` é admin-only e somente leitura.

Não:
- cria pedido;
- altera pedido;
- altera pagamento;
- baixa estoque;
- envia ao Trier;
- modifica PDV;
- modifica checkout;
- modifica WhatsApp.

## Próxima subfase

Depois da paridade read-only:
1. criar Order Command Service em homologação;
2. suportar idempotência;
3. validar preço/estoque server-side;
4. criar pedido em shadow sem substituir legado;
5. feature flag por canal;
6. Site será o último canal a sofrer cutover porque já vende em produção.
