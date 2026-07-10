
-- 1) Liberar o trier_product_id dos duplicados (evita colisão de unique se existir)
UPDATE public.products
   SET trier_product_id = NULL
 WHERE id IN (
   'c9342b23-39bb-4399-85e4-145035888655',
   '596d9f80-ef8d-4364-9e5a-c574bfa3b56e',
   'ad6f4367-6087-4f89-aa02-37b0a5f5ce95'
 );

-- 2) Remover os duplicados de origem Trier
DELETE FROM public.products
 WHERE id IN (
   'c9342b23-39bb-4399-85e4-145035888655',
   '596d9f80-ef8d-4364-9e5a-c574bfa3b56e',
   'ad6f4367-6087-4f89-aa02-37b0a5f5ce95'
 );

-- 3) Vincular o código Trier nos produtos manuais corretos
UPDATE public.products SET trier_product_id = '55407' WHERE id = '28f77327-6615-4082-adf4-b7904040d095';
UPDATE public.products SET trier_product_id = '55408' WHERE id = '2fcd464d-a22f-4942-bf41-9ad04ee6b751';
UPDATE public.products SET trier_product_id = '55409' WHERE id = '927e5676-d4eb-4a50-8a2f-64d8b620c040';
