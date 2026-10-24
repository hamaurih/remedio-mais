
create schema if not exists backup_internal;
revoke all on schema backup_internal from public, anon, authenticated;

create table if not exists backup_internal.config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on backup_internal.config from public, anon, authenticated;

create table if not exists public.backup_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  timezone text not null default 'America/Fortaleza',
  daily_time text not null default '02:30',
  retention_daily integer not null default 7 check (retention_daily between 1 and 31),
  retention_weekly integer not null default 4 check (retention_weekly between 1 and 12),
  retention_monthly integer not null default 12 check (retention_monthly between 1 and 36),
  external_enabled boolean not null default false,
  external_provider text,
  external_folder_id text,
  external_folder_label text,
  last_success_at timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.backup_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('manual','automatic')),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed')),
  requested_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  retention_class text not null default 'daily' check (retention_class in ('daily','weekly','monthly')),
  retention_until timestamptz,
  tables_total integer not null default 0,
  tables_done integer not null default 0,
  db_artifacts integer not null default 0,
  media_artifacts integer not null default 0,
  total_bytes bigint not null default 0,
  external_status text not null default 'disabled' check (external_status in ('disabled','pending','syncing','completed','partial','failed')),
  manifest_path text,
  verified_at timestamptz,
  last_progress_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists backup_runs_created_at_idx on public.backup_runs(created_at desc);
create index if not exists backup_runs_status_idx on public.backup_runs(status, created_at desc);

create table if not exists public.backup_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backup_runs(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('database','auth','media','manifest')),
  source_name text not null,
  chunk_no integer not null default 0,
  storage_path text not null unique,
  row_count integer,
  object_count integer,
  bytes bigint not null default 0,
  sha256 text not null,
  offsite_status text not null default 'pending' check (offsite_status in ('pending','uploading','uploaded','failed','skipped')),
  drive_file_id text,
  drive_url text,
  offsite_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists backup_artifacts_run_idx on public.backup_artifacts(run_id, created_at);
create index if not exists backup_artifacts_offsite_idx on public.backup_artifacts(offsite_status, created_at);

create table if not exists public.backup_tasks (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.backup_runs(id) on delete cascade,
  task_type text not null check (task_type in ('database','auth','media')),
  source_name text not null,
  offset_no integer not null default 0,
  batch_size integer not null default 1000,
  priority integer not null default 50,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  attempts integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique(run_id, task_type, source_name, offset_no)
);

create index if not exists backup_tasks_pending_idx
  on public.backup_tasks(status, priority, created_at);

create table if not exists public.backup_table_registry (
  table_name text primary key,
  enabled boolean not null default true,
  priority integer not null default 50,
  notes text
);

