export const MERCATO_APP_ICON = "/manus-storage/toujours-app-192_56ed3f74.png";

export async function registerMercatoWorker(production: boolean) {
  if (!production || typeof window === "undefined" || typeof navigator === "undefined" ||
      !window.isSecureContext || !("serviceWorker" in navigator)) return undefined;
  try {
    return await navigator.serviceWorker.register("/mercato-sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    // Installation of the worker is optional: never block login or the live application.
    console.warn("[Mercato app] Aviso offline indisponível; o Mercato online continua funcionando.");
    return undefined;
  }
}

/** Keep dialogs inside the visible viewport when a phone's keyboard is open. */
export function trackMercatoViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const viewport = window.visualViewport;
  const update = () => {
    document.documentElement.style.setProperty("--mercato-visible-height", `${viewport?.height ?? window.innerHeight}px`);
    document.documentElement.style.setProperty("--mercato-visible-top", `${viewport?.offsetTop ?? 0}px`);
  };
  update();
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  };
}
