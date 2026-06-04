import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ProductImage";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type Product = {
  id: string;
  name: string;
  image_url: string | null;
  stock_qty: number;
  selling_price: number;
  low_stock_threshold: number;
  category_id: string | null;
};

type Category = { id: string; name: string };

function ProductsPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  const { data: cats = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, image_url, stock_qty, selling_price, low_stock_threshold, category_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== "all" && p.category_id !== cat) return false;
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [products, q, cat]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("products")}</h1>
        <Button asChild size="lg" className="h-11 gap-2">
          <Link to="/products/new">
            <Plus className="h-5 w-5" /> {t("add_product")}
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          className="h-12 pl-10 text-base"
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <CatChip active={cat === "all"} onClick={() => setCat("all")}>{t("all_categories")}</CatChip>
        {cats.map((c) => (
          <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
            {c.name}
          </CatChip>
        ))}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">{t("no_products")}</Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link to="/products/$id/edit" params={{ id: p.id }}>
                <Card className="flex items-center gap-4 p-3 active:scale-[0.99] transition-transform">
                  <ProductImage path={p.image_url} alt={p.name} className="h-20 w-20 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{p.name}</p>
                    <p className="mt-0.5 text-lg font-bold text-primary">{formatINR(p.selling_price)}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <StockBadge qty={p.stock_qty} threshold={p.low_stock_threshold} />
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StockBadge({ qty, threshold }: { qty: number; threshold: number }) {
  const { t } = useI18n();
  if (qty <= 0) return <Badge variant="destructive">{t("out_of_stock")}</Badge>;
  if (qty <= threshold) return <Badge className="bg-warning text-warning-foreground hover:bg-warning">{qty} · {t("low_stock")}</Badge>;
  return <Badge variant="secondary">{qty} {t("units")}</Badge>;
}
