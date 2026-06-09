import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { formatINR } from "@/lib/format";
import { useEditUnlock } from "@/lib/editUnlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ProductImage";
import { Plus, Search, Eye, Pencil } from "lucide-react";
import { fetchCategories, fetchProducts, type ProductRow } from "@/lib/offline/cache";
import { isOnline, queueThumbnailPreload } from "@/lib/offlineCache";


export const Route = createFileRoute("/_authenticated/products/")({
  component: ProductsPage,
});

function ProductsPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { requireEdit } = useEditUnlock();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");


  const { data: cats = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const rows = await fetchProducts();
      void queueThumbnailPreload(rows);
      return rows;
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
        <Card className="p-8 text-center text-muted-foreground">
          {!isOnline() && products.length === 0
            ? "Connect to the internet once to sync your products for offline viewing."
            : t("no_products")}
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <Card className="overflow-hidden p-0">
                <Link
                  to="/products/$id"
                  params={{ id: p.id }}
                  className="block active:scale-[0.99] transition-transform"
                  aria-label={`${t("view")} ${p.name}`}
                >
                  <div className="aspect-square w-full bg-muted">
                    <ProductImage path={p.image_url} alt={p.name} variant="thumb" className="h-full w-full" />
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate text-base font-semibold">{p.name}</p>
                    <PriceLine product={p} />
                    <StockBadge qty={p.stock_qty} threshold={p.low_stock_threshold} />
                  </div>

                </Link>
                <div className="flex gap-2 border-t p-2">
                  <Button asChild variant="ghost" size="sm" className="flex-1 gap-1.5">
                    <Link to="/products/$id" params={{ id: p.id }}>
                      <Eye className="h-4 w-4" /> {t("view")}
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => requireEdit(() => nav({ to: "/products/$id/edit", params: { id: p.id } }))}
                  >
                    <Pencil className="h-4 w-4" /> {t("edit")}
                  </Button>

                </div>
              </Card>
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

function PriceLine({ product }: { product: ProductRow }) {
  const variants = (product.product_variants ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const first = variants[0]?.selling_price ?? product.selling_price;
  return <p className="text-lg font-bold text-primary">{formatINR(Number(first))}</p>;
}

function StockBadge({ qty, threshold }: { qty: number; threshold: number }) {
  const { t } = useI18n();
  if (qty <= 0) return <Badge variant="destructive">{t("out_of_stock")}</Badge>;
  if (qty <= threshold) return <Badge className="bg-warning text-warning-foreground hover:bg-warning">{qty} · {t("low_stock")}</Badge>;
  return <Badge variant="secondary">{qty} {t("units")}</Badge>;
}
