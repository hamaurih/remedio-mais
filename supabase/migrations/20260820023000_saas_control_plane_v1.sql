-- Control Plane SaaS: administração da plataforma acima dos tenants.
-- Aplicado somente no Supabase de homologação do ERP próprio.

create table if not exists public.platform_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','support','billing','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_platform_staff(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='public' as $$
  select exists(select 1 from public.platform_members pm where pm.user_id=_user_id and pm.active=true)
$$;
create or replace function public.platform_role(_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path='public' as $$
  select pm.role from public.platform_members pm where pm.user_id=_user_id and pm.active=true limit 1
$$;
revoke all on function public.is_platform_staff(uuid) from public, anon;
revoke all on function public.platform_role(uuid) from public, anon;
grant execute on function public.is_platform_staff(uuid) to authenticated, service_role;
grant execute on function public.platform_role(uuid) to authenticated, service_role;

create table if not exists public.saas_modules (
  code text primary key,
  name text not null,
  description text,
  category text not null default 'core',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  monthly_price numeric(12,2),
  yearly_price numeric(12,2),
  max_stores integer,
  max_users integer,
  is_internal boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saas_plan_modules (
  plan_id uuid not null references public.saas_plans(id) on delete cascade,
  module_code text not null references public.saas_modules(code) on delete cascade,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(plan_id,module_code)
);

create table if not exists public.tenant_business_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  legal_name text,
  cnpj text,
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_email text,
  website text,
  zip_code text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  country text not null default 'BR',
  lifecycle_status text not null default 'onboarding' check(lifecycle_status in ('lead','onboarding','trial','active','suspended','cancelled')),
  onboarding_status text not null default 'pending' check(onboarding_status in ('pending','in_progress','ready','completed','blocked')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id) on delete restrict,
  status text not null default 'trialing' check(status in ('trialing','active','past_due','suspended','cancelled')),
  billing_cycle text not null default 'monthly' check(billing_cycle in ('monthly','yearly','custom')),
  price_override numeric(12,2),
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancelled_at timestamptz,
  external_customer_id text,
  external_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenant_subscriptions_one_live_uq on public.tenant_subscriptions(tenant_id) where status in ('trialing','active','past_due','suspended');

create table if not exists public.tenant_module_overrides (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_code text not null references public.saas_modules(code) on delete cascade,
  enabled boolean not null,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,module_code)
);

create table if not exists public.tenant_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  step_code text not null,
  title text not null,
  status text not null default 'pending' check(status in ('pending','in_progress','completed','blocked','skipped')),
  sort_order integer not null default 100,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,step_code)
);

