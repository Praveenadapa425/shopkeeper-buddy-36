import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { EditUnlockProvider } from "@/lib/editUnlock";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { startSyncWatcher } from "@/lib/offline/queue";

function AuthenticatedLayout() {
  useRealtimeSync();
  useEffect(() => startSyncWatcher(), []);
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
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        return { user: data.user };
      }
    } catch (err) {
      // Ignore network errors when offline
    }

    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        return { user: data.session.user };
      }
    } catch (err) {
      // Ignore
    }

    throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});
