insert into storage.buckets(id,name,public) values('store-compliance','store-compliance',false) on conflict(id) do update set public=false;

drop policy if exists "store compliance members read" on storage.objects;
create policy "store compliance members read" on storage.objects for select to authenticated using(bucket_id='store-compliance' and array_length(storage.foldername(name),1)>=2 and private.is_tenant_member(((storage.foldername(name))[1])::uuid,auth.uid()));

drop policy if exists "store compliance staff upload" on storage.objects;
create policy "store compliance staff upload" on storage.objects for insert to authenticated with check(bucket_id='store-compliance' and array_length(storage.foldername(name),1)>=2 and private.has_tenant_role(((storage.foldername(name))[1])::uuid,auth.uid(),array['owner','admin','manager','pharmacist','finance']));

drop policy if exists "store compliance staff update" on storage.objects;
create policy "store compliance staff update" on storage.objects for update to authenticated using(bucket_id='store-compliance' and array_length(storage.foldername(name),1)>=2 and private.has_tenant_role(((storage.foldername(name))[1])::uuid,auth.uid(),array['owner','admin','manager','pharmacist','finance'])) with check(bucket_id='store-compliance' and array_length(storage.foldername(name),1)>=2 and private.has_tenant_role(((storage.foldername(name))[1])::uuid,auth.uid(),array['owner','admin','manager','pharmacist','finance']));

drop policy if exists "store compliance admins delete" on storage.objects;
create policy "store compliance admins delete" on storage.objects for delete to authenticated using(bucket_id='store-compliance' and array_length(storage.foldername(name),1)>=2 and private.has_tenant_role(((storage.foldername(name))[1])::uuid,auth.uid(),array['owner','admin','manager']));
