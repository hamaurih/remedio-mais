UPDATE public.trier_settings SET check_order_status_enabled = true WHERE id = 1;

UPDATE public.orders
SET fulfillment_status = CASE
      WHEN status = 'em_separacao' THEN 'picking'
      WHEN status = 'pronto_retirada' THEN 'packed'
      WHEN status = 'saiu_para_entrega' THEN 'shipped'
      WHEN status IN ('entregue', 'retirado', 'finalizado') THEN 'delivered'
      WHEN status = 'cancelado' THEN 'cancelled'
      ELSE fulfillment_status
    END,
    delivery_status = CASE
      WHEN status = 'pronto_retirada' THEN 'pickup_ready'
      WHEN status = 'saiu_para_entrega' THEN 'out_for_delivery'
      WHEN status IN ('entregue', 'retirado', 'finalizado') THEN 'delivered'
      WHEN status = 'cancelado' THEN 'cancelled'
      ELSE delivery_status
    END
WHERE status IN ('em_separacao', 'pronto_retirada', 'saiu_para_entrega', 'entregue', 'retirado', 'finalizado', 'cancelado');