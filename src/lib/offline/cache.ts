import { supabase } from "@/integrations/supabase/client";
import {
  db,
  setMeta,
  getMeta,
  type CachedCategory,
  type CachedProduct,
  type CachedVariant,
} from "./db";
import {
  cacheCategories,
  cacheProducts,
  cacheStock,
  cacheVariants,
  queueThumbnailPreload,
  cacheSingleProduct,
  type CacheStats,
} from "@/lib/offlineCache";

/** Run `fetcher`; on success cache result via `persist`. On failure return cache via `read`. */
async function withCache<T>(
  fetcher: () => Promise<T>,
  persist: (data: T) => Promise<void>,
  read: () => Promise<T>,
): Promise<T> {
  return read();
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
export type ProductRow = CachedProduct & {
  product_variants: { selling_price: number; sort_order: number }[];
};

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

// ---------- Background Sync Functions ----------

export async function syncCatalogData(): Promise<void> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    return;
  }
  console.log("[Offline Cache] syncCatalogData starting background fetch...");

  try {
    const [catRes, prodRes, varRes, stockRes] = await Promise.all([
      supabase.from("categories").select("id, name").order("name"),
      supabase
        .from("products")
        .select(
          "id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("product_variants")
        .select("id, product_id, value, cost_price, selling_price, stock_quantity, sort_order")
        .order("sort_order"),
      supabase
        .from("inventory_stock")
        .select("id, product_id, variant_id, quantity, location, updated_at"),
    ]);

    if (catRes.error) throw catRes.error;
    if (prodRes.error) throw prodRes.error;
    if (varRes.error) throw varRes.error;
    if (stockRes.error) throw stockRes.error;

    const categories = catRes.data ?? [];
    const products = prodRes.data ?? [];
    const variants = varRes.data ?? [];
    const stock = stockRes.data ?? [];

    console.log(
      `[Offline Cache] Supabase fetch completed. Fetched: ${categories.length} categories, ${products.length} products, ${variants.length} variants, ${stock.length} stock rows.`,
    );

    // Update Dexie database (shop-inventory-offline)
    await db().transaction("rw", db().categories, async () => {
      await db().categories.clear();
      if (categories.length) await db().categories.bulkPut(categories);
    });
    await setMeta("lastSync:categories", Date.now());
    console.log(
      `[Offline Cache] Categories successfully written to Dexie. Total: ${categories.length}`,
    );

    await db().transaction("rw", db().products, async () => {
      const dirty = await db().products.where("_dirty").equals(1).toArray();
      const dirtyIds = new Set(dirty.map((d) => d.id));
      const keep = products.filter((p) => !dirtyIds.has(p.id));
      await db().products.clear();
      await db().products.bulkPut([...keep, ...dirty]);
    });
    await setMeta("lastSync:products", Date.now());
    console.log(
      `[Offline Cache] Products successfully written to Dexie. Total: ${products.length}`,
    );

    await db().transaction("rw", db().variants, async () => {
      const dirty = await db()
        .variants.filter((v) => !!(v._dirty || v._deleted))
        .toArray();
      const dirtyIds = new Set(dirty.map((d) => d.id));
      const keep = variants.filter((v) => !dirtyIds.has(v.id));
      await db().variants.clear();
      await db().variants.bulkPut([...keep, ...dirty]);
    });
    console.log(
      `[Offline Cache] Variants successfully written to Dexie. Total: ${variants.length}`,
    );

    // Keep Dexie meta stats updated
    const now = Date.now();
    await setMeta("totalProductsCount", String(products.length));
    await setMeta("lastSyncAt", now);
    console.log(
      `[Offline Cache] Metadata successfully updated: totalProductsCount = ${products.length}, lastSyncAt = ${new Date(now).toISOString()}`,
    );

    // Update raw IndexedDB database (shop-buddy-offline)
    const cachedProducts = products.map((p) => ({
      id: p.id,
      name: p.name,
      category_id: p.category_id,
      image_url: p.image_url,
      stock_qty: p.stock_qty,
      selling_price: p.selling_price,
      cost_price: p.cost_price,
      low_stock_threshold: p.low_stock_threshold,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));
    const cachedCategories = categories.map((c) => ({
      id: c.id,
      name: c.name,
    }));
    const cachedVariants = variants.map((v) => ({
      id: v.id,
      product_id: v.product_id,
      value: v.value,
      selling_price: v.selling_price,
      cost_price: v.cost_price,
      stock_quantity: v.stock_quantity,
      sort_order: v.sort_order,
    }));
    const cachedStock = stock.map((s) => ({
      id: s.id,
      product_id: s.product_id,
      variant_id: s.variant_id,
      quantity: s.quantity,
      location: s.location,
      updated_at: s.updated_at,
    }));

    await cacheCategories(cachedCategories);
    await cacheVariants(cachedVariants);
    await cacheStock(cachedStock);
    await cacheProducts(cachedProducts); // Updates raw IndexedDB metadata, triggers stats update event
    console.log(
      `[Offline Cache] Raw IndexedDB stores (categories, variants, stock, products) updated successfully.`,
    );

    // Queue thumbnail preload
    console.log(
      `[Offline Cache] Queuing preload of ${cachedProducts.filter((p) => p.image_url).length} thumbnails...`,
    );
    void queueThumbnailPreload(cachedProducts);
  } catch (error) {
    console.error("[Offline Cache] Error during background synchronization:", error);
    throw error;
  }
}

export async function syncProductData(productId: string): Promise<void> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    return;
  }
  console.log(`[Offline Cache] syncProductData starting for ${productId}...`);

  try {
    const [prodRes, varRes] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at",
        )
        .eq("id", productId)
        .maybeSingle(),
      supabase
        .from("product_variants")
        .select("id, product_id, value, cost_price, selling_price, stock_quantity, sort_order")
        .eq("product_id", productId)
        .order("sort_order"),
    ]);

    if (prodRes.error) throw prodRes.error;
    if (varRes.error) throw varRes.error;

    const product = prodRes.data;
    const variants = varRes.data ?? [];

    if (!product) {
      const existing = await db().products.get(productId);
      if (existing && !existing._dirty) {
        await db().transaction("rw", db().products, db().variants, async () => {
          await db().products.delete(productId);
          await db().variants.where("product_id").equals(productId).delete();
        });
      }
      return;
    }

    // Update Dexie database
    await db().transaction("rw", db().products, db().variants, async () => {
      const existing = await db().products.get(productId);
      if (!existing || !existing._dirty) {
        await db().products.put(product as CachedProduct);
      }
      const existingVars = await db().variants.where("product_id").equals(productId).toArray();
      const dirtyVars = existingVars.filter((v) => v._dirty || v._deleted);
      const dirtyIds = new Set(dirtyVars.map((d) => d.id));
      await db().variants.where("product_id").equals(productId).delete();
      await db().variants.bulkPut([...variants.filter((v) => !dirtyIds.has(v.id)), ...dirtyVars]);
    });
    console.log(
      `[Offline Cache] Single product data successfully synced to Dexie for: ${productId}`,
    );

    // Update raw IndexedDB using custom helper
    const cachedProduct = {
      id: product.id,
      name: product.name,
      category_id: product.category_id,
      image_url: product.image_url,
      stock_qty: product.stock_qty,
      selling_price: product.selling_price,
      cost_price: product.cost_price,
      low_stock_threshold: product.low_stock_threshold,
      created_at: product.created_at,
      updated_at: product.updated_at,
    };
    const cachedVariants = variants.map((v) => ({
      id: v.id,
      product_id: v.product_id,
      value: v.value,
      selling_price: v.selling_price,
      cost_price: v.cost_price,
      stock_quantity: v.stock_quantity,
      sort_order: v.sort_order,
    }));

    await cacheSingleProduct(cachedProduct, cachedVariants);
    console.log(
      `[Offline Cache] Single product data successfully synced to raw IndexedDB for: ${productId}`,
    );
  } catch (error) {
    console.error(`[Offline Cache] Error syncing product data for ${productId}:`, error);
    throw error;
  }
}

