import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { setAdminPin, getMyRole } from "@/lib/api/inventory.functions";
import { useI18n, type Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { ShieldCheck, Languages, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const updatePin = useServerFn(setAdminPin);
  const myRole = useServerFn(getMyRole);

  useEffect(() => {
    myRole().then((r) => setRoles(r.roles)).catch(() => {});
  }, [myRole]);

  const isAdmin = roles.includes("admin");

  const handleSave = async () => {
    if (next.length !== 4) return;
    setSaving(true);
    try {
      const res = await updatePin({ data: { currentPin: current || undefined, newPin: next } });
      if (!res.ok) {
        toast.error(res.error === "wrong_pin" ? t("wrong_pin") : res.error);
      } else {
        toast.success(t("pin_saved"));
        setCurrent("");
        setNext("");
      }
    } catch (e) {
      toast.error(t("error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t("settings")}</h1>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Role</p>
            <p className="font-semibold">{isAdmin ? t("admin") : roles.includes("owner") ? t("owner") : "—"}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Languages className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">{t("language")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["en", "te"] as Lang[]).map((l) => (
            <Button
              key={l}
              variant={lang === l ? "default" : "outline"}
              size="lg"
              className="h-12"
              onClick={() => setLang(l)}
            >
              {l === "en" ? t("english") : t("telugu")}
            </Button>
          ))}
        </div>
      </Card>

      {isAdmin && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning/20 text-warning-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold">{t("set_admin_pin")}</h2>
          </div>

          <div className="space-y-2">
            <Label>{t("current_pin")}</Label>
            <InputOTP maxLength={4} value={current} onChange={setCurrent} inputMode="numeric">
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-12 w-12 text-xl" />
                <InputOTPSlot index={1} className="h-12 w-12 text-xl" />
                <InputOTPSlot index={2} className="h-12 w-12 text-xl" />
                <InputOTPSlot index={3} className="h-12 w-12 text-xl" />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <div className="space-y-2">
            <Label>{t("new_pin")}</Label>
            <InputOTP maxLength={4} value={next} onChange={setNext} inputMode="numeric">
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-12 w-12 text-xl" />
                <InputOTPSlot index={1} className="h-12 w-12 text-xl" />
                <InputOTPSlot index={2} className="h-12 w-12 text-xl" />
                <InputOTPSlot index={3} className="h-12 w-12 text-xl" />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button size="lg" className="h-12 w-full" onClick={handleSave} disabled={saving || next.length !== 4}>
            {saving ? t("loading") : t("save")}
          </Button>
        </Card>
      )}

      <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">{t("install_hint")}</p>
    </div>
  );
}
