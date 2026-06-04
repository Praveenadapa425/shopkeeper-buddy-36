import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ProductImage } from "@/components/ProductImage";
import { Camera, ImagePlus, Trash2, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

type Category = { id: string; name: string };

type Mode = { kind: "create" } | { kind: "edit"; id: string };

export function ProductForm({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [newCat, setNewCat] = useState("");
  const [stockQty, setStockQty] = useState<string>("0");
  const [sellingPrice, setSellingPrice] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");
  const [lowStock, setLowStock] = useState<string>("5");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: cats = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["product", mode.kind === "edit" ? mode.id : null],
    enabled: mode.kind === "edit",
    queryFn: async () => {
      if (mode.kind !== "edit") return null;
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", mode.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (existing) {
      setName(existing.name ?? "");
      setCategoryId(existing.category_id ?? "");
      setStockQty(String(existing.stock_qty ?? 0));
      setSellingPrice(String(existing.selling_price ?? ""));
      setCostPrice(String(existing.cost_price ?? ""));
      setLowStock(String(existing.low_stock_threshold ?? 5));
      setImagePath(existing.image_url ?? null);
    }
  }, [existing]);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
      if (error) throw error;
      setImagePath(path);
      setImagePreview(URL.createObjectURL(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setUploading(false);
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let cat = categoryId || null;
      if (newCat.trim()) {
        const { data, error } = await supabase
          .from("categories")
          .insert({ name: newCat.trim() })
          .select("id")
          .single();
        if (error) throw error;
        cat = data.id;
      }

      const payload = {
        name: name.trim(),
        category_id: cat,
        image_url: imagePath,
        stock_qty: parseInt(stockQty || "0", 10),
        selling_price: Number(sellingPrice || 0),
        cost_price: Number(costPrice || 0),
        low_stock_threshold: parseInt(lowStock || "5", 10),
      };

      if (mode.kind === "create") {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("products")
          .insert({ ...payload, created_by: u.user?.id ?? null });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").update(payload).eq("id", mode.id);
        if (error) throw error;
      }
      toast.success(t("saved"));
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["products-stats"] });
      await qc.invalidateQueries({ queryKey: ["categories"] });
      nav({ to: "/products" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (mode.kind !== "edit") return;
    if (!confirm(t("confirm_delete"))) return;
    const { error } = await supabase.from("products").delete().eq("id", mode.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("saved"));
    await qc.invalidateQueries({ queryKey: ["products"] });
    await qc.invalidateQueries({ queryKey: ["products-stats"] });
    nav({ to: "/products" });
  };

  return (
    <form onSubmit={onSave} className="space-y-5">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => nav({ to: "/products" })} className="gap-1 -ml-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">
          {mode.kind === "create" ? t("add_product") : t("edit_product")}
        </h1>
        <div className="w-9" />
      </div>

      <Card className="space-y-3 p-4">
        <Label>{t("image")}</Label>
        <div className="flex items-center gap-4">
          {imagePreview ? (
            <img src={imagePreview} alt="" className="h-24 w-24 rounded-xl object-cover" />
          ) : (
            <ProductImage path={imagePath} alt={name} className="h-24 w-24 rounded-xl" />
          )}
          <div className="flex flex-1 flex-col gap-2">
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="secondary" size="lg" className="gap-2" onClick={() => cameraRef.current?.click()} disabled={uploading}>
              <Camera className="h-5 w-5" /> {t("take_photo")}
            </Button>
            <Button type="button" variant="outline" size="lg" className="gap-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <ImagePlus className="h-5 w-5" /> {t("choose_photo")}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="h-12" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cat">{t("category")}</Label>
          <select
            id="cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="flex h-12 w-full rounded-md border border-input bg-background px-3 text-base"
          >
            <option value="">{t("none")}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            placeholder={t("new_category")}
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            className="mt-2 h-11"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="stock">{t("stock")}</Label>
            <Input id="stock" type="number" inputMode="numeric" min="0" value={stockQty} onChange={(e) => setStockQty(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="low">{t("low_stock_threshold")}</Label>
            <Input id="low" type="number" inputMode="numeric" min="0" value={lowStock} onChange={(e) => setLowStock(e.target.value)} className="h-12" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sp">{t("selling_price")} (₹)</Label>
          <Input id="sp" type="number" inputMode="decimal" min="0" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} required className="h-12" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cp">{t("cost_price")} (₹)</Label>
          <Input id="cp" type="number" inputMode="decimal" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} required className="h-12" />
        </div>
      </Card>

      <div className="space-y-2">
        <Button type="submit" size="lg" className="h-14 w-full gap-2 text-base font-semibold" disabled={saving || uploading}>
          <Save className="h-5 w-5" /> {saving ? t("loading") : t("save")}
        </Button>
        {mode.kind === "edit" && (
          <Button type="button" variant="destructive" size="lg" className="h-12 w-full gap-2" onClick={onDelete}>
            <Trash2 className="h-5 w-5" /> {t("delete")}
          </Button>
        )}
      </div>
    </form>
  );
}

export const Route = createFileRoute("/_authenticated/products/new")({
  component: () => <ProductForm mode={{ kind: "create" }} />,
});
