import { useEffect, useState } from "react";
import { getMeta } from "./db";
import { isSyncing, pendingCount, subscribeQueue } from "./queue";

export type SyncStatus = "online" | "offline" | "syncing" | "synced";

export function useSyncStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    const refresh = async () => {
      setPending(await pendingCount());
      setSyncing(isSyncing());
      const t = await getMeta<number>("lastSyncAt");
      setLastSync(t ?? null);
    };
    void refresh();
    const unsub = subscribeQueue(() => void refresh());
    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = window.setInterval(refresh, 5000);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(interval);
    };
  }, []);

  const status: SyncStatus = !online
    ? "offline"
    : syncing || pending > 0
      ? "syncing"
      : lastSync
        ? "synced"
        : "online";

  return { status, online, pending, syncing, lastSync };
}
