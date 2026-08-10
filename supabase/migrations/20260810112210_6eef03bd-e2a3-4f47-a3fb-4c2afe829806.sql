ALTER TABLE public.products DROP COLUMN discount_percentage;

ALTER TABLE public.products
  ADD COLUMN discount_percentage numeric(7,3)
  GENERATED ALWAYS AS (
    CASE
      WHEN price > 0 AND promo_price IS NOT NULL AND promo_price < price
        THEN round(((1)::numeric - (promo_price / price)) * 100, 3)
      ELSE 0
    END
  ) STORED;