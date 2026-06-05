
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  value text NOT NULL,
  selling_price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read product_variants" ON public.product_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert product_variants" ON public.product_variants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update product_variants" ON public.product_variants FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete product_variants" ON public.product_variants FOR DELETE TO authenticated USING (true);

CREATE INDEX product_variants_product_id_idx ON public.product_variants(product_id);

CREATE TRIGGER update_product_variants_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
