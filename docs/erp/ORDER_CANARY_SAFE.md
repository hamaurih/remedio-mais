# ERP Order Canary — etapa segura

## Decisão

O checkout atual não será desviado para o ERP Core nesta etapa.

A razão é objetiva: o fluxo legado já trata variações, receitas, endereço/frete, metadados Meta e cleanup de falhas Cielo. O RPC homologado ainda não representa todos esses contratos. Trocar o caminho agora criaria risco operacional desnecessário.

## O que entra nesta etapa

1. Migration versionada do Order Command.
2. Segunda trava no banco:
   - flag `order_command_write` nasce desligada;
   - allowlist de canais também é conferida no RPC;
   - Edge Function continua com suas próprias flags e bloqueio de produção.
3. Canário de observação no checkout:
   - modo padrão: `off`;
   - modo permitido: `observe`;
   - modo `execute` é deliberadamente ignorado nesta fase;
   - rota real permanece sempre `legacy`.
4. Telemetria sem PII para medir elegibilidade.

## Elegibilidade inicial

Para o primeiro canário real futuro, entram apenas:

- canal site;
- retirada na loja;
- sem variação;
- sem medicamento controlado;
- sem receita;
- até 5 itens.

Entrega, variações e produtos regulados continuam obrigatoriamente no fluxo legado até paridade completa.

## Variáveis

- `ERP_ORDER_CANARY_MODE=off|observe`
- `ERP_ORDER_CANARY_PERCENT=0..100`
- `ERP_ORDER_CANARY_CHANNELS=site`
- `ERP_ORDER_CANARY_SALT=...`

Sem configuração, o comportamento permanece exatamente legado.

## Kill switch

Há duas camadas independentes:

### Edge
- `ERP_ORDER_COMMAND_ENABLED`
- `ERP_ORDER_COMMAND_ENV`
- `ERP_ORDER_COMMAND_ALLOWED_CHANNELS`

### Banco
Tabela `public.erp_runtime_flags`:
- `order_command_write.enabled=false` por padrão;
- `allowed_channels={}` por padrão.

Para o RPC gravar, as duas camadas precisam estar habilitadas.

## Próximo gate antes de execução real

Antes de qualquer percentual > 0 com escrita real:

1. ampliar o RPC para endereço/frete e vínculo do usuário;
2. preservar receita e condição de entrega;
3. definir suporte a variantes;
4. ajustar rollback Cielo para `release` antes de qualquer delete;
5. testar Pix e cartão em sandbox;
6. teste concorrente paralelo;
7. só então liberar um canário mínimo e reversível.
