/**
 * Client-side image optimization:
 * - resize so longest edge <= maxEdge
 * - encode to WebP at quality (with JPEG fallback)
 * - keep result under maxBytes by stepping quality down
 */

export type OptimizeResult = {
  blob: Blob;
  mime: string;
  ext: string;
  width: number;
  height: number;
};

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
  } finally {
    // Revoke after a tick so img.src remains usable
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function drawToCanvas(img: HTMLImageElement, maxEdge: number) {
  const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, w, h };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}

async function encode(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  maxBytes: number,
): Promise<OptimizeResult> {
  // Try WebP first
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const b = await canvasToBlob(canvas, "image/webp", q);
    if (b && b.size <= maxBytes) {
      return { blob: b, mime: "image/webp", ext: "webp", width: w, height: h };
    }
  }
  // Fallback JPEG
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const b = await canvasToBlob(canvas, "image/jpeg", q);
    if (b && b.size <= maxBytes) {
      return { blob: b, mime: "image/jpeg", ext: "jpg", width: w, height: h };
    }
  }
  // Last resort: return the smallest webp at low q
  const b = (await canvasToBlob(canvas, "image/webp", 0.4)) ?? (await canvasToBlob(canvas, "image/jpeg", 0.4));
  if (!b) throw new Error("Image encoding failed");
  return { blob: b, mime: b.type, ext: b.type === "image/webp" ? "webp" : "jpg", width: w, height: h };
}

/** Optimize a full-size image: max 1600px longest edge, <= 1 MB. */
export async function optimizeFullImage(file: File): Promise<OptimizeResult> {
  const img = await loadImage(file);
  const { canvas, w, h } = drawToCanvas(img, 1600);
  return encode(canvas, w, h, 1024 * 1024);
}

/** Generate a thumbnail: max 400px longest edge, <= 80 KB. */
export async function generateThumbnail(file: Blob): Promise<OptimizeResult> {
  const img = await loadImage(file);
  const { canvas, w, h } = drawToCanvas(img, 400);
  return encode(canvas, w, h, 80 * 1024);
}
