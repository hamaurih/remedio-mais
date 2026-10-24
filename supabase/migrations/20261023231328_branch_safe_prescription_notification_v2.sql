with ranked as (
  select id,
         row_number() over (
           partition by metadata->>'prescription_id', type
           order by created_at asc, id asc
         ) as rn
  from public.admin_notifications
  where type='prescription_received'
    and metadata ? 'prescription_id'
)
delete from public.admin_notifications n
using ranked r
where n.id=r.id and r.rn>1;

create unique index if not exists admin_notifications_prescription_received_unique_idx
on public.admin_notifications ((metadata->>'prescription_id'), type)
where type='prescription_received' and metadata ? 'prescription_id';

create or replace function public.notify_new_prescription()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.admin_notifications(type,title,message,priority,role_target,metadata)
  values (
    'prescription_received',
    'Nova receita recebida',
    'Uma nova receita está aguardando análise.',
    'high',
    'admin',
    jsonb_build_object('prescription_id', new.id)
  )
  on conflict do nothing;
  return new;
end;
$function$;