create table if not exists public.tenant_admin_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'owner',
  status text not null default 'pending' check(status in ('pending','sent','accepted','expired','cancelled')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenant_admin_invites_pending_email_uq on public.tenant_admin_invites(tenant_id,lower(email)) where status in ('pending','sent');

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  tenant_id uuid references public.tenants(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.platform_audit_immutable()
returns trigger language plpgsql set search_path='public' as $$ begin raise exception 'platform_audit_log é imutável'; end $$;
drop trigger if exists trg_platform_audit_immutable on public.platform_audit_log;
create trigger trg_platform_audit_immutable before update or delete on public.platform_audit_log for each row execute function public.platform_audit_immutable();

alter table public.platform_members enable row level security;
alter table public.saas_modules enable row level security;
alter table public.saas_plans enable row level security;
alter table public.saas_plan_modules enable row level security;
alter table public.tenant_business_profiles enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.tenant_module_overrides enable row level security;
alter table public.tenant_onboarding_steps enable row level security;
alter table public.tenant_admin_invites enable row level security;
alter table public.platform_audit_log enable row level security;

do $$ declare tbl text; begin
  foreach tbl in array array['platform_members','saas_modules','saas_plans','saas_plan_modules','tenant_business_profiles','tenant_subscriptions','tenant_module_overrides','tenant_onboarding_steps','tenant_admin_invites','platform_audit_log'] loop
    execute format('drop policy if exists platform_staff_all on public.%I',tbl);
    execute format('create policy platform_staff_all on public.%I for all to authenticated using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()))',tbl);
  end loop;
end $$;

insert into public.saas_modules(code,name,description,category,sort_order) values
('pdv','PDV','Caixa, sessões e venda presencial.','Operação',10),
('orders','Pedidos','Gestão de pedidos e separação.','Operação',20),
('inventory','Estoque','Saldo, lote, validade, inventário e ledger.','Operação',30),
('prescriptions','Receitas','Recebimento, análise e aprovação de receitas.','Regulatório',40),
('purchasing','Compras','Fornecedores, compras e recebimento.','Gestão',50),
('finance','Financeiro','Pagamentos, recebimentos e conciliação.','Gestão',60),
('bi','BI','Indicadores executivos, curva ABC e inteligência.','Gestão',70),
('ecommerce','E-commerce','Loja virtual, checkout e catálogo digital.','Digital',80),
('marketing','Marketing','Campanhas, ofertas e integrações de mídia.','Digital',90),
('multi_store','Multiunidade','Matriz, filiais, transferências e fulfillment.','Escala',100),
('fiscal','Fiscal','NF-e, NFC-e e eventos fiscais.','Fiscal',110),
('sngpc','SNGPC','Escrituração e controle regulatório aplicável.','Regulatório',120),
('sncr','SNCR','Preparação e integração com controle de receituários.','Regulatório',130),
('integrations','Integrações','Conectores externos, API e automações.','Plataforma',140),
('api','API','Acesso programático e integrações avançadas.','Plataforma',150)
on conflict(code) do update set name=excluded.name,description=excluded.description,category=excluded.category,sort_order=excluded.sort_order,active=true,updated_at=now();

insert into public.saas_plans(code,name,description,is_internal,active) values
('starter','Starter','Plano inicial para operação de uma unidade.',false,true),
('professional','Professional','Plano para operação completa e crescimento.',false,true),
('enterprise','Enterprise','Plano avançado para redes e integrações.',false,true),
('pilot','Piloto interno','Plano interno de validação com todos os módulos.',true,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,is_internal=excluded.is_internal,active=true,updated_at=now();

insert into public.saas_plan_modules(plan_id,module_code,enabled)
select p.id,m.code,true from public.saas_plans p cross join public.saas_modules m where p.code='pilot'
on conflict(plan_id,module_code) do update set enabled=true;
insert into public.saas_plan_modules(plan_id,module_code,enabled)
select p.id,m.code,true from public.saas_plans p join public.saas_modules m on m.code in ('pdv','orders','inventory','prescriptions','purchasing','finance','bi') where p.code='starter'
on conflict(plan_id,module_code) do update set enabled=true;
insert into public.saas_plan_modules(plan_id,module_code,enabled)
select p.id,m.code,true from public.saas_plans p join public.saas_modules m on m.code in ('pdv','orders','inventory','prescriptions','purchasing','finance','bi','ecommerce','marketing','multi_store','integrations') where p.code='professional'
on conflict(plan_id,module_code) do update set enabled=true;
insert into public.saas_plan_modules(plan_id,module_code,enabled)
select p.id,m.code,true from public.saas_plans p cross join public.saas_modules m where p.code='enterprise'
on conflict(plan_id,module_code) do update set enabled=true;

create or replace function public.platform_create_company(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare
  v_actor uuid := auth.uid(); v_role text; v_tenant uuid; v_store uuid; v_plan uuid;
  v_name text := nullif(trim(p_payload->>'name'),'');
  v_slug text := lower(regexp_replace(coalesce(nullif(trim(p_payload->>'slug'),''),nullif(trim(p_payload->>'name'),'')),'[^a-zA-Z0-9]+','-','g'));
  v_admin_email text := lower(nullif(trim(p_payload->>'admin_email'),''));
  v_plan_code text := coalesce(nullif(trim(p_payload->>'plan_code'),''),'starter');
begin
  select public.platform_role(v_actor) into v_role;
  if v_role not in ('owner','admin') then raise exception 'Acesso restrito ao administrador da plataforma'; end if;
  if v_name is null then raise exception 'Nome da empresa é obrigatório'; end if;
  v_slug := trim(both '-' from v_slug);
  if length(v_slug)<3 then raise exception 'Slug inválido'; end if;
  if exists(select 1 from public.tenants where slug=v_slug) then raise exception 'Identificador da empresa já existe'; end if;
  select id into v_plan from public.saas_plans where code=v_plan_code and active=true;
  if v_plan is null then raise exception 'Plano inválido'; end if;

  insert into public.tenants(name,slug,active) values(v_name,v_slug,false) returning id into v_tenant;
  insert into public.tenant_business_profiles(tenant_id,legal_name,cnpj,contact_name,contact_email,contact_phone,billing_email,website,zip_code,street,number,complement,neighborhood,city,state,lifecycle_status,onboarding_status,notes)
  values(v_tenant,p_payload->>'legal_name',p_payload->>'cnpj',p_payload->>'contact_name',p_payload->>'contact_email',p_payload->>'contact_phone',p_payload->>'billing_email',p_payload->>'website',p_payload->>'zip_code',p_payload->>'street',p_payload->>'number',p_payload->>'complement',p_payload->>'neighborhood',p_payload->>'city',p_payload->>'state','onboarding','in_progress',p_payload->>'notes');
  insert into public.stores(tenant_id,name,code,cnpj,legal_name,address,active,store_type,is_headquarters,delivery_enabled,pickup_enabled,ecommerce_fulfillment_enabled,operation_status,compliance_enforced)
  values(v_tenant,coalesce(nullif(p_payload->>'headquarters_name',''),v_name),'MATRIZ',p_payload->>'cnpj',p_payload->>'legal_name',concat_ws(', ',p_payload->>'street',p_payload->>'number',p_payload->>'neighborhood',p_payload->>'city',p_payload->>'state'),false,'headquarters',true,false,false,false,'legalization',true)
  returning id into v_store;
  insert into public.tenant_subscriptions(tenant_id,plan_id,status,billing_cycle,trial_ends_at)
  values(v_tenant,v_plan,'trialing',coalesce(nullif(p_payload->>'billing_cycle',''),'monthly'),case when (p_payload->>'trial_days')~'^[0-9]+$' then now()+((p_payload->>'trial_days')::int||' days')::interval else null end);
  insert into public.tenant_onboarding_steps(tenant_id,step_code,title,sort_order) values
  (v_tenant,'business_profile','Dados empresariais',10),(v_tenant,'headquarters','Matriz e endereço',20),(v_tenant,'admin_invite','Administrador da empresa',30),(v_tenant,'compliance','Regularização sanitária e CRF',40),(v_tenant,'fiscal','Configuração fiscal',50),(v_tenant,'payments','Meios de pagamento',60),(v_tenant,'catalog','Catálogo e estoque inicial',70),(v_tenant,'ecommerce','E-commerce e domínio',80),(v_tenant,'go_live','Validação para entrada em operação',90);
  if v_admin_email is not null then
    insert into public.tenant_admin_invites(tenant_id,email,full_name,role,status,invited_by)
    values(v_tenant,v_admin_email,p_payload->>'admin_name','owner','pending',v_actor);
  end if;
  insert into public.platform_audit_log(actor_user_id,action,target_type,target_id,tenant_id,details)
  values(v_actor,'tenant.create','tenant',v_tenant,v_tenant,jsonb_build_object('name',v_name,'slug',v_slug,'plan',v_plan_code,'headquarters_store_id',v_store));
  return jsonb_build_object('tenant_id',v_tenant,'store_id',v_store,'slug',v_slug,'admin_invite_pending',v_admin_email is not null);
end $$;
revoke all on function public.platform_create_company(jsonb) from public,anon;
grant execute on function public.platform_create_company(jsonb) to authenticated,service_role;

create or replace function public.platform_set_tenant_status(p_tenant_id uuid,p_status text)
returns void language plpgsql security definer set search_path='public' as $$
declare v_role text:=public.platform_role(auth.uid()); begin
 if v_role not in ('owner','admin') then raise exception 'Acesso restrito'; end if;
 if p_status not in ('onboarding','trial','active','suspended','cancelled') then raise exception 'Status inválido'; end if;
 update public.tenant_business_profiles set lifecycle_status=p_status,updated_at=now() where tenant_id=p_tenant_id;
 update public.tenants set active=(p_status in ('trial','active')),updated_at=now() where id=p_tenant_id;
 insert into public.platform_audit_log(actor_user_id,action,target_type,target_id,tenant_id,details) values(auth.uid(),'tenant.status_change','tenant',p_tenant_id,p_tenant_id,jsonb_build_object('status',p_status));
end $$;
revoke all on function public.platform_set_tenant_status(uuid,text) from public,anon;
grant execute on function public.platform_set_tenant_status(uuid,text) to authenticated,service_role;

-- Bootstrap SOMENTE para homologação. Substituir por conta exclusiva antes do go-live do Control Plane.
insert into public.platform_members(user_id,role,active)
select 'f38e5f4b-62ed-4e26-9b7e-b43e4dd8ce81'::uuid,'owner',true
where exists(select 1 from auth.users where id='f38e5f4b-62ed-4e26-9b7e-b43e4dd8ce81'::uuid)
on conflict(user_id) do update set role='owner',active=true,updated_at=now();

-- Atacadão é cliente piloto; nenhum preço comercial é assumido.
insert into public.tenant_business_profiles(tenant_id,lifecycle_status,onboarding_status,contact_email)
select t.id,'active','in_progress','vendedor01@atacadaodosmedicamentos.com' from public.tenants t where t.slug='atacadao-dos-medicamentos'
on conflict(tenant_id) do update set lifecycle_status='active',updated_at=now();
insert into public.tenant_subscriptions(tenant_id,plan_id,status,billing_cycle,price_override)
select t.id,p.id,'active','custom',0 from public.tenants t cross join public.saas_plans p where t.slug='atacadao-dos-medicamentos' and p.code='pilot'
on conflict do nothing;
