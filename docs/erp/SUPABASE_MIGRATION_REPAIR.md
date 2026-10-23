# Supabase Migration History Repair — 2026-10-23

## Problema

Preview branches estavam chegando a `MIGRATIONS_FAILED` durante o replay da cadeia de migrations.

A investigação confirmou que o problema não estava no ERP Core novo. O bloco histórico de recuperação de 24/08 continha migrations `restore_backup_*` que restauravam dados de produção, incluindo usuários, pedidos, produtos, itens e logs.

Esses restores dependiam de IDs existentes no banco original. Em uma branch vazia, o replay podia encontrar FKs ausentes, por exemplo `products.category_id`.

## Diagnóstico

Foram encontrados 119 migrations `restore_backup_*` ainda registrados no histórico remoto.

Validação realizada:
- 119 são DML de recuperação de dados;
- 0 contêm DDL estrutural `CREATE/ALTER/DROP/TRUNCATE`.

Logo, eles não são necessários para reconstruir o schema de uma preview branch.

## Correção aplicada

Migration de produção: `20261023234259_neutralize_restore_backup_branch_replay`.

Ela:
1. cria `private.migration_replay_archive_20261023`;
2. arquiva os statements originais dos 119 restores;
3. remove acesso de `public/anon/authenticated` ao arquivo;
4. mantém version/name/status das migrations;
5. substitui apenas os statements de replay por um `SELECT 1` inofensivo.

## Efeito

A correção não remove usuários, não remove pedidos, não altera produtos, estoque, Trier, Cielo ou o site. Ela altera somente o que futuras preview branches reexecutam.

## Nova política

Recuperações de dados de produção não devem voltar a ser adicionadas em `supabase/migrations`.

`supabase/migrations` fica reservado para schema, funções, policies, índices e alterações determinísticas. Backup/restore operacional deve usar fluxo separado e nunca replay automático de CI/CD.

O teste `supabaseMigrationPolicy.test.ts` bloqueia arquivos `restore_backup_*` no diretório normal de migrations e INSERT direto em `auth.users` por migrations normais.

## Próxima validação

Criar uma preview branch descartável depois do reparo e exigir a sequência `CREATING_PROJECT -> RUNNING_MIGRATIONS -> FUNCTIONS_DEPLOYED`, sem `MIGRATIONS_FAILED`.

Somente após esse teste o Supabase Branching deve ser considerado confiável para CI/CD automático.