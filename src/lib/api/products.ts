import { supabase } from "@/integrations/supabase/client";
import { db, type CachedProduct } from "@/lib/offline/db";
import { cacheSingleProduct, deleteCachedVariantsByProduct } from "@/lib/offlineCache";

export function isNetworkError(err: unknown): boolean {
  if (typeof window !== "undefined" && !navigator.onLine) {
    return true;
  }
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Network Error") ||
    msg.includes("Failed to execute 'fetch'") ||
    msg.includes("Load failed") ||
    msg.includes("net::ERR_")
  ) {
    return true;
  }
  const anyErr = err as { status?: number; code?: string };
  if (anyErr.status === 0 || anyErr.code === "PGRST000") {
    return true;
  }
  return false;
}

export async function createProductOnline(payload: {
  product: {
    name: string;
    category_id: string | null;
    image_url?: string | null;
    stock_qty: number;
    selling_price: number;
    cost_price: number;
    low_stock_threshold: number;
  };
  variants: Array<{
    value: string;
    cost_price: number;
    selling_price: number;
    stock_quantity: number;
    sort_order: number;
  }>;
  newCategoryName?: string;
}): Promise<CachedProduct> {
  console.log("[Create Product Flow] Direct online creation requested:", payload);

  let categoryId = payload.product.category_id;
  if (payload.newCategoryName) {
    console.log("[Create Product Flow] Direct online: inserting new category to Supabase:", payload.newCategoryName);
    const { data: catData, error: catErr } = await supabase
      .from("categories")
      .insert({ name: payload.newCategoryName })
      .select("id, name")
      .single();
    if (catErr) {
      console.error("[Create Product Flow] Direct online: category insertion error:", catErr);
      throw catErr;
    }
    categoryId = catData.id;
    await db().categories.put({ id: catData.id, name: catData.name });
  }

  const { data: authData } = await supabase.auth.getUser();

  const insertPayload = {
    name: payload.product.name,
    category_id: categoryId,
    image_url: payload.product.image_url,
    stock_qty: payload.product.stock_qty,
    selling_price: payload.product.selling_price,
    cost_price: payload.product.cost_price,
    low_stock_threshold: payload.product.low_stock_threshold,
    created_by: authData?.user?.id ?? null,
  };
  console.log("[Create Product Flow] Direct online: Supabase insert request payload:", insertPayload);

  const { data: prodData, error: prodErr } = await supabase
    .from("products")
    .insert(insertPayload)
    .select("id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at")
    .single();

  if (prodErr) {
    console.error("[Create Product Flow] Direct online: Supabase insert error:", prodErr);
    throw prodErr;
  }

  console.log("[Create Product Flow] Direct online: Supabase insert response success:", prodData);
  const productId = prodData.id;
  if (typeof window !== "undefined") {
    window.localStorage.setItem("last_created_product_id", productId);
  }

  let varData: any[] = [];
  if (payload.variants.length > 0) {
    const varInsertPayload = payload.variants.map((v, i) => ({
      product_id: productId,
      value: v.value,
      cost_price: v.cost_price,
      selling_price: v.selling_price,
      stock_quantity: v.stock_quantity,
      sort_order: v.sort_order ?? i,
    }));
    console.log("[Create Product Flow] Direct online: Supabase variants insert request:", varInsertPayload);

    const { data: vData, error: vErr } = await supabase
      .from("product_variants")
      .insert(varInsertPayload)
      .select("id, product_id, value, cost_price, selling_price, stock_quantity, sort_order");

    if (vErr) {
      console.error("[Create Product Flow] Direct online: Supabase variants insert error:", vErr);
      throw vErr;
    }
    console.log("[Create Product Flow] Direct online: Supabase variants insert success:", vData);
    varData = vData ?? [];
  }

  // Update Dexie database with clean server record (_dirty: 0)
  const dexieProduct = { ...prodData, _dirty: 0 } as CachedProduct;
  await db().products.put(dexieProduct);
  if (varData.length > 0) {
    await db().variants.bulkPut(varData.map((v) => ({ ...v, _dirty: 0 })));
  }
  console.log("[Create Product Flow] Direct online: Dexie cache updated with clean record:", productId);

  // Update raw IndexedDB
  const cachedProduct = {
    id: prodData.id,
    name: prodData.name,
    category_id: prodData.category_id,
    image_url: prodData.image_url,
    stock_qty: prodData.stock_qty,
    selling_price: prodData.selling_price,
    cost_price: prodData.cost_price,
    low_stock_threshold: prodData.low_stock_threshold,
    created_at: prodData.created_at,
    updated_at: prodData.updated_at,
  };
  const cachedVars = varData.map((v) => ({
    id: v.id,
    product_id: v.product_id,
    value: v.value,
    selling_price: v.selling_price,
    cost_price: v.cost_price,
    stock_quantity: v.stock_quantity,
    sort_order: v.sort_order,
  }));
  await cacheSingleProduct(cachedProduct, cachedVars);
  console.log("[Create Product Flow] Direct online: Raw IndexedDB updated for product:", productId);

  return dexieProduct;
}

