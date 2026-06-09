import { supabase } from "@/integrations/supabase/client";
import { db, setMeta, type CachedProduct, type CachedVariant, type MutationOp, type QueuedMutation } from "./db";

const listeners = new Set<() => void>();
export function subscribeQueue(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const l of listeners) l();
}

let processing = false;
let syncing = false;
export function isSyncing() {
  return syncing;
}

export async function enqueue(op: MutationOp) {
  await db().mutations.add({ op, createdAt: Date.now(), attempts: 0 });
  emit();
  // Try to flush immediately
  void processQueue();
}

export async function pendingCount(): Promise<number> {
  return db().mutations.count();
}

// Apply mutation optimistically to the local cache.
export async function applyOptimistic(op: MutationOp) {
  if (op.kind === "create_product") {
    const id = op.tempId;
    await db().products.put({ id, ...op.product, _dirty: 1 });
    if (op.variants.length) {
      await db().variants.bulkPut(
        op.variants.map((v, i) => ({
          id: `temp_v_${id}_${i}`,
          product_id: id,
          ...v,
          sort_order: v.sort_order ?? i,
          _dirty: 1,
        })),
      );
    }
  } else if (op.kind === "update_product") {
    const cur = await db().products.get(op.id);
    if (cur) await db().products.put({ ...cur, ...op.patch, _dirty: 1 });
    if (op.variants) {
      // Replace product's variants with provided set
      await db().variants.where("product_id").equals(op.id).delete();
      await db().variants.bulkPut(
        op.variants.keep.map((v, i) => ({
          ...v,
          product_id: op.id,
          sort_order: i,
          _dirty: 1,
          id: v.id || `temp_v_${op.id}_${i}`,
        })),
      );
    }
  } else if (op.kind === "delete_product") {
    const cur = await db().products.get(op.id);
    if (cur) await db().products.put({ ...cur, _deleted: 1 });
    const vars = await db().variants.where("product_id").equals(op.id).toArray();
    for (const v of vars) await db().variants.put({ ...v, _deleted: 1 });
  }
  emit();
}

async function executeOp(op: MutationOp): Promise<void> {
  if (op.kind === "create_product") {
    let categoryId = op.product.category_id;
    if (op.newCategoryName) {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: op.newCategoryName })
        .select("id")
        .single();
      if (error) throw error;
      categoryId = data.id;
    }
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("products")
      .insert({
        name: op.product.name,
        category_id: categoryId,
        image_url: op.product.image_url,
        stock_qty: op.product.stock_qty,
        selling_price: op.product.selling_price,
        cost_price: op.product.cost_price,
        low_stock_threshold: op.product.low_stock_threshold,
        created_by: u.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    const productId = data.id;
    if (op.variants.length) {
      const { error: vErr } = await supabase.from("product_variants").insert(
        op.variants.map((v, i) => ({
          product_id: productId,
          value: v.value,
          cost_price: v.cost_price,
          selling_price: v.selling_price,
          stock_quantity: v.stock_quantity,
          sort_order: v.sort_order ?? i,
        })),
      );
      if (vErr) throw vErr;
    }
    // Reconcile temp id in local cache
    await db().transaction("rw", db().products, db().variants, async () => {
      await db().products.delete(op.tempId);
      await db().variants.where("product_id").equals(op.tempId).delete();
    });
  } else if (op.kind === "update_product") {
    let categoryId = op.patch.category_id;
    if (op.newCategoryName) {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: op.newCategoryName })
        .select("id")
        .single();
      if (error) throw error;
      categoryId = data.id;
    }
    const patch: Partial<CachedProduct> = { ...op.patch };
    if (categoryId !== undefined) patch.category_id = categoryId;
    delete (patch as { _dirty?: number })._dirty;
    delete (patch as { _deleted?: number })._deleted;
    const { error } = await supabase.from("products").update(patch).eq("id", op.id);
    if (error) throw error;

    if (op.variants) {
      const keep = op.variants.keep;
      const realIds = keep.map((v) => v.id).filter((x) => x && !x.startsWith("temp_"));
      let delQ = supabase.from("product_variants").delete().eq("product_id", op.id);
      if (realIds.length) delQ = delQ.not("id", "in", `(${realIds.join(",")})`);
      const { error: dErr } = await delQ;
      if (dErr) throw dErr;
      const rows = keep.map((v, i) => ({
        ...(v.id && !v.id.startsWith("temp_") ? { id: v.id } : {}),
        product_id: op.id,
        value: v.value,
        cost_price: v.cost_price,
        selling_price: v.selling_price,
        stock_quantity: v.stock_quantity,
        sort_order: i,
      }));
      if (rows.length) {
        const { error: uErr } = await supabase
          .from("product_variants")
          .upsert(rows, { onConflict: "id" });
        if (uErr) throw uErr;
      }
    }
  } else if (op.kind === "delete_product") {
    const { error } = await supabase.from("products").delete().eq("id", op.id);
    if (error) throw error;
    await db().products.delete(op.id);
    await db().variants.where("product_id").equals(op.id).delete();
  }
}

export async function processQueue(): Promise<{ done: number; failed: number }> {
  if (processing) return { done: 0, failed: 0 };
  if (typeof window !== "undefined" && !navigator.onLine) return { done: 0, failed: 0 };
  processing = true;
  syncing = true;
  emit();
  let done = 0;
  let failed = 0;
  try {
    while (true) {
      const next = await db().mutations.orderBy("createdAt").first();
      if (!next) break;
      try {
        await executeOp(next.op);
        await db().mutations.delete(next.id!);
        done++;
        emit();
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        await db().mutations.update(next.id!, {
          attempts: next.attempts + 1,
          lastError: msg,
        });
        // Stop on first failure to avoid loops; will retry later
        break;
      }
    }
    if (done > 0) await setMeta("lastSyncAt", Date.now());
  } finally {
    processing = false;
    syncing = false;
    emit();
  }
  return { done, failed };
}

export function startSyncWatcher() {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => void processQueue();
  window.addEventListener("online", onOnline);
  const interval = window.setInterval(() => {
    if (navigator.onLine) void processQueue();
  }, 30_000);
  // Initial flush
  if (navigator.onLine) void processQueue();
  return () => {
    window.removeEventListener("online", onOnline);
    window.clearInterval(interval);
  };
}

export type { CachedProduct, CachedVariant };
