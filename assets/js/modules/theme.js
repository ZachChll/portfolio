/** Bascule clair / sombre, mémorisée dans le navigateur du visiteur. */
const KEY = "theme";

function read() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function save(value) {
  try { localStorage.setItem(KEY, value); } catch { /* stockage indisponible */ }
}

export function initTheme() {
  const root = document.documentElement;
  const saved = read();
  if (saved) root.dataset.theme = saved;

  const button = document.querySelector(".theme-toggle");
  if (!button) return;

  button.addEventListener("click", () => {
    const current = root.dataset.theme
      ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    save(next);
  });
}
