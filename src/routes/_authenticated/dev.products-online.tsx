import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ProductImage";
import { Search, ArrowLeft, RefreshCw, SlidersHorizontal, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dev/products-online")({
  component: DevProductsOnlinePage,
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
  product_variants: OnlineVariant[];
};

function DevProductsOnlinePage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  // Fetch categories directly from Supabase
  const { data: cats = [], refetch: refetchCats } = useQuery({
    queryKey: ["dev-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch products directly from Supabase
  const {
    data: products = [],
    isLoading,
    isError,
    error,
    refetch: refetchProducts,
    isFetching,
  } = useQuery<OnlineProduct[]>({
    queryKey: ["dev-products-online"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, name, image_url, stock_qty, selling_price, cost_price, low_stock_threshold, category_id, created_at, updated_at,
          product_variants (
            id, product_id, value, cost_price, selling_price, stock_quantity, sort_order
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as OnlineProduct[];
    },
  });

  const handleRefresh = async () => {
    await Promise.all([refetchCats(), refetchProducts()]);
  };

  const filteredAndSorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let result = [...products];

    // 1. Category Filter
    if (cat !== "all") {
      result = result.filter((p) => p.category_id === cat);
    }

    // 2. Search Filter (by product name, case-insensitive, partial matching)
    if (needle) {
      result = result.filter((p) => {
        const productName = p.name ? String(p.name).toLowerCase() : "";
        return productName.includes(needle);
      });
    }

    // 3. Stock Status Filter
    if (stockFilter !== "all") {
      result = result.filter((p) => {
        if (stockFilter === "in_stock") {
          return p.stock_qty > 0;
        }
        if (stockFilter === "low_stock") {
          return p.stock_qty > 0 && p.stock_qty <= p.low_stock_threshold;
        }
        if (stockFilter === "out_of_stock") {
          return p.stock_qty <= 0;
        }
        return true;
      });
    }

    // 4. Sorting
    result.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === "name-asc") {
        return (a.name || "").localeCompare(b.name || "");
      }
      if (sortBy === "name-desc") {
        return (b.name || "").localeCompare(a.name || "");
      }
      if (sortBy === "price-asc") {
        const priceA = a.product_variants?.[0]?.selling_price ?? a.selling_price;
        const priceB = b.product_variants?.[0]?.selling_price ?? b.selling_price;
        return priceA - priceB;
      }
      if (sortBy === "price-desc") {
        const priceA = a.product_variants?.[0]?.selling_price ?? a.selling_price;
        const priceB = b.product_variants?.[0]?.selling_price ?? b.selling_price;
        return priceB - priceA;
      }
      if (sortBy === "stock-asc") {
        return a.stock_qty - b.stock_qty;
      }
      if (sortBy === "stock-desc") {
        return b.stock_qty - a.stock_qty;
      }
      return 0;
    });

    return result;
  }, [products, q, cat, stockFilter, sortBy]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => nav({ to: "/products" })}
            className="gap-1 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Dev: Products (Online-Only)</h1>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={isLoading || isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("refresh") || "Refresh"}
        </Button>
      </div>

      {/* Info Badge */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary-foreground/80 space-y-1">
        <p className="font-semibold text-primary">💡 Developer Sandbox Mode</p>
        <p>This page queries and displays live data directly from Supabase, bypassing Dexie, IndexedDB, and the offline cache. Great for validating online connection behavior.</p>
      </div>

      {/* Search Box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products directly on live data..."
          className="h-12 pl-10 text-base"
        />
      </div>

      {/* Category Filter Chips */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <CatChip active={cat === "all"} onClick={() => setCat("all")}>
          {t("all_categories")}
        </CatChip>
        {cats.map((c) => (
          <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
            {c.name}
          </CatChip>
        ))}
      </div>

      {/* Advanced Filters (Stock Status & Sorting) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock Status</label>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Inventory</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock Warning</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="newest">Newest Added</option>
            <option value="oldest">Oldest Added</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="price-asc">Price (Low to High)</option>
            <option value="price-desc">Price (High to Low)</option>
            <option value="stock-asc">Stock (Low to High)</option>
            <option value="stock-desc">Stock (High to Low)</option>
          </select>
        </div>
      </div>

      {/* Content States */}
      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">Loading products directly from Supabase…</p>
      ) : isError ? (
        <Card className="p-8 text-center border-destructive bg-destructive/5 text-destructive">
          <p className="font-semibold">Failed to fetch data directly from Supabase</p>
          <p className="text-xs mt-1 text-muted-foreground">{error instanceof Error ? error.message : "Network error"}</p>
          <Button onClick={handleRefresh} size="sm" className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" /> Retry Connection
          </Button>
        </Card>
      ) : filteredAndSorted.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No live products found matching your filters.
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredAndSorted.map((p) => (
            <li key={p.id}>
              <Card className="overflow-hidden p-0">
                <Link
                  to="/dev/product/$id"
                  params={{ id: p.id }}
                  className="block active:scale-[0.99] transition-transform"
                >
                  <div className="aspect-square w-full bg-muted">
                    <ProductImage
                      path={p.image_url}
                      alt={p.name}
                      variant="thumb"
                      className="h-full w-full"
                    />
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate text-base font-semibold">{p.name}</p>
                    <PriceLine product={p} />
                    <StockBadge qty={p.stock_qty} threshold={p.low_stock_threshold} />
                  </div>
                </Link>
                <div className="flex gap-2 border-t p-2">
                  <Button asChild variant="ghost" size="sm" className="flex-1 gap-1.5">
                    <Link to="/dev/product/$id" params={{ id: p.id }}>
                      <Eye className="h-4 w-4" /> View Live Details
                    </Link>
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

function CatChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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

function PriceLine({ product }: { product: OnlineProduct }) {
  const sortedVars = [...(product.product_variants || [])].sort((a, b) => a.sort_order - b.sort_order);
  const firstPrice = sortedVars[0]?.selling_price ?? product.selling_price;
  return <p className="text-lg font-bold text-primary">{formatINR(Number(firstPrice))}</p>;
}

function StockBadge({ qty, threshold }: { qty: number; threshold: number }) {
  const { t } = useI18n();
  if (qty <= 0) return <Badge variant="destructive">{t("out_of_stock") || "Out of Stock"}</Badge>;
  if (qty <= threshold)
    return (
      <Badge className="bg-warning text-warning-foreground hover:bg-warning">
        {qty} · {t("low_stock") || "Low Stock"}
      </Badge>
    );
  return (
    <Badge variant="secondary">
      {qty} {t("units") || "units"}
    </Badge>
  );
}
