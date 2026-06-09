import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatINR, formatNumber } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { CostPriceReveal } from "@/components/CostPriceReveal";
import { Package, Boxes, IndianRupee, TrendingUp, AlertTriangle } from "lucide-react";
import {
  cacheProducts,
  cacheStock,
  getCachedProducts,
  isOnline,
  queueThumbnailPreload,
} from "@/lib/offlineCache";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

type ProductRow = {
  id: string;
  name: string;
  stock_qty: number;
  selling_price: number;
  low_stock_threshold: number;
};

function Dashboard() {
  const { t } = useI18n();
  const [costPrices, setCostPrices] = useState<Record<string, number> | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-stats"],
    queryFn: async () => {
      const cached = await getCachedProducts();
      return cached as ProductRow[];
    },
  });

  const totalProducts = products.length;
  const totalStock = products.reduce((s, p) => s + (p.stock_qty || 0), 0);
  const lowStock = products.filter((p) => p.stock_qty <= (p.low_stock_threshold ?? 5));
  const inventoryValue = costPrices
    ? products.reduce((s, p) => s + (costPrices[p.id] ?? 0) * (p.stock_qty || 0), 0)
    : products.reduce((s, p) => s + Number(p.selling_price) * (p.stock_qty || 0), 0);
  const estimatedProfit = costPrices
    ? products.reduce(
        (s, p) => s + (Number(p.selling_price) - (costPrices[p.id] ?? 0)) * (p.stock_qty || 0),
        0,
      )
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard")}</h1>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label={t("total_products")}
          value={isLoading ? "…" : formatNumber(totalProducts)}
          tone="primary"
        />
        <StatCard
          icon={<Boxes className="h-5 w-5" />}
          label={t("total_stock")}
          value={isLoading ? "…" : formatNumber(totalStock)}
          tone="accent"
        />
        <StatCard
          icon={<IndianRupee className="h-5 w-5" />}
          label={
            costPrices ? t("inventory_value") : `${t("inventory_value")} (${t("selling_price")})`
          }
          value={isLoading ? "…" : formatINR(inventoryValue)}
          tone="warning"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={t("estimated_profit")}
          value={estimatedProfit == null ? t("hidden") : formatINR(estimatedProfit)}
          tone="success"
        />
      </div>

      <div className="flex justify-center">
        <CostPriceReveal costPrices={costPrices} setCostPrices={setCostPrices} />
      </div>

      {lowStock.length > 0 && (
        <Card className="space-y-2 border-warning/40 bg-warning/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {t("low_stock")} ({lowStock.length})
          </div>
          <ul className="divide-y divide-border/60">
            {lowStock.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate">{p.name}</span>
                <span className="font-semibold text-warning">
                  {p.stock_qty} {t("units")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!isLoading && products.length === 0 && !isOnline() && (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          Connect to the internet once to sync your inventory for offline viewing.
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "accent" | "success" | "warning";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/15 text-accent",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
  } as const;
  return (
    <Card className="p-4">
      <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>
        {icon}
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}
