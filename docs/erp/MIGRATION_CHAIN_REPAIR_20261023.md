# Supabase Migration Chain Repair — 2026-10-23

## Objetivo

Restaurar a capacidade de criar Supabase Preview Branches a partir do zero com o mesmo schema da produção, antes de depender de branching no CI/CD.

## Sintomas

Preview branches apresentavam `MIGRATIONS_FAILED` ou aparentavam estar prontas antes de terminar o replay completo.

Foi confirmado que o status `FUNCTIONS_DEPLOYED` pode aparecer enquanto as migrations ainda estão sendo executadas. Portanto, status visual sozinho não é critério de aceite.

## Causas encontradas

### 1. Restore de produtos com FKs históricas

Migration removida do replay:

- `20260824185015 restore_backup_order_products_20260823`

Ela restaurava 64 produtos com `category_id` históricos que não existiam em uma base nova.

A migration seguinte:

- `20260824185307 restore_backup_missing_order_products_20260823`

contém os mesmos 64 produtos, usa `ON CONFLICT DO NOTHING` e não depende dos category IDs históricos.

Validação:
- 64 IDs na primeira;
- 64 IDs na segunda;
- diferença entre os conjuntos = 0.

O registro antigo foi preservado em backup privado antes do repair.

### 2. Índice único criado antes da deduplicação

Migration antiga:

- `20260830000522 fix_duplicate_prescription_notifications`

criava o índice único antes de limpar duplicatas existentes no replay.

Foi substituída por:

- `20261023231328 branch_safe_prescription_notification_v2`

A versão nova:
1. deduplica deterministicamente;
2. cria o índice;
3. recria a função de notificação com `ON CONFLICT DO NOTHING`.

### 3. Migration misturava correção pontual de produção com regra permanente

Migration antiga:

- `20261006141612 block_permanent_trier_product_inactive_errors`

continha UUIDs reais de produto/pedido e depois criava a regra permanente de bloqueio Trier.

Em uma branch limpa esses registros não existem, então o replay quebrava por FK.

Foi substituída pela migration genérica:

- `20261023231332 branch_safe_trier_inactive_guard_v2`

A correção de dados históricos continua efetivada na produção, mas não faz parte do replay de schema.

### 4. Primeira geração de migrations de repair dependia da estrutura interna do Supabase

As migrations v1 consultavam `supabase_migrations.schema_migrations` e esperavam colunas internas extras.

Em uma branch recém-criada essa tabela possui uma estrutura diferente durante o bootstrap.

As migrations v1 foram retiradas do replay e preservadas no backup. As migrations v2 são independentes da tabela interna.

## Resultado validado

Branch limpa utilizada para prova:

- `erp-ci-replay-proof-20261023`

Resultado final:
- migrations produção: **379**
- migrations branch: **379**
- última versão produção: `20261023231332`
- última versão branch: `20261023231332`
- missing in branch: **0**
- extra in branch: **0**

Schema funcional equivalente verificado:
- `inventory_balances`
- `inventory_ledger`
- `order_inventory_reservations`
- `accounts_payable`
- `accounts_receivable`
- `cart_funnel_sessions`
- `orders.source`
- `orders.external_idempotency_key`
- `orders.order_code`
- `orders.trier_eligible`
- `marketing_settings.ga_measurement_id`

Não houve erro inesperado de migration no replay completo.

O log `backup internal token missing` é operacional: secrets não são automaticamente herdados por preview branches. Ele não altera o schema nem invalida o replay.

## Política daqui para frente

1. Alterações de schema remoto somente por migration versionada.
2. Correções pontuais de dados de produção não podem ser misturadas com DDL reutilizável.
3. Migration de aplicação não consulta `supabase_migrations.schema_migrations`.
4. UUIDs reais de produção não entram em migrations reutilizáveis.
5. Dados de teste ficam em seed de staging/homologação.
6. Antes de considerar uma Preview Branch pronta, validar:
   - total de migrations;
   - última versão;
   - objetos obrigatórios do schema;
   - Postgres logs.
7. `FUNCTIONS_DEPLOYED` sozinho não é gate de completude.
8. Toda alteração em migration chain precisa ter rollback/backup auditável.

## Gate automático

O teste `src/test/supabaseMigrationReplayPolicy.test.ts` bloqueia novas migrations que:
- consultem a migration history interna do Supabase;
- executem DML operacional contendo UUID hard-coded sem exceção explicitamente revisada.

Isso transforma os erros encontrados nesta auditoria em regressões detectáveis pelo CI.
