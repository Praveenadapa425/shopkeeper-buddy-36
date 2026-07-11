import { supabase } from "@/integrations/supabase/client";
import {
  db,
  setMeta,
  type CachedProduct,
  type CachedVariant,
  type MutationOp,
  type QueuedMutation,
} from "./db";
import { cacheSingleProduct, deleteCachedProduct, deleteCachedVariantsByProduct } from "@/lib/offlineCache";

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
    const finalProd = { id, ...op.product, _dirty: 1 };
    await db().products.put(finalProd);
    
    const finalVars = op.variants.map((v, i) => ({
      id: `temp_v_${id}_${i}`,
      product_id: id,
      ...v,
      sort_order: v.sort_order ?? i,
      _dirty: 1,
    }));
    if (finalVars.length) {
      await db().variants.bulkPut(finalVars);
    }

    // Update raw IndexedDB (shop-buddy-offline)
    const cachedProduct = {
      id: finalProd.id,
      name: finalProd.name,
      category_id: finalProd.category_id,
      image_url: finalProd.image_url,
      stock_qty: finalProd.stock_qty,
      selling_price: finalProd.selling_price,
      cost_price: finalProd.cost_price,
      low_stock_threshold: finalProd.low_stock_threshold,
    };
    const cachedVars = finalVars.map((v) => ({
      id: v.id,
      product_id: v.product_id,
      value: v.value,
      selling_price: v.selling_price,
      cost_price: v.cost_price,
      stock_quantity: v.stock_quantity,
      sort_order: v.sort_order,
    }));
    await cacheSingleProduct(cachedProduct, cachedVars);
    console.log("[Create Product Flow] Optimistic created product written to raw IndexedDB:", id);

  } else if (op.kind === "update_product") {
    const cur = await db().products.get(op.id);
    if (cur) {
      const updatedProd = { ...cur, ...op.patch, _dirty: 1 };
      await db().products.put(updatedProd);

      let finalVars: any[] = [];
      if (op.variants) {
        // Replace product's variants with provided set
        await db().variants.where("product_id").equals(op.id).delete();
        const varsToPut = op.variants.keep.map((v, i) => ({
          ...v,
          product_id: op.id,
          sort_order: i,
          _dirty: 1,
          id: v.id || `temp_v_${op.id}_${i}`,
        }));
        await db().variants.bulkPut(varsToPut);
        finalVars = varsToPut;
      } else {
        finalVars = await db().variants.where("product_id").equals(op.id).toArray();
      }

      // Update raw IndexedDB (shop-buddy-offline)
      await deleteCachedVariantsByProduct(op.id);
      
      const cachedProduct = {
        id: updatedProd.id,
        name: updatedProd.name,
        category_id: updatedProd.category_id,
        image_url: updatedProd.image_url,
        stock_qty: updatedProd.stock_qty,
        selling_price: updatedProd.selling_price,
        cost_price: updatedProd.cost_price,
        low_stock_threshold: updatedProd.low_stock_threshold,
        created_at: updatedProd.created_at,
        updated_at: updatedProd.updated_at,
      };
      const cachedVars = finalVars.map((v) => ({
        id: v.id,
        product_id: v.product_id,
        value: v.value,
        selling_price: v.selling_price,
        cost_price: v.cost_price,
        stock_quantity: v.stock_quantity,
        sort_order: v.sort_order,
      }));
      await cacheSingleProduct(cachedProduct, cachedVars);
      console.log("[Create Product Flow] Optimistic updated product written to raw IndexedDB:", op.id);
    }
  } else if (op.kind === "delete_product") {
    const cur = await db().products.get(op.id);
    if (cur) await db().products.put({ ...cur, _deleted: 1 });
    const vars = await db().variants.where("product_id").equals(op.id).toArray();
    for (const v of vars) await db().variants.put({ ...v, _deleted: 1 });
    await deleteCachedProduct(op.id);
    await deleteCachedVariantsByProduct(op.id);
    console.log("[Create Product Flow] Optimistic deleted product from raw IndexedDB:", op.id);
  }
  emit();
}

