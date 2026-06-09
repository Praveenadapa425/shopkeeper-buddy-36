import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@/lib/useServerFn";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { verifyAdminPin } from "@/lib/api/inventory.functions";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

const STORAGE_KEY = "edit_unlocked";

type Ctx = {
  isUnlocked: () => boolean;
  requireEdit: (onSuccess: () => void) => void;
  lock: () => void;
};

const EditUnlockContext = createContext<Ctx | null>(null);

export function EditUnlockProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const successRef = useRef<(() => void) | null>(null);
  const verify = useServerFn(verifyAdminPin);

  const isUnlocked = useCallback(
    () => typeof window !== "undefined" && sessionStorage.getItem(STORAGE_KEY) === "1",
    [],
  );

  const requireEdit = useCallback((onSuccess: () => void) => {
    if (typeof window !== "undefined" && sessionStorage.getItem(STORAGE_KEY) === "1") {
      onSuccess();
      return;
    }
    successRef.current = onSuccess;
    setPin("");
    setOpen(true);
  }, []);

  const lock = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const handleSubmit = async () => {
    if (pin.length !== 4 || submitting) return;
    setSubmitting(true);
    try {
      const res = await verify({ data: { pin } });
      if (!res.ok) {
        toast.error(res.error === "wrong_pin" ? t("wrong_pin") : res.error);
        setPin("");
      } else {
        sessionStorage.setItem(STORAGE_KEY, "1");
        setOpen(false);
        setPin("");
        const cb = successRef.current;
        successRef.current = null;
        cb?.();
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setSubmitting(false);
    }
  };

  const value = useMemo<Ctx>(() => ({ isUnlocked, requireEdit, lock }), [isUnlocked, requireEdit, lock]);

  return (
    <EditUnlockContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setPin("");
            successRef.current = null;
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" /> {t("enter_admin_pin")}
            </DialogTitle>
            <DialogDescription>{t("edit_product")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={setPin}
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-14 w-14 text-2xl" />
                <InputOTPSlot index={1} className="h-14 w-14 text-2xl" />
                <InputOTPSlot index={2} className="h-14 w-14 text-2xl" />
                <InputOTPSlot index={3} className="h-14 w-14 text-2xl" />
              </InputOTPGroup>
            </InputOTP>
            <Button
              size="lg"
              className="h-12 w-full"
              disabled={pin.length !== 4 || submitting}
              onClick={handleSubmit}
            >
              {submitting ? t("loading") : t("save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </EditUnlockContext.Provider>
  );
}

export function useEditUnlock() {
  const ctx = useContext(EditUnlockContext);
  if (!ctx) throw new Error("useEditUnlock must be used inside EditUnlockProvider");
  return ctx;
}
