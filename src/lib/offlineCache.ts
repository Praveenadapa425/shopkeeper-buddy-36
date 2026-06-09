import { signedImageUrl } from "./api/inventory.functions";
import { db, setMeta as setDexieMeta, getMeta as getDexieMeta } from "./offline/db";

const DB_NAME = "shop-buddy-offline";
const DB_VERSION = 1;
const LAST_SYNC_KEY = "lastSuccessfulSync";
const SYNC_EVENT = "shop-buddy:last-sync";
const STATS_EVENT = "shop-buddy:cache-stats";

type StoreName =
  | "products"
  | "product_variants"
  | "categories"
  | "inventory_stock"
  | "images"
  | "meta";

export type CachedProduct = {
  id: string;
  name: string;
  category_id: string | null;
  image_url: string | null;
  stock_qty: number;
  selling_price: number;
  cost_price?: number;
  low_stock_threshold: number;
  created_at?: string;
  updated_at?: string;
  product_variants?: CachedVariant[];
};

export type CachedVariant = {
  id: string;
  product_id: string;
  value: string;
  selling_price: number;
  cost_price?: number;
  stock_quantity: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type CachedCategory = {
  id: string;
  name: string;
  created_at?: string;
};

export type CachedStock = {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  location: string;
  updated_at: string;
};

export type CachedImage = {
  key: string;
  productId?: string;
  type: "thumb" | "full";
  blob: Blob;
  contentType: string;
  updatedAt: string;
};

type MetaRow = {
  key: string;
  value: string;
};

export type CacheStats = {
  productsCached: number;
  totalProducts: number;
  imagesCached: number;
  totalImages: number;
  lastSyncTime: string | null;
  completionTime: string | null;
  status: "Not Started" | "In Progress" | "Complete" | "Failed";
  online: boolean;
};

function canUseIndexedDB() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDB()) return Promise.reject(new Error("IndexedDB is not available"));

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "id" });
      if (!db.objectStoreNames.contains("product_variants")) {
        const store = db.createObjectStore("product_variants", { keyPath: "id" });
        store.createIndex("product_id", "product_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("categories")) db.createObjectStore("categories", { keyPath: "id" });
      if (!db.objectStoreNames.contains("inventory_stock")) {
        const store = db.createObjectStore("inventory_stock", { keyPath: "id" });
        store.createIndex("product_id", "product_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function tx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const finished = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
    const result = await run(store);
    await finished;
    return result;
  } finally {
    db.close();
  }
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

async function putMany<T>(storeName: StoreName, rows: T[]) {
  if (!canUseIndexedDB()) return;
  await tx(storeName, "readwrite", async (store) => {
    for (const row of rows) store.put(row);
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  if (!canUseIndexedDB()) return [];
  return tx(storeName, "readonly", (store) => requestToPromise<T[]>(store.getAll()));
}

async function getOne<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  if (!canUseIndexedDB()) return undefined;
  return tx(storeName, "readonly", (store) => requestToPromise<T | undefined>(store.get(key)));
}

async function setLastSync() {
  if (!canUseIndexedDB()) return;
  const value = new Date().toISOString();
  await tx("meta", "readwrite", async (store) => {
    store.put({ key: LAST_SYNC_KEY, value } satisfies MetaRow);
  });
  try {
    await setDexieMeta("lastSyncAt", Date.now());
  } catch (e) {
    console.warn("[Offline Cache] Failed to update Dexie lastSyncAt:", e);
  }
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: value }));
}

export async function cacheSingleProduct(product: CachedProduct, variants: CachedVariant[]) {
  await putMany("products", [product]);
  await putMany("product_variants", variants);
  notifyStatsUpdate();
}

export async function getLastSync(): Promise<string | null> {
  const row = await getOne<MetaRow>("meta", LAST_SYNC_KEY);
  return row?.value ?? null;
}

export function subscribeLastSync(callback: (value: string | null) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    callback((event as CustomEvent<string>).detail ?? null);
  };
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

export async function cacheProducts(rows: CachedProduct[]) {
  if (canUseIndexedDB()) {
    await tx("meta", "readwrite", async (store) => {
      store.put({ key: "totalProductsCount", value: String(rows.length) });
    });
  }
  await putMany("products", rows);
  await setLastSync();
  console.log(`[Offline Cache] Product cache progress: cached ${rows.length} products`);
  notifyStatsUpdate();
}

export async function getCachedProducts() {
  const [products, variants] = await Promise.all([
    getAll<CachedProduct>("products"),
    getAll<CachedVariant>("product_variants"),
  ]);
  return products.map((product) => ({
    ...product,
    product_variants: variants
      .filter((variant) => variant.product_id === product.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export async function getCachedProduct(id: string) {
  const [product, variants] = await Promise.all([
    getOne<CachedProduct>("products", id),
    getCachedVariants(id),
  ]);
  return product ? { ...product, product_variants: variants } : undefined;
}

export async function cacheCategories(rows: CachedCategory[]) {
  await putMany("categories", rows);
  await setLastSync();
}

export async function getCachedCategories() {
  return getAll<CachedCategory>("categories");
}

export async function getCachedCategory(id: string) {
  return getOne<CachedCategory>("categories", id);
}

export async function cacheVariants(rows: CachedVariant[]) {
  await putMany("product_variants", rows);
  await setLastSync();
}

export async function getCachedVariants(productId?: string) {
  const rows = await getAll<CachedVariant>("product_variants");
  const filtered = productId ? rows.filter((row) => row.product_id === productId) : rows;
  return filtered.sort((a, b) => a.sort_order - b.sort_order);
}

export async function cacheStock(rows: CachedStock[]) {
  await putMany("inventory_stock", rows);
  await setLastSync();
}

export async function getCachedStock(productId?: string) {
  const rows = await getAll<CachedStock>("inventory_stock");
  return productId ? rows.filter((row) => row.product_id === productId) : rows;
}

export async function cacheImage(
  key: string,
  blob: Blob,
  productId?: string,
  type?: "thumb" | "full"
) {
  if (!canUseIndexedDB()) return;

  const resolvedType = type ?? (key.startsWith("thumb_") ? "thumb" : "full");
  let resolvedProductId = productId;

  if (!resolvedProductId) {
    const path = key.replace(/^thumb_|^full_/, "");
    try {
      const products = await getAll<CachedProduct>("products");
      const matched = products.find((p) => p.image_url === path);
      if (matched) resolvedProductId = matched.id;
    } catch {
      // Ignore
    }
  }

  await tx("images", "readwrite", async (store) => {
    store.put({
      key,
      productId: resolvedProductId,
      type: resolvedType,
      blob,
      contentType: blob.type || "application/octet-stream",
      updatedAt: new Date().toISOString(),
    } satisfies CachedImage);
  });
  try {
    const images = await getAll<CachedImage>("images");
    const thumbCount = images.filter((img) => img.type === "thumb").length;
    await setDexieMeta("imagesCachedCount", String(thumbCount));
  } catch (e) {
    console.warn("[Offline Cache] Failed to update Dexie imagesCachedCount:", e);
  }
  console.log(`[Offline Cache] Image cache progress: cached ${resolvedType} image for key ${key}`);
}

export async function getCachedImage(key: string) {
  const row = await getOne<CachedImage>("images", key);
  if (row?.blob) {
    console.log(`[Offline Cache] Offline cache load success for key: ${key}`);
    return row.blob;
  } else {
    console.warn(`[Offline Cache] Offline cache load failure (missing in cache) for key: ${key}`);
    return null;
  }
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

// Event notification & preloading queue implementation

let isPreloading = false;
const preloadQueue: { id: string; path: string }[] = [];

export async function queueThumbnailPreload(products: { id: string; image_url: string | null }[]) {
  if (!canUseIndexedDB()) return;

  const items = products
    .filter((p) => p.image_url)
    .map((p) => ({ id: p.id, path: p.image_url! }));

  if (items.length === 0) {
    await updateCacheStatus("Complete");
    return;
  }

  await updateCacheStatus("In Progress");

  // Save total images count
  await tx("meta", "readwrite", async (store) => {
    store.put({ key: "totalImagesCount", value: String(items.length) });
  });
  try {
    await setDexieMeta("totalImagesCount", String(items.length));
  } catch (e) {
    console.warn("[Offline Cache] Failed to update Dexie totalImagesCount:", e);
  }

  console.log(`[Offline Cache] Full catalog sync start: preloading ${items.length} thumbnails...`);

  // Add items to queue
  for (const item of items) {
    if (!preloadQueue.some((q) => q.path === item.path)) {
      preloadQueue.push(item);
    }
  }

  if (isPreloading) return;
  isPreloading = true;

  void processPreloadQueue();
}

async function processPreloadQueue() {
  let successCount = 0;
  let failedCount = 0;

  while (preloadQueue.length > 0) {
    const item = preloadQueue.shift();
    if (!item) break;

    const key = `thumb_${item.path}`;
    const exists = await getOne<CachedImage>("images", key);

    if (exists?.blob) {
      successCount++;
      notifyStatsUpdate();
      continue;
    }

    try {
      let blob: Blob;
      try {
        // Try getting signed URL for the thumbnail key first
        const res = await signedImageUrl({ data: { path: key } });
        const img = await fetch(res.url);
        if (!img.ok) throw new Error("Thumbnail fetch failed");
        blob = await img.blob();
      } catch (thumbErr) {
        console.warn(`[Offline Cache] Thumbnail file ${key} not found in storage, falling back to full image ${item.path}:`, thumbErr);
        // Fallback to downloading the full image
        const res = await signedImageUrl({ data: { path: item.path } });
        const img = await fetch(res.url);
        if (!img.ok) throw new Error("Full image fetch failed");
        blob = await img.blob();
      }

      await cacheImage(key, blob, item.id, "thumb");
      successCount++;
      notifyStatsUpdate();

      // Delay to avoid UI blocking
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`[Offline Cache] Failed to preload thumbnail for product ${item.id}:`, err);
      failedCount++;
    }
  }

  isPreloading = false;

  if (failedCount > 0 && successCount === 0) {
    await updateCacheStatus("Failed");
    console.error(`[Offline Cache] Full catalog sync completion: FAILED (${successCount} cached, ${failedCount} failed)`);
  } else {
    await updateCacheStatus("Complete");
    const completionTime = new Date().toISOString();
    await tx("meta", "readwrite", async (store) => {
      store.put({ key: "fullSyncCompletionTime", value: completionTime });
    });
    try {
      await setDexieMeta("fullSyncCompletionTime", completionTime);
    } catch (e) {
      console.warn("[Offline Cache] Failed to update Dexie fullSyncCompletionTime:", e);
    }
    console.log(`[Offline Cache] Full catalog sync completion: SUCCESS. Completion time: ${completionTime}`);
  }
  notifyStatsUpdate();
}

async function updateCacheStatus(status: CacheStats["status"]) {
  await tx("meta", "readwrite", async (store) => {
    store.put({ key: "cacheStatus", value: status });
  });
  try {
    await setDexieMeta("cacheStatus", status);
  } catch (e) {
    console.warn("[Offline Cache] Failed to update Dexie cacheStatus:", e);
  }
}

export async function getDexieCacheStats(): Promise<CacheStats> {
  const dexieDb = db();
  const allProducts = await dexieDb.products.toArray();
  const productsCached = allProducts.filter((p) => !p._deleted).length;

  const totalProductsVal = await getDexieMeta<string>("totalProductsCount");
  const totalProducts = totalProductsVal ? parseInt(totalProductsVal, 10) : productsCached;

  const totalImagesVal = await getDexieMeta<string>("totalImagesCount");
  const totalImages = totalImagesVal ? parseInt(totalImagesVal, 10) : 0;

  const imagesCachedVal = await getDexieMeta<string>("imagesCachedCount");
  const imagesCached = imagesCachedVal ? parseInt(imagesCachedVal, 10) : 0;

  const lastSyncTimeVal = await getDexieMeta<number>("lastSyncAt");
  const lastSyncTime = lastSyncTimeVal ? new Date(lastSyncTimeVal).toISOString() : null;

  const completionTimeVal = await getDexieMeta<string>("fullSyncCompletionTime");
  const completionTime = completionTimeVal ?? null;

  const statusVal = await getDexieMeta<string>("cacheStatus");
  const status = (statusVal ?? "Not Started") as CacheStats["status"];

  return {
    productsCached,
    totalProducts,
    imagesCached,
    totalImages,
    lastSyncTime,
    completionTime,
    status,
    online: isOnline(),
  };
}

export async function getCacheStats(): Promise<CacheStats> {
  const stats = await getDexieCacheStats();
  console.log(`[Offline Cache] Dexie cache statistics updates: Products=${stats.productsCached}/${stats.totalProducts}, Images=${stats.imagesCached}/${stats.totalImages}, Status=${stats.status}`);
  return stats;
}

export function notifyStatsUpdate() {
  if (typeof window !== "undefined") {
    void getCacheStats().then((stats) => {
      window.dispatchEvent(new CustomEvent(STATS_EVENT, { detail: stats }));
    });
  }
}

export function subscribeCacheStats(callback: (stats: CacheStats) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    callback((event as CustomEvent<CacheStats>).detail);
  };
  const triggerUpdate = () => {
    void getCacheStats().then(callback);
  };
  window.addEventListener(STATS_EVENT, handler);
  window.addEventListener("online", triggerUpdate);
  window.addEventListener("offline", triggerUpdate);
  triggerUpdate();
  return () => {
    window.removeEventListener(STATS_EVENT, handler);
    window.removeEventListener("online", triggerUpdate);
    window.removeEventListener("offline", triggerUpdate);
  };
}
