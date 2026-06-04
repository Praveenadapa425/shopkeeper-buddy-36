import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Languages } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [{ title: "Sign in — Shop Inventory" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
      }
      nav({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">₹</div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">{t("app_name")}</h1>
              <p className="text-sm text-muted-foreground">{t("tagline")}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === "en" ? "te" : "en")} className="gap-1">
            <Languages className="h-4 w-4" />
            <span className="text-xs font-semibold">{lang === "en" ? "తె" : "EN"}</span>
          </Button>
        </div>

        <Card className="space-y-5 p-6">
          <h2 className="text-lg font-semibold">
            {mode === "login" ? t("sign_in_to_continue") : t("signup")}
          </h2>
          <form onSubmit={handle} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" required autoComplete="email" inputMode="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </div>
            <Button type="submit" size="lg" className="h-12 w-full text-base font-semibold" disabled={loading}>
              {loading ? t("loading") : mode === "login" ? t("login") : t("signup")}
            </Button>
          </form>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? t("signup") : t("login")}
          </button>
          {mode === "signup" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t("signup_hint")}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
