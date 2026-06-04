import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { signedImageUrl } from "@/lib/api/inventory.functions";

/** Renders a product image stored at a path in product-images bucket, via a short-lived signed URL. */
export function ProductImage({ path, alt, className }: { path: string | null; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const sign = useServerFn(signedImageUrl);

  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    sign({ data: { path } })
      .then((res) => {
        if (active) setUrl(res.url);
      })
      .catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [path, sign]);

  if (!path || !url) {
    return (
      <div className={`grid place-items-center bg-muted text-muted-foreground ${className ?? ""}`}>
        <Package className="h-8 w-8" />
      </div>
    );
  }
  return <img src={url} alt={alt} className={`object-cover ${className ?? ""}`} loading="lazy" />;
}
