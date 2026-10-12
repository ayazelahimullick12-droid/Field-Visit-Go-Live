// Registers the offline service worker (public/sw.js) in production builds.
// In `npm run dev` it stays off, so Vite's live reload isn't served stale files.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[sw] registration failed:", err));
  });
}
