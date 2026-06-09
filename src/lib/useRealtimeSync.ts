import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncCatalogData, syncProductData } from "@/lib/offline/cache";

/**
 * Subscribe to realtime changes on products, product_variants, and categories.
 * Invalidates relevant React Query caches so all open tabs/devices stay in sync.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("inventory-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, (payload) => {
        console.log("[Realtime Sync] Product change event received:", payload);
        const newProduct = payload.new as { id?: string } | undefined;
        const runSync = async () => {
          try {
            if (newProduct?.id) {
              await syncProductData(newProduct.id);
            } else {
              await syncCatalogData();
            }
          } catch (err) {
            console.error("[Realtime Sync] Catalog sync failed during realtime update:", err);
          } finally {
            qc.invalidateQueries({ queryKey: ["products"] });
            qc.invalidateQueries({ queryKey: ["products-stats"] });
            if (newProduct?.id) {
              qc.invalidateQueries({ queryKey: ["product", newProduct.id] });
              qc.invalidateQueries({ queryKey: ["product-variants", newProduct.id] });
            }
          }
        };
        void runSync();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_variants" },
        (payload) => {
          console.log("[Realtime Sync] Variant change event received:", payload);
          const newVariant = payload.new as { product_id?: string } | undefined;
          const runSync = async () => {
            try {
              if (newVariant?.product_id) {
                await syncProductData(newVariant.product_id);
              } else {
                await syncCatalogData();
              }
            } catch (err) {
              console.error(
                "[Realtime Sync] Catalog sync failed during variant realtime update:",
                err,
              );
            } finally {
              qc.invalidateQueries({ queryKey: ["products"] });
              qc.invalidateQueries({ queryKey: ["products-stats"] });
              if (newVariant?.product_id) {
                qc.invalidateQueries({ queryKey: ["product", newVariant.product_id] });
                qc.invalidateQueries({ queryKey: ["product-variants", newVariant.product_id] });
              }
            }
          };
          void runSync();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, (payload) => {
        console.log("[Realtime Sync] Category change event received:", payload);
        const runSync = async () => {
          try {
            await syncCatalogData();
          } catch (err) {
            console.error(
              "[Realtime Sync] Catalog sync failed during category realtime update:",
              err,
            );
          } finally {
            qc.invalidateQueries({ queryKey: ["categories"] });
            qc.invalidateQueries({ queryKey: ["products"] });
          }
        };
        void runSync();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_stock" },
        (payload) => {
          console.log("[Realtime Sync] Stock change event received:", payload);
          const runSync = async () => {
            try {
              await syncCatalogData();
            } catch (err) {
              console.error(
                "[Realtime Sync] Catalog sync failed during stock realtime update:",
                err,
              );
            } finally {
              qc.invalidateQueries({ queryKey: ["products"] });
              qc.invalidateQueries({ queryKey: ["products-stats"] });
              qc.invalidateQueries({ queryKey: ["inventory-stock"] });
            }
          };
          void runSync();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
