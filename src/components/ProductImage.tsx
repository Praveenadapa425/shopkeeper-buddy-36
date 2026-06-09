import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { useServerFn } from "@/lib/useServerFn";
import { signedImageUrl } from "@/lib/api/inventory.functions";
import { cacheImage, getCachedImage, isOnline } from "@/lib/offlineCache";

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
    let objectUrl: string | null = null;
    setLoaded(false);
    setUrl(null);
    if (!path) return;

    const wantThumb = variant === "thumb";
    const primary = wantThumb ? `thumb_${path}` : path;
    const secondary = wantThumb ? path : `thumb_${path}`;

    const setBlobUrl = (blob: Blob) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      if (active) setUrl(objectUrl);
    };

    const loadCached = async (key: string) => {
      const cached = await getCachedImage(key);
      if (cached && active) {
        setBlobUrl(cached);
        return true;
      }
      return false;
    };

    const loadRemote = async (key: string) => {
      const res = await sign({ data: { path: key } });
      const img = await fetch(res.url);
      if (!img.ok) throw new Error("Image fetch failed");
      const blob = await img.blob();

      const type = key.startsWith("thumb_") ? "thumb" : "full";
      await cacheImage(key, blob, undefined, type);
      if (active) setBlobUrl(blob);
    };

    const run = async () => {
      if (!isOnline()) {
        const found = await loadCached(primary);
        if (!found) {
          console.log(
            `[Offline Cache] Offline image missing for primary key: ${primary}. Trying fallback...`,
          );
          const foundSec = await loadCached(secondary);
          if (foundSec) {
            console.log(
              `[Offline Cache] Thumbnail fallback usage: successfully fell back to key ${secondary}`,
            );
          }
        }
        return;
      }

      try {
        await loadRemote(primary);
      } catch {
        const found = await loadCached(primary);
        if (found) return;

        console.log(
          `[Offline Cache] Remote load failed for primary key: ${primary}. Trying fallback...`,
        );
        const foundSec = await loadCached(secondary);
        if (foundSec) {
          console.log(
            `[Offline Cache] Thumbnail fallback usage: successfully fell back to key ${secondary}`,
          );
          return;
        }

        try {
          const res = await sign({ data: { path: secondary } });
          const img = await fetch(res.url);
          if (!img.ok) throw new Error("Fallback image fetch failed");
          const blob = await img.blob();

          const primaryType = primary.startsWith("thumb_") ? "thumb" : "full";
          const secondaryType = secondary.startsWith("thumb_") ? "thumb" : "full";
          await cacheImage(secondary, blob, undefined, secondaryType);
          await cacheImage(primary, blob, undefined, primaryType);
          if (active) setBlobUrl(blob);
        } catch {
          // Ignore
        }
      }
    };

    void run();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
      {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />}
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
