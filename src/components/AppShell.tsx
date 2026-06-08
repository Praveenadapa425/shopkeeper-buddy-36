import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Package, Settings as SettingsIcon, LogOut, Languages } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { OnlineStatus } from "@/components/OnlineStatus";
import { registerAppServiceWorker } from "@/lib/registerSW";


export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const loc = useLocation();
  const nav = useNavigate();
  const path = loc.pathname;

  useEffect(() => {
    registerAppServiceWorker();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };

  const tabs = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard"), match: (p: string) => p === "/" },
    { to: "/products", icon: Package, label: t("products"), match: (p: string) => p.startsWith("/products") },
    { to: "/settings", icon: SettingsIcon, label: t("settings"), match: (p: string) => p.startsWith("/settings") },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <OnlineStatus />
      <header className="safe-top sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">
              ₹
            </div>
            <span className="text-lg font-bold tracking-tight">{t("app_name")}</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLang(lang === "en" ? "te" : "en")}
              className="gap-1 px-2"
              aria-label="Toggle language"
            >
              <Languages className="h-4 w-4" />
              <span className="text-xs font-semibold">{lang === "en" ? "తెలుగు" : "EN"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-3">
          {tabs.map((tab) => {
            const active = tab.match(path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "scale-110" : ""} transition-transform`} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
