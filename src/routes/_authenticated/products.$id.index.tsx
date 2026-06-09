import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { formatINR } from "@/lib/format";
import { useEditUnlock } from "@/lib/editUnlock";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ProductImage";
import { ArrowLeft, Pencil } from "lucide-react";
import { fetchCategory, fetchProduct, fetchVariants, syncProductData } from "@/lib/offline/cache";
import { isOnline } from "@/lib/offlineCache";

export const Route = createFileRoute("/_authenticated/products/$id/")({
  component: ProductDetailsPage,
});

function ProductDetailsPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const { requireEdit } = useEditUnlock();
  const goEdit = () => requireEdit(() => nav({ to: "/products/$id/edit", params: { id } }));

  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id),
  });

  useEffect(() => {
    let active = true;
    const runSync = async () => {
      if (typeof window !== "undefined" && !navigator.onLine) return;
      try {
        console.log(`[Product Sync] Starting background sync for product ${id}...`);
        await syncProductData(id);
        if (active) {
          console.log(`[Product Sync] Sync completed for ${id}. Refreshing details view.`);
          void queryClient.invalidateQueries({ queryKey: ["product", id] });
          void queryClient.invalidateQueries({ queryKey: ["product-variants", id] });
          if (product?.category_id) {
            void queryClient.invalidateQueries({ queryKey: ["category", product.category_id] });
          }
        }
      } catch (err) {
        console.error(`[Product Sync] Sync failed for product ${id}:`, err);
      }
    };

    void runSync();

    const handleOnline = () => {
      void runSync();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
    };
  }, [id, queryClient, product?.category_id]);

  const { data: category } = useQuery({
    queryKey: ["category", product?.category_id],
    enabled: !!product?.category_id,
    queryFn: () => fetchCategory(product!.category_id!),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ["product-variants", id],
    queryFn: () => fetchVariants(id),
  });

  if (isLoading) {
    return <p className="py-8 text-center text-muted-foreground">{t("loading")}</p>;
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav({ to: "/products" })}
          className="gap-1 -ml-2"
        >
          <ArrowLeft className="h-5 w-5" /> {t("products")}
        </Button>
        <Card className="p-8 text-center text-muted-foreground">
          {!isOnline()
            ? "Connect to the internet once to sync this product for offline viewing."
            : t("no_products")}
        </Card>
      </div>
    );
  }

  const lowStock =
    product.stock_qty <= 0
      ? { label: t("out_of_stock"), variant: "destructive" as const }
      : product.stock_qty <= product.low_stock_threshold
        ? { label: t("low_stock"), variant: "warning" as const }
        : { label: t("in_stock"), variant: "secondary" as const };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => nav({ to: "/products" })}
          className="gap-1 -ml-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">{t("product_details")}</h1>
        <Button variant="ghost" size="icon" aria-label={t("edit")} onClick={goEdit}>
          <Pencil className="h-5 w-5" />
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="aspect-square w-full bg-muted">
          <ProductImage path={product.image_url} alt={product.name} className="h-full w-full" />
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("name")}</p>
          <p className="mt-1 text-xl font-bold">{product.name}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("category")}</p>
          <p className="mt-1 text-base">{category?.name ?? t("none")}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("stock")}</p>
            <p className="mt-1 text-2xl font-bold">{product.stock_qty}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("low_stock_threshold")}
            </p>
            <p className="mt-1 text-base">{product.low_stock_threshold}</p>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("status")}</p>
          <div className="mt-1">
            {lowStock.variant === "warning" ? (
              <Badge className="bg-warning text-warning-foreground hover:bg-warning">
                {lowStock.label}
              </Badge>
            ) : (
              <Badge variant={lowStock.variant}>{lowStock.label}</Badge>
            )}
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("variants")}</p>
        {variants.length === 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("selling_price")}
            </p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {formatINR(product.selling_price)}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {variants.map((v) => {
              const sq = (v as { stock_quantity?: number }).stock_quantity ?? 0;
              return (
                <li key={v.id} className="flex items-center justify-between py-2.5">
                  <div className="flex flex-col">
                    <span className="text-base font-medium">{v.value}</span>
                    <span className="text-xs text-muted-foreground">
                      {sq} {t("units")}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-primary">
                    {formatINR(Number(v.selling_price))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Button size="lg" className="h-14 w-full gap-2 text-base font-semibold" onClick={goEdit}>
        <Pencil className="h-5 w-5" /> {t("edit_product")}
      </Button>
    </div>
  );
}
