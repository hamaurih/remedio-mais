-- Notify administrators immediately when a new prescription arrives.
-- No prescription image, diagnosis or medication details are copied into the notification.

create or replace function public.notify_new_prescription()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  insert into public.admin_notifications(
    type,
    title,
    message,
    priority,
    role_target,
    metadata
  ) values (
    'prescription_received',
    'Nova receita recebida',
    'Uma nova receita está aguardando análise.',
    'high',
    'admin',
    jsonb_build_object('prescription_id', new.id)
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_new_prescription on public.prescriptions;
create trigger trg_notify_new_prescription
after insert on public.prescriptions
for each row
execute function public.notify_new_prescription();

revoke all on function public.notify_new_prescription() from public, anon, authenticated;
grant execute on function public.notify_new_prescription() to service_role;