export async function getDexieCacheStats(): Promise<CacheStats> {
  const dexieDb = db();
  const allProducts = await dexieDb.products.toArray();
  const productsCached = allProducts.filter((p) => !p._deleted).length;

  const totalProductsVal = await getMeta<string>("totalProductsCount");
  const totalProducts = totalProductsVal ? parseInt(totalProductsVal, 10) : productsCached;

  const totalImagesVal = await getMeta<string>("totalImagesCount");
  const totalImages = totalImagesVal ? parseInt(totalImagesVal, 10) : 0;

  const imagesCachedVal = await getMeta<string>("imagesCachedCount");
  const imagesCached = imagesCachedVal ? parseInt(imagesCachedVal, 10) : 0;

  const lastSyncTimeVal = await getMeta<number>("lastSyncAt");
  const lastSyncTime = lastSyncTimeVal ? new Date(lastSyncTimeVal).toISOString() : null;

  const completionTimeVal = await getMeta<string>("fullSyncCompletionTime");
  const completionTime = completionTimeVal ?? null;

  const statusVal = await getMeta<string>("cacheStatus");
  const status = (statusVal ?? "Not Started") as CacheStats["status"];

  return {
    productsCached,
    totalProducts,
    imagesCached,
    totalImages,
    lastSyncTime,
    completionTime,
    status,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
  };
}
