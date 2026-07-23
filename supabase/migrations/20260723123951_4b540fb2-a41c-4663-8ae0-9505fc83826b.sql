
-- 1) Colunas Cielo em orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cielo_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS cielo_tid TEXT,
  ADD COLUMN IF NOT EXISTS cielo_authorization_code TEXT,
  ADD COLUMN IF NOT EXISTS cielo_proof_of_sale TEXT,
  ADD COLUMN IF NOT EXISTS cielo_status INT,
  ADD COLUMN IF NOT EXISTS installments INT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_code TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_code_base64 TEXT,
  ADD COLUMN IF NOT EXISTS pix_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_cielo_payment_id ON public.orders(cielo_payment_id);

-- 2) Adiciona registro/coluna auxiliar em payment_settings (colunas podem já existir)
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS installments_max INT DEFAULT 6,
  ADD COLUMN IF NOT EXISTS installments_no_interest_max INT DEFAULT 6;

-- Se existir registro id=1, atualiza para cielo/production por padrão (sem sobrescrever se o admin já escolheu outra coisa depois)
UPDATE public.payment_settings
  SET gateway = 'cielo',
      environment = 'production',
      installments_max = COALESCE(installments_max, 6),
      installments_no_interest_max = COALESCE(installments_no_interest_max, 6)
  WHERE id = 1;

INSERT INTO public.payment_settings (id, gateway, environment, pix_enabled, credit_card_enabled, boleto_enabled, installments_max, installments_no_interest_max)
  VALUES (1, 'cielo', 'production', true, true, false, 6, 6)
  ON CONFLICT (id) DO NOTHING;

-- 3) Atualiza guard_seller_order_update para bloquear alteração dos campos Cielo por vendedor
CREATE OR REPLACE FUNCTION public.guard_seller_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'seller') THEN
    IF NEW.total IS DISTINCT FROM OLD.total
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount IS DISTINCT FROM OLD.discount
       OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.payment_gateway IS DISTINCT FROM OLD.payment_gateway
       OR NEW.mercado_pago_payment_id IS DISTINCT FROM OLD.mercado_pago_payment_id
       OR NEW.mercado_pago_preference_id IS DISTINCT FROM OLD.mercado_pago_preference_id
       OR NEW.mercado_pago_order_id IS DISTINCT FROM OLD.mercado_pago_order_id
       OR NEW.mercado_pago_checkout_url IS DISTINCT FROM OLD.mercado_pago_checkout_url
       OR NEW.cielo_payment_id IS DISTINCT FROM OLD.cielo_payment_id
       OR NEW.cielo_tid IS DISTINCT FROM OLD.cielo_tid
       OR NEW.cielo_authorization_code IS DISTINCT FROM OLD.cielo_authorization_code
       OR NEW.cielo_status IS DISTINCT FROM OLD.cielo_status
       OR NEW.installments IS DISTINCT FROM OLD.installments
       OR NEW.card_brand IS DISTINCT FROM OLD.card_brand
       OR NEW.card_last4 IS DISTINCT FROM OLD.card_last4
       OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
       OR NEW.customer_cpf IS DISTINCT FROM OLD.customer_cpf
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.trier_sent IS DISTINCT FROM OLD.trier_sent
       OR NEW.trier_numero_nota IS DISTINCT FROM OLD.trier_numero_nota THEN
      RAISE EXCEPTION 'Vendedor não pode alterar campos financeiros/pagamento/Trier do pedido';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
