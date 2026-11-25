/**
 * Transitions entre les pages.
 *
 * Navigateurs récents (Chrome, Edge, Safari) : View Transitions entre documents,
 * entièrement en CSS (voir css/base/transitions.css). Rien à faire ici.
 *
 * Autres navigateurs (classe "no-vt" posée par js/boot.js) : on fait disparaître
 * le contenu en fondu avant de changer de page ; l'apparition est gérée en CSS.
 */
const LEAVE_MS = 200;

export function initPageTransitions() {
  const root = document.documentElement;
  if (!root.classList.contains("no-vt")) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.target && link.target !== "_self") return;
    if (link.hasAttribute("download")) return;

    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    // Simple ancre dans la même page : pas de transition
    if (url.pathname === location.pathname && url.search === location.search) return;

    e.preventDefault();
    root.classList.add("is-leaving");
    setTimeout(() => { location.href = url.href; }, LEAVE_MS);
  });

  // Retour arrière (page restaurée depuis le cache) : on réaffiche le contenu
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) root.classList.remove("is-leaving");
  });
}
