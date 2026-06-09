/**
 * Guarded service-worker registration. Refuses in dev, preview, iframes,
 * and when ?sw=off is set. Unregisters any matching SW in those contexts.
 */

const SW_URL = "/sw.js";

function isUnsafeContext() {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.top !== window.self) return true;
  } catch {
    return true; // cross-origin frame
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get("sw") === "off") return true;
  const h = url.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      if (url.endsWith(SW_URL)) await r.unregister();
    }
  } catch {
    /* ignore */
  }
}

export function registerAppServiceWorker() {
  if (isUnsafeContext()) {
    void unregisterMatching();
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  // Reload the page when the service worker takes control (claims clients) to load matching route chunks
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    console.log("[Service Worker] Controller changed. Reloading page to apply updates...");
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL)
      .then((reg) => {
        console.log("[Service Worker] Registered successfully.");
        // Force check for updates on registration
        void reg.update();
      })
      .catch((err) => {
        console.error("[Service Worker] Registration failed:", err);
      });
  });
}
