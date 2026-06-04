import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256Hex(input: string) {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Verify the admin PIN and return a map of product id -> cost_price.
 * Admins are allowed without PIN if they pass their own PIN (still required).
 */
export const revealCostPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pin: string }) =>
    z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings, error } = await supabaseAdmin
      .from("app_settings")
      .select("admin_pin_hash")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!settings?.admin_pin_hash) {
      return { ok: false as const, error: "PIN not set. Set an Admin PIN in Settings." };
    }
    const incoming = await sha256Hex(data.pin);
    if (incoming !== settings.admin_pin_hash) {
      return { ok: false as const, error: "wrong_pin" };
    }
    const { data: rows, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, cost_price");
    if (pErr) throw new Error(pErr.message);
    const map: Record<string, number> = {};
    for (const r of rows ?? []) map[r.id] = Number(r.cost_price);
    return { ok: true as const, costPrices: map };
  });

export const setAdminPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { currentPin?: string; newPin: string }) =>
    z
      .object({
        currentPin: z.string().regex(/^\d{4}$/).optional().or(z.literal("")),
        newPin: z.string().regex(/^\d{4}$/),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only admins can set the PIN
    const { data: roleRow, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!roleRow) return { ok: false as const, error: "Only admin can set the PIN." };

    const { data: settings, error: sErr } = await supabaseAdmin
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
    const { error: upErr } = await supabaseAdmin
      .from("app_settings")
      .update({ admin_pin_hash: newHash, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const };
  });

/** Returns a short-lived signed URL for a stored product image path. */
export const signedImageUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string }) =>
    z.object({ path: z.string().min(1).max(500) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("product-images")
      .createSignedUrl(data.path, 60 * 60); // 1 hour
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { roles: (data ?? []).map((r) => r.role as "admin" | "owner") };
  });
