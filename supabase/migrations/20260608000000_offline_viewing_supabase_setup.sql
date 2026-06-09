-- Offline viewing/Supabase validation additions for Shop Buddy.

-- Dedicated stock table. The app still keeps aggregate product stock and
-- variant stock for fast reads, while this table gives stock changes a
-- normalized home for future reporting and reconciliation.
CREATE TABLE IF NOT EXISTS public.inventory_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  location TEXT NOT NULL DEFAULT 'default',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, variant_id, location)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_stock TO authenticated;
GRANT ALL ON public.inventory_stock TO service_role;

ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated can read inventory_stock"
    ON public.inventory_stock FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated can insert inventory_stock"
    ON public.inventory_stock FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated can update inventory_stock"
    ON public.inventory_stock FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated can delete inventory_stock"
    ON public.inventory_stock FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS inventory_stock_product_id_idx
  ON public.inventory_stock(product_id);

CREATE INDEX IF NOT EXISTS inventory_stock_variant_id_idx
  ON public.inventory_stock(variant_id);

INSERT INTO public.inventory_stock (product_id, variant_id, quantity, location)
SELECT product_id, id, stock_quantity, 'default'
FROM public.product_variants
ON CONFLICT (product_id, variant_id, location) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  updated_at = now();

INSERT INTO public.inventory_stock (product_id, variant_id, quantity, location)
SELECT p.id, NULL, p.stock_qty, 'default'
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id
);

DO $$ BEGIN
  CREATE TRIGGER inventory_stock_updated_at
  BEFORE UPDATE ON public.inventory_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.inventory_stock REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_stock; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Ensure product image bucket exists. Existing object policies in earlier
-- migrations cover authenticated read/write access for this bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  false,
  1048576,
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
