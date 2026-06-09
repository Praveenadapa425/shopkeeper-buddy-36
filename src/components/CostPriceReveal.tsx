import { useState } from "react";
import { useServerFn } from "@/lib/useServerFn";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { revealCostPrices } from "@/lib/api/inventory.functions";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

type CostMap = Record<string, number>;

type Props = {
  costPrices: CostMap | null;
  setCostPrices: (m: CostMap | null) => void;
};

export function CostPriceReveal({ costPrices, setCostPrices }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reveal = useServerFn(revealCostPrices);

  const revealed = costPrices !== null;

  const onSubmit = async () => {
    if (pin.length !== 4) return;
    setSubmitting(true);
    try {
      const res = await reveal({ data: { pin } });
      if (!res.ok) {
        toast.error(res.error === "wrong_pin" ? t("wrong_pin") : res.error);
        setPin("");
      } else {
        setCostPrices(res.costPrices);
        setOpen(false);
        setPin("");
        toast.success(t("saved"));
      }
    } catch (e) {
      toast.error(t("error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (revealed) {
    return (
      <Button variant="outline" size="lg" className="gap-2" onClick={() => setCostPrices(null)}>
        <EyeOff className="h-4 w-4" />
        {t("hide_cost_price")}
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="lg" className="gap-2" onClick={() => setOpen(true)}>
        <Eye className="h-4 w-4" />
        {t("show_cost_price")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" /> {t("enter_admin_pin")}
            </DialogTitle>
            <DialogDescription>{t("cost_price")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <InputOTP maxLength={4} value={pin} onChange={setPin} autoFocus inputMode="numeric">
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-14 w-14 text-2xl" />
                <InputOTPSlot index={1} className="h-14 w-14 text-2xl" />
                <InputOTPSlot index={2} className="h-14 w-14 text-2xl" />
                <InputOTPSlot index={3} className="h-14 w-14 text-2xl" />
              </InputOTPGroup>
            </InputOTP>
            <Button
              size="lg"
              className="w-full"
              disabled={pin.length !== 4 || submitting}
              onClick={onSubmit}
            >
              {submitting ? t("loading") : t("show_cost_price")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
