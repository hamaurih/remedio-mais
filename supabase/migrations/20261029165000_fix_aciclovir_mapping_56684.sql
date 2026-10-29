-- allow-production-data-migration after review.
-- Corrige exclusivamente o mapeamento local do ACICLOVIR 200MG C/25CP.
-- Correspondência comprovada por consulta Trier por EAN em 2026-10-29:
-- EAN 7896004770772 -> codigo 56684.
-- Não altera preço, estoque, nome, status comercial nem dados no Trier.

update public.products
set trier_product_id = '56684',
    trier_barcode = '7896004770772',
    mapping_status = 'mapped',
    needs_review = false,
    updated_at = now()
where id = '2a5e0213-1b7a-4cb0-a97f-3223bfeff4f8'
  and barcode = '7896004770772'
  and trier_product_id is null;
