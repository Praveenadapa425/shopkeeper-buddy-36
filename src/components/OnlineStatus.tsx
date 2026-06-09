import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSyncStatus } from "@/lib/offline/useSyncStatus";
import { processQueue } from "@/lib/offline/queue";

function formatAgo(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Status pill: online / offline / syncing / synced, with last-sync timestamp. */
export function OnlineStatus() {
  const { t } = useI18n();
  const { status, pending, lastSync } = useSyncStatus();
  const [tick, setTick] = useState(0);

  // Rerender every minute so "ago" text stays fresh
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(i);
  }, []);
  void tick;

  const cfg =
    status === "offline"
      ? {
          Icon: CloudOff,
          label: t("status_offline"),
          cls: "bg-destructive text-destructive-foreground",
        }
      : status === "syncing"
        ? {
            Icon: RefreshCw,
            label: `${t("status_syncing")}${pending > 0 ? ` (${pending})` : ""}`,
            cls: "bg-amber-500 text-white",
            spin: true,
          }
        : status === "synced"
          ? {
              Icon: Check,
              label: `${t("status_synced")} · ${formatAgo(lastSync)}`,
              cls: "bg-emerald-600 text-white",
            }
          : { Icon: Cloud, label: t("status_online"), cls: "bg-emerald-600 text-white" };

  const Icon = cfg.Icon;
  return (
    <button
      type="button"
      onClick={() => void processQueue()}
      aria-label={cfg.label}
      className={`fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold shadow-md ${cfg.cls}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${cfg.spin ? "animate-spin" : ""}`} />
        {cfg.label}
      </span>
    </button>
  );
}
