import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ProductImage";
import { ArrowLeft, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dev/product/$id")({
  component: DevProductDetailsPage,
});

type OnlineVariant = {
  id: string;
  product_id: string;
  value: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  sort_order: number;
};

type OnlineProduct = {
  id: string;
  name: string;
  image_url: string | null;
  stock_qty: number;
  selling_price: number;
  cost_price: number;
  low_stock_threshold: number;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

function DevProductDetailsPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const nav = useNavigate();

  // Fetch product directly from Supabase
  const {
    data: product,
    isLoading: productLoading,
    isError: productError,
    error: prodErr,
    refetch: refetchProduct,
    isFetching: productFetching,
  } = useQuery<OnlineProduct | null>({
    queryKey: ["dev-product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as unknown as OnlineProduct | null;
    },
  });

  // Fetch product variants directly from Supabase
  const {
    data: variants = [],
    isLoading: variantsLoading,
    refetch: refetchVariants,
    isFetching: variantsFetching,
  } = useQuery<OnlineVariant[]>({
    queryKey: ["dev-product-variants", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, product_id, value, cost_price, selling_price, stock_quantity, sort_order")
        .eq("product_id", id)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as OnlineVariant[];
    },
  });

  // Fetch category directly from Supabase
  const categoryId = product?.category_id;
  const {
    data: category,
    isLoading: categoryLoading,
    refetch: refetchCategory,
    isFetching: categoryFetching,
  } = useQuery({
    queryKey: ["dev-category", categoryId],
    enabled: !!categoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("id", categoryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const handleRefresh = async () => {
    await Promise.all([refetchProduct(), refetchVariants(), refetchCategory()]);
  };

  const isLoading = productLoading || variantsLoading || (!!categoryId && categoryLoading);
  const isFetching = productFetching || variantsFetching || categoryFetching;

  if (isLoading) {
    return <p className="py-8 text-center text-muted-foreground">Loading product details directly from Supabase…</p>;
  }

  if (productError || !product) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav({ to: "/dev/products-online" })}
          className="gap-1 -ml-2"
        >
          <ArrowLeft className="h-5 w-5" /> Back to Online List
        </Button>
        <Card className="p-8 text-center border-destructive bg-destructive/5 text-destructive">
          <p className="font-semibold">Failed to fetch product details from Supabase</p>
          <p className="text-xs mt-1 text-muted-foreground">
            {prodErr instanceof Error ? prodErr.message : "Product not found or network connection offline."}
          </p>
          <Button onClick={handleRefresh} size="sm" className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" /> Retry Connection
          </Button>
        </Card>
      </div>
    );
  }

  const lowStock =
    product.stock_qty <= 0
      ? { label: t("out_of_stock") || "Out of Stock", variant: "destructive" as const }
      : product.stock_qty <= product.low_stock_threshold
        ? { label: t("low_stock") || "Low Stock", variant: "warning" as const }
        : { label: t("in_stock") || "In Stock", variant: "secondary" as const };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => nav({ to: "/dev/products-online" })}
          className="gap-1 -ml-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">Dev: Live Product Details</h1>
        <Button
          onClick={handleRefresh}
          variant="ghost"
          size="icon"
          disabled={isFetching}
          aria-label="Refresh Details"
        >
          <RefreshCw className={`h-5 w-5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Mode Warning */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary-foreground/85">
        <p className="font-semibold text-primary">💡 Developer Sandbox Details</p>
        <p className="mt-0.5">Viewing direct live records from Supabase. Offline caches (Dexie & raw IndexedDB) are bypassed.</p>
      </div>

      {/* Image Card */}
      <Card className="overflow-hidden p-0">
        <div className="aspect-square w-full bg-muted">
          <ProductImage path={product.image_url} alt={product.name} className="h-full w-full" />
        </div>
      </Card>

      {/* Info Card */}
      <Card className="space-y-4 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("name") || "Name"}</p>
          <p className="mt-1 text-xl font-bold">{product.name}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("category") || "Category"}</p>
          <p className="mt-1 text-base">{category?.name ?? t("none") ?? "None"}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("stock") || "Stock"}</p>
            <p className="mt-1 text-2xl font-bold">{product.stock_qty}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("low_stock_threshold") || "Low Stock Threshold"}
            </p>
            <p className="mt-1 text-base">{product.low_stock_threshold}</p>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("status") || "Status"}</p>
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

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Created At</p>
            <p className="text-xs mt-0.5 text-muted-foreground">
              {new Date(product.created_at).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Updated At</p>
            <p className="text-xs mt-0.5 text-muted-foreground">
              {new Date(product.updated_at).toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      {/* Variants Card */}
      <Card className="space-y-3 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("variants") || "Variants"}</p>
        {variants.length === 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("selling_price") || "Selling Price"}
            </p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {formatINR(product.selling_price)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Cost Price: {formatINR(product.cost_price)}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2.5">
                <div className="flex flex-col">
                  <span className="text-base font-medium">{v.value}</span>
                  <span className="text-xs text-muted-foreground">
                    {v.stock_quantity} units
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Cost: {formatINR(v.cost_price)}
                  </span>
                </div>
                <span className="text-lg font-bold text-primary">
                  {formatINR(Number(v.selling_price))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
