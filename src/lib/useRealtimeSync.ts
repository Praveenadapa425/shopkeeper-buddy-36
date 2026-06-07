import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to realtime changes on products, product_variants, and categories.
 * Invalidates relevant React Query caches so all open tabs/devices stay in sync.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("inventory-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.invalidateQueries({ queryKey: ["products-stats"] });
          qc.invalidateQueries({ queryKey: ["product"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_variants" },
        () => {
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.invalidateQueries({ queryKey: ["products-stats"] });
          qc.invalidateQueries({ queryKey: ["product-variants"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories" },
        () => {
          qc.invalidateQueries({ queryKey: ["categories"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