async function executeOp(op: MutationOp, mutationId?: string): Promise<void> {
  if (op.kind === "create_product") {
    let categoryId = op.product.category_id;
    if (op.newCategoryName) {
      console.log("[Create Product Flow] Inserting new category to Supabase:", op.newCategoryName);
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: op.newCategoryName })
        .select("id, name")
        .single();
      if (error) {
        console.error("[Create Product Flow] Category insertion failed:", error);
        throw error;
      }
      categoryId = data.id;
      // Write new category locally to Dexie immediately
      const catWriteResult = await db().categories.put({ id: data.id, name: data.name });
      console.log("[Create Product Flow] Dexie write result (category):", catWriteResult);
    }
    const { data: authData } = await supabase.auth.getUser();
    
    const insertPayload = {
      name: op.product.name,
      category_id: categoryId,
      image_url: op.product.image_url,
      stock_qty: op.product.stock_qty,
      selling_price: op.product.selling_price,
      cost_price: op.product.cost_price,
      low_stock_threshold: op.product.low_stock_threshold,
      created_by: authData?.user?.id ?? null,
    };
    console.log("[Create Product Flow] Supabase insert request:", insertPayload);

    const { data, error } = await supabase
      .from("products")
      .insert(insertPayload)
      .select("id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at")
      .single();
    
    console.log("[Create Product Flow] Supabase insert response:", { data, error });
    if (error) {
      console.error("[Create Product Flow] Product insertion failed:", error);
      throw error;
    }
    
    const productId = data.id;
    console.log("[Create Product Flow] Returned product ID:", productId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("last_created_product_id", productId);
    }

    let varData: any[] | null = null;
    if (op.variants.length) {
      const varInsertPayload = op.variants.map((v, i) => ({
        product_id: productId,
        value: v.value,
        cost_price: v.cost_price,
        selling_price: v.selling_price,
        stock_quantity: v.stock_quantity,
        sort_order: v.sort_order ?? i,
      }));
      console.log("[Create Product Flow] Supabase variants insert request:", varInsertPayload);

      const { data: vData, error: vErr } = await supabase
        .from("product_variants")
        .insert(varInsertPayload)
        .select("id, product_id, value, cost_price, selling_price, stock_quantity, sort_order");
      
      console.log("[Create Product Flow] Supabase variants insert response:", { data: vData, error: vErr });
      if (vErr) {
        console.error("[Create Product Flow] Variants insertion failed:", vErr);
        throw vErr;
      }
      varData = vData;
    }

    // Rewrite any subsequent mutations in the queue targeting this temp ID to the new real product ID
    const allMutations = await db().mutations.toArray();
    for (const m of allMutations) {
      if (m.op.id === op.tempId) {
        m.op.id = productId;
        await db().mutations.put(m);
        console.log(`[Queue ID Rewrite] Rewrote mutation ${m.id} target ID from ${op.tempId} to ${productId}`);
      }
    }

    // Check if there are newer mutations in the queue for this product
    const opId = op.id || op.tempId;
    let isLatest = true;
    if (mutationId) {
      const currentMutation = await db().mutations.get(mutationId);
      if (currentMutation) {
        const newerCount = await db().mutations
          .filter((m) => {
            const mOpId = m.op.id || m.op.tempId;
            return mOpId === opId && m.createdAt > currentMutation.createdAt;
          })
          .count();
        isLatest = newerCount === 0;
        console.log(`[Create Product Flow] Checked if mutation ${mutationId} is latest for product ${opId}: ${isLatest} (newer mutations count: ${newerCount})`);
      }
    }

    // Get current optimistic records from Dexie before deleting them
    const currentOptimisticProduct = await db().products.get(op.tempId);
    const currentOptimisticVariants = await db().variants.where("product_id").equals(op.tempId).toArray();

    // Reconcile temp id in local cache
    await db().transaction("rw", db().products, db().variants, async () => {
      await db().products.delete(op.tempId);
      await db().variants.where("product_id").equals(op.tempId).delete();
    });
    console.log("[Create Product Flow] Reconciled temporary product ID:", op.tempId);

    // Save under the real product ID in Dexie
    if (currentOptimisticProduct) {
      const mergedProduct = {
        ...currentOptimisticProduct,
        id: productId,
        _dirty: isLatest ? 0 : 1,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      await db().products.put(mergedProduct);

      for (const v of currentOptimisticVariants) {
        const cleanVarId = v.id.startsWith("temp_") ? `var_${productId}_${v.id.substring(v.id.lastIndexOf("_") + 1)}` : v.id;
        await db().variants.put({
          ...v,
          id: cleanVarId,
          product_id: productId,
          _dirty: isLatest ? 0 : 1,
        });
      }
      console.log("[Create Product Flow] Migrated optimistic Dexie records from temp ID to real ID:", productId);
    } else {
      // Fallback if no optimistic record was found
      await db().products.put({ ...data, _dirty: isLatest ? 0 : 1 } as CachedProduct);
      if (varData) {
        await db().variants.bulkPut(varData.map((v) => ({ ...v, _dirty: isLatest ? 0 : 1 })));
      }
    }

    // Write to raw IndexedDB (shop-buddy-offline)
    if (currentOptimisticProduct) {
      const cachedProduct = {
        id: productId,
        name: currentOptimisticProduct.name,
        category_id: currentOptimisticProduct.category_id,
        image_url: currentOptimisticProduct.image_url,
        stock_qty: currentOptimisticProduct.stock_qty,
        selling_price: currentOptimisticProduct.selling_price,
        cost_price: currentOptimisticProduct.cost_price,
        low_stock_threshold: currentOptimisticProduct.low_stock_threshold,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      const cachedVars = (isLatest && varData ? varData : currentOptimisticVariants).map((v) => {
        const cleanVarId = v.id.startsWith("temp_") ? `var_${productId}_${v.id.substring(v.id.lastIndexOf("_") + 1)}` : v.id;
        return {
          id: cleanVarId,
          product_id: productId,
          value: v.value,
          selling_price: v.selling_price,
          cost_price: v.cost_price,
          stock_quantity: v.stock_quantity,
          sort_order: v.sort_order,
        };
      });
      await cacheSingleProduct(cachedProduct, cachedVars);
      console.log("[Create Product Flow] Synchronized created product to raw IndexedDB:", productId);
    }
  } else if (op.kind === "update_product") {
    // Check if there are newer mutations in the queue for this product
    const opId = op.id || op.tempId;
    let isLatest = true;
    if (mutationId) {
      const currentMutation = await db().mutations.get(mutationId);
      if (currentMutation) {
        const newerCount = await db().mutations
          .filter((m) => {
            const mOpId = m.op.id || m.op.tempId;
            return mOpId === opId && m.createdAt > currentMutation.createdAt;
          })
          .count();
        isLatest = newerCount === 0;
        console.log(`[Update Product Flow] Checked if mutation ${mutationId} is latest for product ${opId}: ${isLatest} (newer mutations count: ${newerCount})`);
      }
    }

    let categoryId = op.patch.category_id;
    if (op.newCategoryName) {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: op.newCategoryName })
        .select("id, name")
        .single();
      if (error) throw error;
      categoryId = data.id;
      // Write new category locally to Dexie immediately
      await db().categories.put({ id: data.id, name: data.name });
    }
    const { _dirty: _d, _deleted: _x, ...rest } = op.patch;
    void _d;
    void _x;
    const patch: Record<string, unknown> = { ...rest };
    if (categoryId !== undefined) patch.category_id = categoryId;
    const { data: updatedProduct, error } = await supabase
      .from("products")
      .update(patch as never)
      .eq("id", op.id)
      .select("id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at")
      .single();
    if (error) throw error;

    // Immediately put updated product in Dexie with _dirty: 0 (only if isLatest)
    if (updatedProduct && isLatest) {
      await db().products.put({ ...updatedProduct, _dirty: 0 } as CachedProduct);
      console.log(`[Update Product Flow] Updated Dexie product ${op.id} with _dirty: 0 because it is the latest mutation.`);
    } else if (updatedProduct) {
      console.log(`[Update Product Flow] Skipped updating Dexie product ${op.id} with _dirty: 0 because a newer mutation exists in the queue.`);
    }

    let finalVars: any[] = [];
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
        const { data: updatedVars, error: uErr } = await supabase
          .from("product_variants")
          .upsert(rows, { onConflict: "id" })
          .select("id, product_id, value, cost_price, selling_price, stock_quantity, sort_order");
        if (uErr) throw uErr;
        if (updatedVars) {
          // Reconcile variants in local Dexie cache, deleting any deleted ones and writing updated ones with _dirty: 0
          if (isLatest) {
            await db().transaction("rw", db().variants, async () => {
              const serverVarIds = new Set(updatedVars.map((v) => v.id));
              const existingVars = await db().variants.where("product_id").equals(op.id).toArray();
              for (const ev of existingVars) {
                if (!serverVarIds.has(ev.id)) {
                  await db().variants.delete(ev.id);
                }
              }
              await db().variants.bulkPut(updatedVars.map((v) => ({ ...v, _dirty: 0 })));
            });
          }
          finalVars = updatedVars;
        }
      }
    } else {
      // If op.variants was not provided, still clear _dirty for this product's existing variants
      await db().transaction("rw", db().variants, async () => {
        const existingVars = await db().variants.where("product_id").equals(op.id).toArray();
        if (isLatest) {
          for (const ev of existingVars) {
            if (ev._dirty) {
              ev._dirty = 0;
              await db().variants.put(ev);
            }
          }
        }
        finalVars = existingVars;
      });
    }

    // Write to raw IndexedDB (only if isLatest)
    if (updatedProduct && isLatest) {
      // Clean variants in raw IndexedDB first to remove deleted ones
      await deleteCachedVariantsByProduct(op.id);
      
      const cachedProduct = {
        id: updatedProduct.id,
        name: updatedProduct.name,
        category_id: updatedProduct.category_id,
        image_url: updatedProduct.image_url,
        stock_qty: updatedProduct.stock_qty,
        selling_price: updatedProduct.selling_price,
        cost_price: updatedProduct.cost_price,
        low_stock_threshold: updatedProduct.low_stock_threshold,
        created_at: updatedProduct.created_at,
        updated_at: updatedProduct.updated_at,
      };
      const cachedVars = finalVars.map((v) => ({
        id: v.id,
        product_id: v.product_id,
        value: v.value,
        selling_price: v.selling_price,
        cost_price: v.cost_price,
        stock_quantity: v.stock_quantity,
        sort_order: v.sort_order,
      }));
      await cacheSingleProduct(cachedProduct, cachedVars);
      console.log("[Create Product Flow] Synchronized updated product to raw IndexedDB:", op.id);
    }
  } else if (op.kind === "delete_product") {
    const { error } = await supabase.from("products").delete().eq("id", op.id);
    if (error) throw error;
    await db().products.delete(op.id);
    await db().variants.where("product_id").equals(op.id).delete();
    await deleteCachedProduct(op.id);
    console.log("[Create Product Flow] Synchronized deletion to raw IndexedDB for product:", op.id);
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
    const queueLength = await db().mutations.count();
    console.log("[Create Product Flow] processQueue started. Current queue length:", queueLength);
    while (true) {
      const next = await db().mutations.orderBy("createdAt").first();
      if (!next) {
        console.log("[Create Product Flow] processQueue: No more mutations in queue.");
        break;
      }
      console.log(`[Create Product Flow] Processing mutation ID: ${next.id}, attempts so far: ${next.attempts}`);
      try {
        console.log(`[Create Product Flow] executeOp start for mutation ID: ${next.id}, operation details:`, next.op);
        await executeOp(next.op, next.id);
        console.log(`[Create Product Flow] executeOp success for mutation ID: ${next.id}`);
        await db().mutations.delete(next.id!);
        console.log(`[Create Product Flow] Mutation ID: ${next.id} successfully removed from queue.`);
        done++;
        emit();
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error(
          `[Create Product Flow] executeOp failure for mutation ID: ${next.id} with full error stack:`,
          err,
          "\nStack trace:\n",
          stack
        );
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
