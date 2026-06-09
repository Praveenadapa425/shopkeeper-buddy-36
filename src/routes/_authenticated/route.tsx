import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { EditUnlockProvider } from "@/lib/editUnlock";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { startSyncWatcher } from "@/lib/offline/queue";
import { getCachedProducts, getLastSync } from "@/lib/offlineCache";
import { syncCatalogData } from "@/lib/offline/cache";
import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function AuthenticatedLayout() {
  useRealtimeSync();
  useEffect(() => startSyncWatcher(), []);

  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    const runSync = async () => {
      if (typeof window !== "undefined" && !navigator.onLine) return;
      try {
        console.log("[Background Sync] Starting background catalog sync...");
        await syncCatalogData();
        if (active) {
          console.log("[Background Sync] Sync completed. Refreshing UI queries.");
          void queryClient.invalidateQueries();
        }
      } catch (err) {
        console.error("[Background Sync] Sync failed:", err);
      }
    };

    void runSync();

    const handleOnline = () => {
      void runSync();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
    };
  }, [queryClient]);

  const [hasCache, setHasCache] = useState<boolean | null>(null);

  useEffect(() => {
    const checkCache = async () => {
      const syncTime = await getLastSync();
      const products = await getCachedProducts();
      setHasCache(!!syncTime || products.length > 0);
    };
    void checkCache();
  }, []);

  if (hasCache === null) {
    return <p className="py-8 text-center text-muted-foreground">Loading…</p>;
  }

  // If offline and no cache exists, show blocking offline page
  if (typeof window !== "undefined" && !navigator.onLine && !hasCache) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md space-y-6">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <CloudOff className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">You're Offline</h1>
            <p className="text-muted-foreground text-sm">
              No cached data is available on this device. Please connect to the internet once to
              sync the catalog.
            </p>
          </div>
          <Button onClick={() => window.location.reload()} size="lg" className="h-12 w-full gap-2">
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <EditUnlockProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </EditUnlockProvider>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Check if we have cached data locally first
    const syncTime = await getLastSync();
    const products = await getCachedProducts();
    const hasCache = !!syncTime || products.length > 0;

    if (hasCache) {
      // Try to get session locally (fast, no network call)
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          return { user: data.session.user };
        }
      } catch (err) {
        // ignore
      }
      // Return offline user to allow cached view immediately
      console.log(
        "[Offline Guard] Cached data exists. Allowing cached view without blocking on auth.",
      );
      return { user: { id: "offline_user", email: "offline@shop.buddy" } };
    }

    // If no cache, check offline status
    if (typeof window !== "undefined" && !navigator.onLine) {
      // Offline and no cache -> layout will render the offline page
      return { user: { id: "offline_user", email: "offline@shop.buddy" } };
    }

    // Online and no cache -> must authenticate and fetch data
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        return { user: data.user };
      }
    } catch (err) {
      // ignore
    }

    throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});
