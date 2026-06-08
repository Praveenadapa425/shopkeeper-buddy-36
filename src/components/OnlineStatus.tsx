import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Compact pill that shows when the device is offline (hides when online). */
export function OnlineStatus() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const [show, setShow] = useState(false);
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    setShow(!navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      setJustBack(true);
      setShow(true);
      setTimeout(() => setShow(false), 2500);
    };
    const onOffline = () => {
      setOnline(false);
      setJustBack(false);
      setShow(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!show) return null;
  return (
    <div
      role="status"
      className={`fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-md ${
        online
          ? "bg-emerald-600 text-white"
          : "bg-destructive text-destructive-foreground"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {online ? (justBack ? t("back_online") : t("online")) : t("offline")}
      </span>
    </div>
  );
}
