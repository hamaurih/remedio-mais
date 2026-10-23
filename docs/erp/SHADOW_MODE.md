# ERP Core — Shadow Mode

## Objetivo

Comparar o comportamento atual com o ERP Core sem alterar nenhuma operação.

## Escopo inicial

O comparador verifica por produto:

- preço Site;
- preço WhatsApp/IA;
- preço PDV;
- estoque;
- disponibilidade pública.

## Regra de segurança

Shadow Mode é somente leitura.

Ele não:
- atualiza produtos;
- muda preço;
- muda estoque;
- cria pedido;
- altera pagamento;
- envia venda ao Trier;
- interfere no checkout.

A Edge Function `erp-shadow-audit` exige usuário autenticado com papel `admin` e executa apenas SELECT.

## Baseline real antes da função

Em 2026-10-23 foi executada comparação read-only diretamente no banco:

- produtos avaliados: 55.580;
- produtos com `trier_stock_quantity`: 55.580;
- divergências entre estoque usado pelo site e estoque Trier: 0;
- divergências de estoque >= 2 unidades: 0.

## Critério para cutover futuro

Nenhum canal será transferido para o ERP Core apenas porque o código está pronto.

Antes do cutover:
1. executar Shadow Mode em todo o catálogo;
2. investigar toda divergência;
3. atingir equivalência definida;
4. testar pedidos sem escrita real;
5. ativar por feature flag;
6. manter rollback imediato.