insert into public.backup_table_registry(table_name,priority,notes) values
('products',10,'Catálogo principal'),
('categories',12,'Categorias'),
('subcategories',12,'Subcategorias'),
('departments',12,'Departamentos'),
('product_taxonomy',12,'Taxonomia'),
('product_related',12,'Relacionados'),
('product_variants',12,'Variações'),
('product_regulatory',12,'Dados regulatórios'),
('profiles',10,'Perfis de usuários'),
('user_roles',10,'Papéis e permissões'),
('customer_addresses',10,'Endereços de clientes'),
('orders',5,'Pedidos'),
('order_items',5,'Itens de pedidos'),
('order_events',6,'Histórico de pedidos'),
('order_inventory_reservations',6,'Reservas de estoque'),
('payment_events',6,'Eventos de pagamento'),
('payment_settings',8,'Configuração de pagamento'),
('payment_errors',20,'Erros de pagamento'),
('refund_requests',8,'Solicitações de reembolso'),
('refund_items',8,'Itens de reembolso'),
('prescriptions',5,'Receitas'),
('prescription_audit_events',6,'Auditoria de receitas'),
('prescription_regulatory',6,'Dados regulatórios de receitas'),
('dispensations',6,'Dispensações'),
('dispensation_items',6,'Itens de dispensação'),
('inventory_balances',7,'Saldo de estoque'),
('inventory_ledger',7,'Razão de estoque'),
('inventory_lots',8,'Lotes'),
('inventory_transfers',8,'Transferências'),
('inventory_transfer_items',8,'Itens de transferências'),
('stock_movements',8,'Movimentações de estoque'),
('store_product_prices',7,'Preços por loja'),
('product_price_history',12,'Histórico de preços'),
('stores',8,'Lojas'),
('store_settings',5,'Configuração da loja'),
('store_settings_public_cache',15,'Cache público das configurações'),
('store_legal_profiles',8,'Perfil legal'),
('store_compliance_documents',8,'Documentos de compliance'),
('store_compliance_requirement_catalog',8,'Requisitos de compliance'),
('store_technical_responsibilities',8,'Responsabilidades técnicas'),
('banners',10,'Banners'),
('home_layout',10,'Layout da home'),
('home_custom_shelves',10,'Prateleiras personalizadas'),
('home_shelf_items',10,'Itens das prateleiras'),
('home_mosaic_tiles',10,'Mosaicos'),
('menu_items',10,'Menus'),
('promo_banner_blocks',10,'Blocos promocionais'),
('suppliers',10,'Fornecedores'),
('supplier_products',10,'Produtos por fornecedor'),
('purchase_orders',10,'Pedidos de compra'),
('purchase_order_items',10,'Itens de pedidos de compra'),
('goods_receipts',10,'Recebimentos'),
('goods_receipt_items',10,'Itens de recebimento'),
('cash_register_sessions',8,'Sessões de caixa'),
('cash_movements',8,'Movimentos de caixa'),
('pos_terminals',8,'Terminais PDV'),
('pos_operators',8,'Operadores PDV'),
('pos_sales',6,'Vendas PDV'),
('pos_sale_items',6,'Itens de venda PDV'),
('pos_sale_payments',6,'Pagamentos PDV'),
('pos_delivery_quotes',12,'Cotações de entrega'),
('fiscal_documents',6,'Documentos fiscais'),
('fiscal_events',6,'Eventos fiscais'),
('regulatory_submissions',8,'Submissões regulatórias'),
('campaigns',12,'Campanhas'),
('campaign_products',12,'Produtos de campanhas'),
('marketing_settings',8,'Configurações de marketing'),
('tenants',8,'Empresas SaaS'),
('tenant_products',14,'Produtos por tenant'),
('tenant_memberships',8,'Membros dos tenants'),
('tenant_domains',8,'Domínios dos tenants'),
('tenant_subscriptions',8,'Assinaturas dos tenants'),
('tenant_business_profiles',8,'Perfis empresariais'),
('tenant_module_overrides',8,'Overrides de módulos'),
('tenant_onboarding_steps',12,'Onboarding'),
('saas_plans',12,'Planos SaaS'),
('saas_modules',12,'Módulos SaaS'),
('saas_plan_modules',12,'Módulos por plano'),
('platform_members',10,'Membros da plataforma'),
('fulfillment_policies',10,'Políticas de fulfillment'),
('integration_connectors',10,'Conectores'),
('integration_domain_ownership',10,'Domínios das integrações'),
('external_entity_mappings',18,'Mapeamentos externos'),
('trier_settings',10,'Configuração Trier'),
('trier_product_mappings',18,'Mapeamento de produtos Trier'),
('trier_category_mappings',18,'Mapeamento de categorias Trier'),
('trier_rotation_sync_state',18,'Estado de sincronização Trier'),
('trier_stock_sync_state',18,'Estado de estoque Trier'),
('trier_product_rotation',20,'Rotação Trier'),
('trier_sales_rotation_items',22,'Itens de rotação Trier'),
('admin_audit_log',8,'Auditoria administrativa'),
('admin_user_security_audit',8,'Auditoria de segurança de usuários'),
('platform_audit_log',8,'Auditoria da plataforma'),
('admin_notifications',20,'Notificações administrativas'),
('legacy_media_refs',8,'Referências de mídia legadas'),
('import_jobs',20,'Importações'),
('import_job_items',20,'Itens de importação')
on conflict (table_name) do update
set priority=excluded.priority, notes=excluded.notes;

insert into storage.buckets (id, name, public, file_size_limit)
values ('system-backups','system-backups',false,104857600)
on conflict (id) do update set public=false, file_size_limit=104857600;

alter table public.backup_settings enable row level security;
alter table public.backup_runs enable row level security;
alter table public.backup_artifacts enable row level security;
alter table public.backup_tasks enable row level security;
alter table public.backup_table_registry enable row level security;

revoke all on public.backup_settings from anon;
revoke all on public.backup_runs from anon;
revoke all on public.backup_artifacts from anon;
revoke all on public.backup_tasks from anon, authenticated;
revoke all on public.backup_table_registry from anon;

grant select, update on public.backup_settings to authenticated;
grant select on public.backup_runs to authenticated;
grant select on public.backup_artifacts to authenticated;
grant select on public.backup_table_registry to authenticated;
grant all on public.backup_settings, public.backup_runs, public.backup_artifacts, public.backup_tasks, public.backup_table_registry to service_role;

drop policy if exists "Admins manage backup settings" on public.backup_settings;
create policy "Admins manage backup settings" on public.backup_settings
for all to authenticated
using (public.has_role(auth.uid(),'admin'))
with check (public.has_role(auth.uid(),'admin'));

drop policy if exists "Admins view backup runs" on public.backup_runs;
create policy "Admins view backup runs" on public.backup_runs
for select to authenticated
using (public.has_role(auth.uid(),'admin'));

