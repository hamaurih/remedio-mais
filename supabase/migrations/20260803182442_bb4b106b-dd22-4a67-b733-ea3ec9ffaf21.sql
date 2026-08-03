CREATE TABLE public.home_custom_shelves (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shelf_key text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  badge text,
  background_variant text NOT NULL DEFAULT 'white',
  view_all_link text,
  max_items integer NOT NULL DEFAULT 12,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.home_custom_shelves TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_custom_shelves TO authenticated;
GRANT ALL ON public.home_custom_shelves TO service_role;

ALTER TABLE public.home_custom_shelves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active custom shelves"
ON public.home_custom_shelves FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE POLICY "Admins manage custom shelves"
ON public.home_custom_shelves FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_home_custom_shelves_updated_at
BEFORE UPDATE ON public.home_custom_shelves
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();