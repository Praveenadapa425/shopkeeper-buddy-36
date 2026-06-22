import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { db, getMeta, setMeta } from "@/lib/offline/db";

async function sha256Hex(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify the admin PIN and return a map of product id -> cost_price.
 * Admins are allowed without PIN if they pass their own PIN (still required).
 */
export async function revealCostPrices({ data }: { data: { pin: string } }) {
  z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(data);

  const pinRes = await verifyAdminPin({ data });
  if (!pinRes.ok) return pinRes;

  if (typeof window !== "undefined" && !navigator.onLine) {
    const rows = await db().products.toArray();
    const map: Record<string, number> = {};
    for (const r of rows ?? []) {
      if (r.cost_price !== undefined) {
        map[r.id] = Number(r.cost_price);
      }
    }
    return { ok: true as const, costPrices: map };
  }

  try {
    const { data: rows, error: pErr } = await supabase.from("products").select("id, cost_price");
    if (pErr) throw new Error(pErr.message);
    const map: Record<string, number> = {};
    for (const r of rows ?? []) map[r.id] = Number(r.cost_price);
    return { ok: true as const, costPrices: map };
  } catch (err) {
    const rows = await db().products.toArray();
    const map: Record<string, number> = {};
    for (const r of rows ?? []) {
      if (r.cost_price !== undefined) {
        map[r.id] = Number(r.cost_price);
      }
    }
    return { ok: true as const, costPrices: map };
  }
}

/** Verify the admin PIN without returning any sensitive data. Used to gate edit access. */
export async function verifyAdminPin({ data }: { data: { pin: string } }) {
  z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(data);

  const incoming = await sha256Hex(data.pin);

  if (typeof window !== "undefined" && !navigator.onLine) {
    const cachedHash = await getMeta<string>("adminPinHash");
    if (!cachedHash) {
      return { ok: false as const, error: "Offline: PIN not cached. Connect online once to sync." };
    }
    if (incoming !== cachedHash) {
      return { ok: false as const, error: "wrong_pin" };
    }
    return { ok: true as const };
  }

  try {
    const { data: settings, error } = await supabase
      .from("app_settings")
      .select("admin_pin_hash")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!settings?.admin_pin_hash) {
      return {
        ok: false as const,
        error: "PIN not set. Set an Admin PIN in Settings.",
      };
    }

    // Cache it locally for offline use
    await setMeta("adminPinHash", settings.admin_pin_hash);

    if (incoming !== settings.admin_pin_hash) {
      return {
        ok: false as const,
        error: "wrong_pin",
      };
    }

    return {
      ok: true as const,
    };
  } catch (err) {
    // Fallback if network request fails unexpectedly
    const cachedHash = await getMeta<string>("adminPinHash");
    if (cachedHash) {
      if (incoming !== cachedHash) {
        return { ok: false as const, error: "wrong_pin" };
      }
      return { ok: true as const };
    }
    throw err;
  }
}

export async function setAdminPin({ data }: { data: { currentPin?: string; newPin: string } }) {
  z.object({
    currentPin: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
      .or(z.literal("")),
    newPin: z.string().regex(/^\d{4}$/),
  }).parse(data);

  const { data: authData, error: uErr } = await supabase.auth.getUser();
  const user = authData?.user;
  if (uErr || !user) return { ok: false as const, error: "Not authenticated." };

  // Only admins can set the PIN
  const { data: roleRow, error: rErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);
  if (!roleRow) return { ok: false as const, error: "Only admin can set the PIN." };

  const { data: settings, error: sErr } = await supabase
    .from("app_settings")
    .select("admin_pin_hash")
    .eq("id", 1)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);

  if (settings?.admin_pin_hash) {
    if (!data.currentPin) return { ok: false as const, error: "Enter current PIN." };
    const cur = await sha256Hex(data.currentPin);
    if (cur !== settings.admin_pin_hash) return { ok: false as const, error: "wrong_pin" };
  }

  const newHash = await sha256Hex(data.newPin);

  const result = await supabase
    .from("app_settings")
    .update({
      admin_pin_hash: newHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select();

  if (!result.data || result.data.length === 0) {
    return {
      ok: false as const,
      error: "No rows updated",
    };
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  await setMeta("adminPinHash", newHash);

  return { ok: true as const };
}

/** Returns a short-lived signed URL for a stored product image path. */
export async function signedImageUrl({ data }: { data: { path: string } }) {
  z.object({ path: z.string().min(1).max(500) }).parse(data);

  const { data: signed, error } = await supabase.storage
    .from("product-images")
    .createSignedUrl(data.path, 60 * 60); // 1 hour
  if (error) throw new Error(error.message);
  return { url: signed.signedUrl };
}

export async function getMyRole() {
  if (typeof window !== "undefined" && !navigator.onLine) {
    const cachedRoles = await getMeta<string[]>("userRoles");
    return { roles: cachedRoles ?? [] };
  }

  try {
    const { data: authData, error: uErr } = await supabase.auth.getUser();
    const user = authData?.user;
    if (uErr || !user) {
      const cachedRoles = await getMeta<string[]>("userRoles");
      return { roles: cachedRoles ?? [] };
    }

    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as "admin" | "owner");
    await setMeta("userRoles", roles);
    return { roles };
  } catch (err) {
    const cachedRoles = await getMeta<string[]>("userRoles");
    return { roles: cachedRoles ?? [] };
  }
}
