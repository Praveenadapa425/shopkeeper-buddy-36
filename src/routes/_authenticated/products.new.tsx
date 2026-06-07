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
import { Camera, ImagePlus, Trash2, ArrowLeft, Save, Plus, X } from "lucide-react";
import { toast } from "sonner";

type Category = { id: string; name: string };

type Mode = { kind: "create" } | { kind: "edit"; id: string };

type VariantRow = { id?: string; value: string; cost_price: string; selling_price: string; stock_quantity: string };

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
  const [variants, setVariants] = useState<VariantRow[]>([
    { value: "", cost_price: "", selling_price: "", stock_quantity: "0" },
  ]);
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

  const { data: existingVariants } = useQuery({
    queryKey: ["product-variants", mode.kind === "edit" ? mode.id : null],
    enabled: mode.kind === "edit",
    queryFn: async () => {
      if (mode.kind !== "edit") return [];
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, value, cost_price, selling_price, stock_quantity, sort_order")
        .eq("product_id", mode.id)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (existing) {
      setName(existing.name ?? "");
      setCategoryId(existing.category_id ?? "");
      setStockQty(String(existing.stock_qty ?? 0));
      setLowStock(String(existing.low_stock_threshold ?? 5));
      setImagePath(existing.image_url ?? null);
    }
  }, [existing]);

  useEffect(() => {
    if (existingVariants && existingVariants.length > 0) {
      setVariants(
        existingVariants.map((v) => ({
          id: v.id,
          value: v.value,
          cost_price: String((v as { cost_price?: number }).cost_price ?? ""),
          selling_price: String(v.selling_price ?? ""),
          stock_quantity: String((v as { stock_quantity?: number }).stock_quantity ?? 0),
        })),
      );
    } else if (existing && (!existingVariants || existingVariants.length === 0)) {
      setVariants([
        {
          value: "",
          cost_price: String(existing.cost_price ?? ""),
          selling_price: String(existing.selling_price ?? ""),
          stock_quantity: String(existing.stock_qty ?? 0),
        },
      ]);
    }
  }, [existingVariants, existing]);

  const updateVariant = (idx: number, patch: Partial<VariantRow>) => {
    setVariants((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addVariant = () =>
    setVariants((r) => [...r, { value: "", cost_price: "", selling_price: "", stock_quantity: "0" }]);
  const removeVariant = (idx: number) =>
    setVariants((r) => (r.length <= 1 ? r : r.filter((_, i) => i !== idx)));

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

    const cleaned = variants
      .map((v) => ({
        ...v,
        value: v.value.trim(),
        cost_price: v.cost_price.trim(),
        selling_price: v.selling_price.trim(),
        stock_quantity: v.stock_quantity.trim(),
      }))
      .filter((v) => v.value !== "" || v.cost_price !== "" || v.selling_price !== "");
    if (cleaned.length === 0) {
      toast.error(t("variant_required"));
      return;
    }
    for (const v of cleaned) {
      const sp = Number(v.selling_price);
      const cp = Number(v.cost_price);
      const sq = Number(v.stock_quantity || "0");
      if (
        !v.value ||
        !v.selling_price ||
        !v.cost_price ||
        !Number.isFinite(sp) ||
        sp < 0 ||
        !Number.isFinite(cp) ||
        cp < 0 ||
        !Number.isFinite(sq) ||
        sq < 0
      ) {
        toast.error(t("variant_invalid"));
        return;
      }
    }

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

      const firstPrice = Number(cleaned[0].selling_price);
      const firstCost = Number(cleaned[0].cost_price);
      const totalStock = cleaned.reduce((s, v) => s + Number(v.stock_quantity || "0"), 0);

      const payload = {
        name: name.trim(),
        category_id: cat,
        image_url: imagePath,
        stock_qty: totalStock,
        selling_price: firstPrice,
        cost_price: firstCost,
        low_stock_threshold: parseInt(lowStock || "5", 10),
      };

      let productId: string;
      if (mode.kind === "create") {
        const { data: u } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("products")
          .insert({ ...payload, created_by: u.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        productId = data.id;
      } else {
        productId = mode.id;
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
      }

      if (mode.kind === "edit") {
        const keepIds = cleaned.map((v) => v.id).filter((x): x is string => !!x);
        let delQ = supabase.from("product_variants").delete().eq("product_id", productId);
        if (keepIds.length > 0) delQ = delQ.not("id", "in", `(${keepIds.join(",")})`);
        const { error: delErr } = await delQ;
        if (delErr) throw delErr;
      }

      const rows = cleaned.map((v, i) => ({
        ...(v.id ? { id: v.id } : {}),
        product_id: productId,
        value: v.value,
        cost_price: Number(v.cost_price),
        selling_price: Number(v.selling_price),
        stock_quantity: Number(v.stock_quantity || "0"),
        sort_order: i,
      }));
      const { error: upErr } = await supabase
        .from("product_variants")
        .upsert(rows, { onConflict: "id" });
      if (upErr) throw upErr;

      toast.success(t("saved"));
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["products-stats"] });
      await qc.invalidateQueries({ queryKey: ["categories"] });
      await qc.invalidateQueries({ queryKey: ["product-variants"] });
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

        <div className="space-y-1.5">
          <Label htmlFor="low">{t("low_stock_threshold")}</Label>
          <Input id="low" type="number" inputMode="numeric" min="0" value={lowStock} onChange={(e) => setLowStock(e.target.value)} className="h-12" />
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Label>{t("variants")}</Label>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addVariant}>
            <Plus className="h-4 w-4" /> {t("add_variant")}
          </Button>
        </div>

        <div className="space-y-4">
          {variants.map((v, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`vv-${i}`} className="text-xs text-muted-foreground">
                    {t("variant_value")}
                  </Label>
                  <Input
                    id={`vv-${i}`}
                    value={v.value}
                    onChange={(e) => updateVariant(i, { value: e.target.value })}
                    placeholder="250ml"
                    required
                    className="h-12"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 text-destructive"
                  aria-label={t("remove")}
                  disabled={variants.length <= 1}
                  onClick={() => removeVariant(i)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`vc-${i}`} className="text-xs text-muted-foreground">
                    {t("cost_price")} (₹)
                  </Label>
                  <Input
                    id={`vc-${i}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={v.cost_price}
                    onChange={(e) => updateVariant(i, { cost_price: e.target.value })}
                    required
                    className="h-12"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`vp-${i}`} className="text-xs text-muted-foreground">
                    {t("selling_price")} (₹)
                  </Label>
                  <Input
                    id={`vp-${i}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={v.selling_price}
                    onChange={(e) => updateVariant(i, { selling_price: e.target.value })}
                    required
                    className="h-12"
                  />
                </div>
              </div>
            </div>
          ))}
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
