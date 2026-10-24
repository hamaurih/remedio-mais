-- Clientes do e-commerce não recebem mais acesso PostgREST direto a dados pessoais.
-- O acesso do cliente passa exclusivamente pela Edge Function customer-account (service role + JWT revalidado).

DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;

DROP POLICY IF EXISTS "Customers manage own addresses" ON public.customer_addresses;

DROP POLICY IF EXISTS "orders_owner_read" ON public.orders;
DROP POLICY IF EXISTS "order_items_owner_read" ON public.order_items;
DROP POLICY IF EXISTS "Customers read own order_events" ON public.order_events;

DROP POLICY IF EXISTS "prescriptions_owner_read" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_owner_delete" ON public.prescriptions;

DROP POLICY IF EXISTS "user_roles_self_select" ON public.user_roles;

-- Perfis não têm tenant_id. Staff só pode ver clientes que possuam pedido em um tenant
-- onde o usuário seja gestor; platform staff mantém visão global operacional.
DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;
CREATE POLICY "profiles_tenant_staff_select"
ON public.profiles
FOR SELECT TO authenticated
USING (
  is_platform_staff(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.user_id = profiles.id
      AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager'])
  )
);

-- Endereços também são globais por customer_id; escopo é derivado dos pedidos do tenant.
DROP POLICY IF EXISTS "Admins view all addresses" ON public.customer_addresses;
CREATE POLICY "customer_addresses_tenant_staff_select"
ON public.customer_addresses
FOR SELECT TO authenticated
USING (
  is_platform_staff(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.user_id = customer_addresses.customer_id
      AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager'])
  )
);

DROP POLICY IF EXISTS "customer_addresses_seller_select" ON public.customer_addresses;
CREATE POLICY "customer_addresses_tenant_seller_select"
ON public.customer_addresses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.user_id = customer_addresses.customer_id
      AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller'])
      AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])
  )
);

-- user_roles é legado/global. Gestão direta da tabela fica restrita ao staff da plataforma.
-- Operações normais de tenant usam tenant_memberships/RPCs autorizados.
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_platform_staff_all"
ON public.user_roles
FOR ALL TO authenticated
USING (is_platform_staff(auth.uid()))
WITH CHECK (is_platform_staff(auth.uid()));
