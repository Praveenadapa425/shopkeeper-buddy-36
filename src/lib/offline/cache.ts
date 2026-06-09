import { supabase } from "@/integrations/supabase/client";
import { db, setMeta, type CachedCategory, type CachedProduct, type CachedVariant } from "./db";

/** Run `fetcher`; on success cache result via `persist`. On failure return cache via `read`. */
async function withCache<T>(
  fetcher: () => Promise<T>,
  persist: (data: T) => Promise<void>,
  read: () => Promise<T>,
): Promise<T> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    try {
      return await read();
    } catch {
      // fall through to network
    }
  }
  try {
    const data = await fetcher();
    persist(data).catch(() => {});
    return data;
  } catch (err) {
    try {
      const cached = await read();
      return cached;
    } catch {
      throw err;
    }
  }
}

// ---------- Categories ----------
export async function fetchCategories(): Promise<CachedCategory[]> {
  return withCache(
    async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as CachedCategory[];
    },
    async (rows) => {
      await db().transaction("rw", db().categories, async () => {
        await db().categories.clear();
        if (rows.length) await db().categories.bulkPut(rows);
      });
      await setMeta("lastSync:categories", Date.now());
    },
    async () => {
      const rows = await db().categories.toArray();
      return rows
        .filter((r) => !r.id.startsWith("temp_"))
        .concat(rows.filter((r) => r.id.startsWith("temp_")))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  );
}

// ---------- Products list (with variants joined) ----------
export type ProductRow = CachedProduct & { product_variants: { selling_price: number; sort_order: number }[] };

export async function fetchProducts(): Promise<ProductRow[]> {
  return withCache(
    async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at, product_variants(selling_price, sort_order)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
    async (rows) => {
      await db().transaction("rw", db().products, db().variants, async () => {
        // Replace non-dirty products
        const dirty = await db().products.where("_dirty").equals(1).toArray();
        const dirtyIds = new Set(dirty.map((d) => d.id));
        const serverProducts: CachedProduct[] = rows.map((r) => ({
          id: r.id,
          name: r.name,
          image_url: r.image_url,
          stock_qty: r.stock_qty,
          selling_price: r.selling_price,
          cost_price: r.cost_price,
          low_stock_threshold: r.low_stock_threshold,
          category_id: r.category_id,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));
        const keep = serverProducts.filter((p) => !dirtyIds.has(p.id));
        await db().products.clear();
        await db().products.bulkPut([...keep, ...dirty]);
      });
      await setMeta("lastSync:products", Date.now());
    },
    async () => {
      const products = await db().products.toArray();
      const variants = await db().variants.toArray();
      const byProduct = new Map<string, { selling_price: number; sort_order: number }[]>();
      for (const v of variants) {
        if (v._deleted) continue;
        const arr = byProduct.get(v.product_id) ?? [];
        arr.push({ selling_price: v.selling_price, sort_order: v.sort_order });
        byProduct.set(v.product_id, arr);
      }
      return products
        .filter((p) => !p._deleted)
        .map((p) => ({ ...p, product_variants: byProduct.get(p.id) ?? [] }))
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    },
  );
}

// ---------- Single product ----------
export async function fetchProduct(id: string): Promise<CachedProduct | null> {
  return withCache(
    async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CachedProduct | null;
    },
    async (row) => {
      if (row) await db().products.put(row);
    },
    async () => {
      const row = await db().products.get(id);
      return row && !row._deleted ? row : null;
    },
  );
}

// ---------- Variants for a product ----------
export async function fetchVariants(productId: string): Promise<CachedVariant[]> {
  return withCache(
    async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, product_id, value, cost_price, selling_price, stock_quantity, sort_order")
        .eq("product_id", productId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CachedVariant[];
    },
    async (rows) => {
      await db().transaction("rw", db().variants, async () => {
        const existing = await db().variants.where("product_id").equals(productId).toArray();
        const dirty = existing.filter((v) => v._dirty || v._deleted);
        const dirtyIds = new Set(dirty.map((d) => d.id));
        await db().variants.where("product_id").equals(productId).delete();
        await db().variants.bulkPut([...rows.filter((r) => !dirtyIds.has(r.id)), ...dirty]);
      });
    },
    async () => {
      const rows = await db().variants.where("product_id").equals(productId).toArray();
      return rows.filter((v) => !v._deleted).sort((a, b) => a.sort_order - b.sort_order);
    },
  );
}

// ---------- Single category ----------
export async function fetchCategory(id: string): Promise<CachedCategory | null> {
  return withCache(
    async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CachedCategory | null;
    },
    async (row) => {
      if (row) await db().categories.put(row);
    },
    async () => (await db().categories.get(id)) ?? null,
  );
}
