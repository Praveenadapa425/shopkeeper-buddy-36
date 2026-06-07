import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { EditUnlockProvider } from "@/lib/editUnlock";
import { useRealtimeSync } from "@/lib/useRealtimeSync";

function AuthenticatedLayout() {
  useRealtimeSync();
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
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