export async function updateProductOnline(payload: {
  id: string;
  patch: {
    name: string;
    category_id: string | null;
    image_url?: string | null;
    stock_qty: number;
    selling_price: number;
    cost_price: number;
    low_stock_threshold: number;
  };
  variants?: {
    keep: Array<{
      id?: string;
      value: string;
      cost_price: number;
      selling_price: number;
      stock_quantity: number;
      sort_order?: number;
    }>;
  };
  newCategoryName?: string;
}): Promise<CachedProduct> {
  console.log("[Update Product Flow] Direct online update requested for product:", payload.id);

  let categoryId = payload.patch.category_id;
  if (payload.newCategoryName) {
    console.log("[Update Product Flow] Direct online: inserting new category to Supabase:", payload.newCategoryName);
    const { data: catData, error: catErr } = await supabase
      .from("categories")
      .insert({ name: payload.newCategoryName })
      .select("id, name")
      .single();
    if (catErr) throw catErr;
    categoryId = catData.id;
    await db().categories.put({ id: catData.id, name: catData.name });
  }

  const patchPayload = {
    name: payload.patch.name,
    category_id: categoryId,
    image_url: payload.patch.image_url,
    stock_qty: payload.patch.stock_qty,
    selling_price: payload.patch.selling_price,
    cost_price: payload.patch.cost_price,
    low_stock_threshold: payload.patch.low_stock_threshold,
  };

  const { data: updatedProd, error: prodErr } = await supabase
    .from("products")
    .update(patchPayload as never)
    .eq("id", payload.id)
    .select("id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at")
    .single();

  if (prodErr) throw prodErr;

  let finalVars: any[] = [];
  if (payload.variants) {
    const keep = payload.variants.keep;
    const realIds = keep.map((v) => v.id).filter((x) => x && !x.startsWith("temp_"));
    let delQ = supabase.from("product_variants").delete().eq("product_id", payload.id);
    if (realIds.length) delQ = delQ.not("id", "in", `(${realIds.join(",")})`);
    const { error: dErr } = await delQ;
    if (dErr) throw dErr;

    const rows = keep.map((v, i) => ({
      ...(v.id && !v.id.startsWith("temp_") ? { id: v.id } : {}),
      product_id: payload.id,
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
      finalVars = updatedVars ?? [];
    }
  }

  // Update Dexie
  const dexieProduct = { ...updatedProd, _dirty: 0 } as CachedProduct;
  await db().products.put(dexieProduct);
  if (finalVars.length > 0) {
    await db().transaction("rw", db().variants, async () => {
      const serverVarIds = new Set(finalVars.map((v) => v.id));
      const existingVars = await db().variants.where("product_id").equals(payload.id).toArray();
      for (const ev of existingVars) {
        if (!serverVarIds.has(ev.id)) {
          await db().variants.delete(ev.id);
        }
      }
      await db().variants.bulkPut(finalVars.map((v) => ({ ...v, _dirty: 0 })));
    });
  }

  // Update raw IndexedDB
  await deleteCachedVariantsByProduct(payload.id);
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

  return dexieProduct;
}