drop policy if exists "Admins view backup artifacts" on public.backup_artifacts;
create policy "Admins view backup artifacts" on public.backup_artifacts
for select to authenticated
using (public.has_role(auth.uid(),'admin'));

drop policy if exists "Admins view backup registry" on public.backup_table_registry;
create policy "Admins view backup registry" on public.backup_table_registry
for select to authenticated
using (public.has_role(auth.uid(),'admin'));

create or replace function public.backup_validate_internal_token(_token text)
returns boolean
language sql
security definer
set search_path = pg_catalog, backup_internal
as $$
  select exists(
    select 1 from backup_internal.config
    where key='internal_token' and value = _token
  );
$$;
revoke all on function public.backup_validate_internal_token(text) from public, anon, authenticated;
grant execute on function public.backup_validate_internal_token(text) to service_role;

create or replace function public.backup_claim_tasks(_limit integer default 3)
returns setof public.backup_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with picked as (
    select id
    from public.backup_tasks
    where status='pending'
    order by priority, created_at, id
    for update skip locked
    limit greatest(1, least(coalesce(_limit,3),10))
  )
  update public.backup_tasks t
     set status='running',
         attempts=t.attempts+1,
         started_at=now(),
         error_message=null
  where t.id in (select id from picked)
  returning t.*;
end;
$$;
revoke all on function public.backup_claim_tasks(integer) from public, anon, authenticated;
grant execute on function public.backup_claim_tasks(integer) to service_role;

create or replace function public.backup_export_table_chunk(
  _table text,
  _offset integer default 0,
  _limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _order_by text;
  _rows jsonb;
  _sql text;
  _safe_limit integer := greatest(1, least(coalesce(_limit,1000),2500));
  _safe_offset integer := greatest(0, coalesce(_offset,0));
begin
  if not exists (
    select 1 from public.backup_table_registry
    where table_name=_table and enabled
  ) then
    raise exception 'table_not_registered';
  end if;

  select string_agg(quote_ident(a.attname), ', ' order by x.n)
    into _order_by
  from pg_index i
  cross join lateral unnest(i.indkey) with ordinality x(attnum,n)
  join pg_attribute a on a.attrelid=i.indrelid and a.attnum=x.attnum
  where i.indrelid = format('public.%I',_table)::regclass
    and i.indisprimary;

  if _order_by is null then
    _order_by := 'ctid';
  end if;

  _sql := format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
       from (select * from public.%I order by %s offset %s limit %s) t',
    _table, _order_by, _safe_offset, _safe_limit
  );
  execute _sql into _rows;

  return jsonb_build_object(
    'table', _table,
    'offset', _safe_offset,
    'limit', _safe_limit,
    'count', jsonb_array_length(_rows),
    'rows', _rows
  );
end;
$$;
revoke all on function public.backup_export_table_chunk(text,integer,integer) from public, anon, authenticated;
grant execute on function public.backup_export_table_chunk(text,integer,integer) to service_role;

create or replace function public.backup_list_storage_objects(
  _bucket text,
  _offset integer default 0,
  _limit integer default 100
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, storage
as $$
  select jsonb_build_object(
    'bucket', _bucket,
    'offset', greatest(0,coalesce(_offset,0)),
    'limit', greatest(1,least(coalesce(_limit,100),300)),
    'count', count(*),
    'objects', coalesce(jsonb_agg(jsonb_build_object(
      'name', s.name,
      'updated_at', s.updated_at,
      'created_at', s.created_at,
      'size', case when (s.metadata->>'size') ~ '^[0-9]+$' then (s.metadata->>'size')::bigint else 0 end,
      'mimetype', s.metadata->>'mimetype',
      'etag', coalesce(s.metadata->>'eTag',s.metadata->>'etag','')
    ) order by s.name), '[]'::jsonb)
  )
  from (
    select *
    from storage.objects
    where bucket_id=_bucket
    order by name
    offset greatest(0,coalesce(_offset,0))
    limit greatest(1,least(coalesce(_limit,100),300))
  ) s;
$$;
revoke all on function public.backup_list_storage_objects(text,integer,integer) from public, anon, authenticated;
grant execute on function public.backup_list_storage_objects(text,integer,integer) to service_role;

create or replace function backup_internal.invoke(_action text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, backup_internal, net
as $$
declare
  _token text;
  _req bigint;
begin
  select value into _token from backup_internal.config where key='internal_token';
  if _token is null then
    raise exception 'backup internal token missing';
  end if;

  select net.http_post(
    url := 'https://jzltdocmvvdlyaukwzix.supabase.co/functions/v1/system-backup',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-backup-internal',_token
    ),
    body := jsonb_build_object('action',_action)
  ) into _req;
  return _req;
end;
$$;
revoke all on function backup_internal.invoke(text) from public, anon, authenticated;


-- Preview replay: backup cron jobs intentionally not scheduled.
