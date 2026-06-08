import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { signedImageUrl } from "@/lib/api/inventory.functions";

/** Build the thumbnail storage path from a full-image path. */
export function thumbPathFor(path: string | null): string | null {
  if (!path) return null;
  return `thumb_${path}`;
}

/**
 * Renders a product image stored at a path in product-images bucket via a
 * short-lived signed URL. Pass `variant="thumb"` to load the small thumbnail
 * generated at upload time; falls back to the full image if no thumb exists.
 */
export function ProductImage({
  path,
  alt,
  className,
  variant = "full",
}: {
  path: string | null;
  alt: string;
  className?: string;
  variant?: "thumb" | "full";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const sign = useServerFn(signedImageUrl);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setUrl(null);
    if (!path) return;

    const wantThumb = variant === "thumb";
    const primary = wantThumb ? `thumb_${path}` : path;

    sign({ data: { path: primary } })
      .then((res) => {
        if (active) setUrl(res.url);
      })
      .catch(() => {
        // Fallback: if thumb missing, try full image
        if (!active || !wantThumb) {
          if (active) setUrl(null);
          return;
        }
        sign({ data: { path } })
          .then((res) => active && setUrl(res.url))
          .catch(() => active && setUrl(null));
      });

    return () => {
      active = false;
    };
  }, [path, variant, sign]);

  if (!path) {
    return (
      <div className={`grid place-items-center bg-muted text-muted-foreground ${className ?? ""}`}>
        <Package className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-muted ${className ?? ""}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />
      )}
      {url && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
