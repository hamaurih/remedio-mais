# Adaptadores de pagamento

O checkout usa uma rota de pagamento por organização, loja, método e moeda.
O Mercado Pago é apenas o primeiro adaptador. A escolha do provedor não fica
espalhada pelo storefront nem pelas tabelas de pedidos.

## Contrato

Cada adaptador declara:

- uma chave estável, como `mercado_pago`, `pagarme` ou `bank_api`;
- os métodos suportados, como `pix`, `credit_card`, `debit_card`,
  `boleto`, `open_finance` e `bank_transfer`;
- uma Edge Function de criação por método;
- normalização de resposta para `pix`, `redirect` ou
  `provider_response`;
- consulta de status, reembolso e verificação de webhook próprios.

O banco pode configurar prioridades e fallback, mas nunca pode indicar uma
função arbitrária. O registro de adaptadores permanece em código revisado.

## Adicionando um provedor

1. Criar uma Edge Function específica do provedor.
2. Usar idempotency key por tentativa de pagamento.
3. Validar o tenant novamente na função específica.
4. Registrar o adaptador em
   `supabase/functions/_shared/paymentProvider.ts`.
5. Cadastrar o provedor em `payment_providers`, armazenando somente os nomes
   dos Secrets.
6. Criar uma ou mais linhas em `payment_routes`.
7. Implementar webhook específico, com validação criptográfica antes de
   persistir eventos.
8. Implementar status e reembolso usando o tenant derivado do pedido.
9. Executar testes de sandbox, duplicidade, divergência de valor e isolamento
   entre lojas.

## Segurança

- Nunca armazenar PAN, CVV, senha, token bancário ou secret do provedor nas
  tabelas públicas.
- Preferir checkout hospedado, iframe/SDK tokenizado ou componentes fornecidos
  pelo adquirente.
- Não registrar payloads completos que possam conter dados de cartão.
- Separar Secrets de sandbox e produção.
- Webhooks são específicos por provedor porque cada assinatura possui formato
  próprio.
- Open Finance requer implementação homologada, OAuth/FAPI, consentimento e os
  testes aplicáveis; não deve ser tratado como um simples POST bancário.

Referências:

- PCI Security Standards Council: https://www.pcisecuritystandards.org/standards/
- Banco Central — Open Finance:
  https://www.bcb.gov.br/estabilidadefinanceira/openfinance
- Banco Central — Pix:
  https://www.bcb.gov.br/estabilidadefinanceira/pix
