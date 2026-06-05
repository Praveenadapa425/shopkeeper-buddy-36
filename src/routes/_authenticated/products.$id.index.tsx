import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatINR } from "@/lib/format";
import { useEditUnlock } from "@/lib/editUnlock";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ProductImage";
import { ArrowLeft, Pencil } from "lucide-react";


export const Route = createFileRoute("/_authenticated/products/$id/")({
  component: ProductDetailsPage,
});

type Category = { id: string; name: string };

function ProductDetailsPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const { requireEdit } = useEditUnlock();
  const goEdit = () => requireEdit(() => nav({ to: "/products/$id/edit", params: { id } }));


  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, image_url, stock_qty, selling_price, low_stock_threshold, category_id, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: category } = useQuery({
    queryKey: ["category", product?.category_id],
    enabled: !!product?.category_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("id", product!.category_id!)
        .maybeSingle();
      if (error) throw error;
      return data as Category | null;
    },
  });

  if (isLoading) {
    return <p className="py-8 text-center text-muted-foreground">{t("loading")}</p>;
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/products" })} className="gap-1 -ml-2">
          <ArrowLeft className="h-5 w-5" /> {t("products")}
        </Button>
        <Card className="p-8 text-center text-muted-foreground">{t("no_products")}</Card>
      </div>
    );
  }

  const lowStock = product.stock_qty <= 0
    ? { label: t("out_of_stock"), variant: "destructive" as const }
    : product.stock_qty <= product.low_stock_threshold
    ? { label: t("low_stock"), variant: "warning" as const }
    : { label: t("in_stock"), variant: "secondary" as const };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => nav({ to: "/products" })} className="gap-1 -ml-2">
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("selling_price")}</p>
            <p className="mt-1 text-2xl font-bold text-primary">{formatINR(product.selling_price)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("stock")}</p>
            <p className="mt-1 text-2xl font-bold">{product.stock_qty}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("low_stock_threshold")}</p>
            <p className="mt-1 text-base">{product.low_stock_threshold}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("status")}</p>
            <div className="mt-1">
              {lowStock.variant === "warning" ? (
                <Badge className="bg-warning text-warning-foreground hover:bg-warning">{lowStock.label}</Badge>
              ) : (
                <Badge variant={lowStock.variant}>{lowStock.label}</Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Button size="lg" className="h-14 w-full gap-2 text-base font-semibold" onClick={goEdit}>
        <Pencil className="h-5 w-5" /> {t("edit_product")}
      </Button>

    </div>
  );
}
