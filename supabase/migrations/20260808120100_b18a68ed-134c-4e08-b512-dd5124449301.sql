UPDATE public.products
   SET active = true
 WHERE GREATEST(COALESCE(stock,0), COALESCE(stock_quantity,0)) > 0
   AND active = false
   AND COALESCE(manual_disabled,false) = false
   AND (COALESCE(trier_active, true) = true OR COALESCE(force_active,false) = true);