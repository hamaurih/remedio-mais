
ALTER TABLE public.promo_banner_blocks
  ADD COLUMN IF NOT EXISTS block_type text NOT NULL DEFAULT 'card_medio',
  ADD COLUMN IF NOT EXISTS image_position text NOT NULL DEFAULT 'direita',
  ADD COLUMN IF NOT EXISTS image_size text NOT NULL DEFAULT 'medio',
  ADD COLUMN IF NOT EXISTS show_text boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_price boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_cta boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bg_color text NOT NULL DEFAULT 'azul_claro',
  ADD COLUMN IF NOT EXISTS bg_custom text,
  ADD COLUMN IF NOT EXISTS cta_color text NOT NULL DEFAULT 'vermelho';
