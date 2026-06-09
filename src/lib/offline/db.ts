import Dexie, { type Table } from "dexie";

export type CachedProduct = {
  id: string;
  name: string;
  image_url: string | null;
  stock_qty: number;
  selling_price: number;
  cost_price: number;
  low_stock_threshold: number;
  category_id: string | null;
  created_at?: string;
  updated_at?: string;
  _dirty?: 0 | 1;
  _deleted?: 0 | 1;
};

export type CachedVariant = {
  id: string;
  product_id: string;
  value: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  sort_order: number;
  _dirty?: 0 | 1;
  _deleted?: 0 | 1;
};

export type CachedCategory = {
  id: string;
  name: string;
  _dirty?: 0 | 1;
};

export type MutationOp =
  | { kind: "create_product"; tempId: string; product: Omit<CachedProduct, "id">; variants: Omit<CachedVariant, "id" | "product_id">[]; newCategoryName?: string }
  | { kind: "update_product"; id: string; patch: Partial<CachedProduct>; variants?: { keep: CachedVariant[] }; newCategoryName?: string }
  | { kind: "delete_product"; id: string };

export type QueuedMutation = {
  id?: number;
  op: MutationOp;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

export type Meta = { key: string; value: unknown };

class OfflineDB extends Dexie {
  products!: Table<CachedProduct, string>;
  variants!: Table<CachedVariant, string>;
  categories!: Table<CachedCategory, string>;
  mutations!: Table<QueuedMutation, number>;
  meta!: Table<Meta, string>;

  constructor() {
    super("shop-inventory-offline");
    this.version(1).stores({
      products: "id, category_id, updated_at, _dirty, _deleted",
      variants: "id, product_id, sort_order, _dirty, _deleted",
      categories: "id, name",
      mutations: "++id, createdAt",
      meta: "key",
    });
  }
}

let _db: OfflineDB | null = null;
export function db() {
  if (typeof window === "undefined") {
    throw new Error("offline db is browser-only");
  }
  if (!_db) _db = new OfflineDB();
  return _db;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db().meta.get(key);
  return row?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await db().meta.put({ key, value });
}
