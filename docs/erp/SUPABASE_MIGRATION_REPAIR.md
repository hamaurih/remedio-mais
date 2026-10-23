# Supabase Migration History Repair — 2026-10-23

## Problema

Preview branches estavam chegando a `MIGRATIONS_FAILED` durante o replay da cadeia de migrations.

A investigação confirmou que o problema estava no bloco histórico de recuperação de 24/08: migrations `restore_backup_*` restauravam dados de produção e dependiam de IDs que só existiam no banco original.

## Diagnóstico

Foram encontrados 119 migrations `restore_backup_*` no histórico remoto da produção.

Validação:
- 119 eram DML de recuperação de dados;
- 0 continham DDL estrutural `CREATE/ALTER/DROP/TRUNCATE`.

Logo, esses restores não eram necessários para reconstruir o schema de uma preview branch.

## Correção aplicada

Foi executada uma operação administrativa one-shot no histórico remoto:

1. os statements originais dos 119 restores foram arquivados em `private.migration_replay_archive_20261023`;
2. o acesso de `public`, `anon` e `authenticated` ao arquivo foi revogado;
3. o replay dos 119 restores foi substituído por `SELECT 1`;
4. a própria migration administrativa de reparo também foi neutralizada para replay futuro.

Importante: esta operação NÃO fica em `supabase/migrations`, porque migrations normais da aplicação não devem consultar `supabase_migrations.schema_migrations`.

## Efeito

A correção não remove usuários, pedidos, produtos ou logs já restaurados. Também não altera preço, estoque, Cielo, Trier ou o site. Ela muda somente o que futuras preview branches reexecutam.

## Política permanente

`supabase/migrations` deve conter somente schema, funções, policies, índices e alterações determinísticas.

Backup/restore operacional de dados de produção deve usar fluxo separado e nunca ser incluído no replay normal de CI/CD.

Os testes automatizados agora bloqueiam:
- arquivos `restore_backup_*` em `supabase/migrations`;
- INSERT direto em `auth.users` em migrations normais;
- migrations de aplicação acopladas a `supabase_migrations.schema_migrations`.

## Critério de aceite

O Supabase Branching só será considerado confiável para CI/CD automático quando uma preview branch nova completar:

`CREATING_PROJECT -> RUNNING_MIGRATIONS -> FUNCTIONS_DEPLOYED`

sem entrar em `MIGRATIONS_FAILED`.