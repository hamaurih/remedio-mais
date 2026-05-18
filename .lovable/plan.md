Three workstreams to upgrade the Farmácia Atacadão e-commerce without rebuilding it. Items 1 and 2 are corrections to existing Trier code and shelves; item 3 is a new admin tool for creating banners with visual effects.

## 1. Trier sync corrections (`supabase/functions/trier/index.ts`)

- Strip `discount_percentage` from every insert/update payload (already partially done — audit the upsert helper to confirm no path writes it).
- Always persist `price` (preço de tabela) and `promo_price` (preço promocional quando houver). Never write a calculated discount column.
- Frontend already derives `% off` from `price`/`promo_price` in `ProductCard` — keep it that way.
- Ensure upsert by `trier_product_id` (and fallback `barcode`) actually creates new rows when none match — log the exact Postgres error to `trier_logs` when 0 created/0 updated.
- Auto-create category by slug using `nomeCategoria` → `nomeGrupo` → `nomeDepartamento`, then set `products.category_id` to the resulting id.
- Availability vs active:
  - `active` = `is_active` from Trier (do NOT flip to false on stock 0).
  - `stock` reflects Trier stock; the storefront treats `stock <= 0` as "Indisponível".
- Shelf auto-assignment (merge with manually selected shelves, don't overwrite):
  - `ofertas-da-semana` when `promo_price` < `price`.
  - `mais-vendidos` when Trier flags it as featured / top seller (fallback: `featured=true`).
  - `medicamentos-populares` from category/group keywords like "medicamento", "generico", "similar".
  - `higiene-e-beleza` from "higiene", "beleza", "perfumaria", "dermo".
  - `mamaes-e-bebes` from "mamãe", "bebê", "infantil", "fralda".
  - `vitaminas-e-suplementos` from "vitamina", "suplemento", "nutri".
  - `primeiros-socorros` from "curativo", "gaze", "antisséptico", "primeiros socorros".

## 2. Home/catalog display

- Confirm `ProductShelf` queries on the home page filter by `shelves @> ARRAY['<slug>']` AND `active = true` so the seven slugs above render Trier-synced items.
- `ProductCard` already handles `stock <= 0` ("Indisponível", disabled button) and prescription products (link to `/enviar-receita`). Verify both paths still work after the sync changes.
- Show original price, promo price and computed `-X%` badge from frontend math only.

## 3. New Admin → Banners → Gerador de Banner

New route `/admin/banners/gerador` (linked from the existing AdminBanners page).

Form inputs:
- Template picker: `hero-horizontal`, `promo-vertical`, `mosaic-small`, `campanha-tematica`, `card-produto`.
- Up to 4 product images (uploaded to the existing `banners` bucket).
- Title, subtitle, discount %, selo/tag, CTA label, CTA link, promo text.
- Effect toggles: gradiente, confetes, blocos de oferta, pedestal/sombra, selo de desconto.
- Placement target on save: `hero`, `mosaico`, `secundario`.

Rendering:
- Live React preview component (`BannerPreview`) that composes the chosen template with the toggled effects, using existing tokens (`--primary`, `--accent`, gradient utilities).
- On "Salvar", render the preview DOM to PNG via `html-to-image` and upload the PNG to the `banners` storage bucket, then insert a row in `banners` with `placement`, `title`, `subtitle`, `cta_text`, `link`, `image_url`, `mobile_image_url`, `active=true`. This way `HeroSlider` and `PromoMosaic` pick it up automatically — no schema changes needed.

Out of scope: changing the public home layout, the cart/checkout flow, or the admin shell.

## Technical notes

- Dependency to add: `html-to-image` (lightweight, no native deps) for client-side PNG capture.
- Reuse `supabase.storage.from('banners').upload(...)` and `getPublicUrl` exactly like `AdminBanners.tsx` already does.
- Templates implemented as small React components in `src/components/admin/banner-templates/` consuming a shared `BannerConfig` type.
- No DB migration required — the `banners` table already has every field we need.
- Trier edge function changes are localized to `upsertProductFromTrier` / category-link helper / shelf-assignment helper; no schema change.

## Files touched

- `supabase/functions/trier/index.ts` — sync fixes (1).
- `src/pages/admin/AdminBanners.tsx` — add link/tab to the generator (3).
- `src/pages/admin/AdminBannerGenerator.tsx` — new page (3).
- `src/components/admin/banner-templates/*.tsx` — 5 template components (3).
- `src/App.tsx` — register the new admin route (3).
- `package.json` — add `html-to-image` (3).
