-- Acesso global somente para platform_staff e ações administrativas auditadas.

drop policy if exists platform_staff_read on public.tenants;
create policy platform_staff_read on public.tenants for select to authenticated using (public.is_platform_staff(auth.uid()));
drop policy if exists platform_staff_read on public.stores;
create policy platform_staff_read on public.stores for select to authenticated using (public.is_platform_staff(auth.uid()));
drop policy if exists platform_staff_read on public.tenant_memberships;
create policy platform_staff_read on public.tenant_memberships for select to authenticated using (public.is_platform_staff(auth.uid()));

create or replace function public.platform_change_plan(p_tenant_id uuid,p_plan_code text,p_billing_cycle text default 'monthly')
returns void language plpgsql security definer set search_path='public' as $$
declare v_role text:=public.platform_role(auth.uid()); v_plan uuid; begin
 if v_role not in ('owner','admin','billing') then raise exception 'Acesso restrito'; end if;
 select id into v_plan from public.saas_plans where code=p_plan_code and active=true;
 if v_plan is null then raise exception 'Plano inválido'; end if;
 update public.tenant_subscriptions set status='cancelled',cancelled_at=now(),updated_at=now()
 where tenant_id=p_tenant_id and status in ('trialing','active','past_due','suspended');
 insert into public.tenant_subscriptions(tenant_id,plan_id,status,billing_cycle,started_at)
 values(p_tenant_id,v_plan,'active',case when p_billing_cycle in ('monthly','yearly','custom') then p_billing_cycle else 'monthly' end,now());
 insert into public.platform_audit_log(actor_user_id,action,target_type,target_id,tenant_id,details)
 values(auth.uid(),'tenant.plan_change','tenant',p_tenant_id,p_tenant_id,jsonb_build_object('plan_code',p_plan_code,'billing_cycle',p_billing_cycle));
end $$;
revoke all on function public.platform_change_plan(uuid,text,text) from public,anon;
grant execute on function public.platform_change_plan(uuid,text,text) to authenticated,service_role;

create or replace function public.platform_set_module_override(p_tenant_id uuid,p_module_code text,p_enabled boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='public' as $$
declare v_role text:=public.platform_role(auth.uid()); begin
 if v_role not in ('owner','admin') then raise exception 'Acesso restrito'; end if;
 if not exists(select 1 from public.saas_modules where code=p_module_code and active=true) then raise exception 'Módulo inválido'; end if;
 insert into public.tenant_module_overrides(tenant_id,module_code,enabled,reason,updated_at)
 values(p_tenant_id,p_module_code,p_enabled,p_reason,now())
 on conflict(tenant_id,module_code) do update set enabled=excluded.enabled,reason=excluded.reason,updated_at=now();
 insert into public.platform_audit_log(actor_user_id,action,target_type,target_id,tenant_id,details)
 values(auth.uid(),'tenant.module_override','tenant',p_tenant_id,p_tenant_id,jsonb_build_object('module',p_module_code,'enabled',p_enabled,'reason',p_reason));
end $$;
revoke all on function public.platform_set_module_override(uuid,text,boolean,text) from public,anon;
grant execute on function public.platform_set_module_override(uuid,text,boolean,text) to authenticated,service_role;

create or replace view public.platform_tenant_overview as
select t.id,t.name,t.slug,t.active,t.created_at,
       bp.legal_name,bp.cnpj,bp.contact_name,bp.contact_email,bp.contact_phone,bp.lifecycle_status,bp.onboarding_status,
       coalesce(sc.store_count,0) as store_count,
       coalesce(mc.member_count,0) as member_count,
       sub.status as subscription_status,sub.billing_cycle,p.id as plan_id,p.code as plan_code,p.name as plan_name
from public.tenants t
left join public.tenant_business_profiles bp on bp.tenant_id=t.id
left join lateral (select count(*)::int store_count from public.stores s where s.tenant_id=t.id) sc on true
left join lateral (select count(distinct tm.user_id)::int member_count from public.tenant_memberships tm where tm.tenant_id=t.id and tm.active=true) mc on true
left join lateral (select ts.* from public.tenant_subscriptions ts where ts.tenant_id=t.id and ts.status in ('trialing','active','past_due','suspended') order by ts.created_at desc limit 1) sub on true
left join public.saas_plans p on p.id=sub.plan_id;

alter view public.platform_tenant_overview set (security_invoker=true);
grant select on public.platform_tenant_overview to authenticated;
