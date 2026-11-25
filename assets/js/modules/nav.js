/** Menu burger sur mobile. */
import { L } from "./i18n.js";
export function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("nav-principale");
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? L("Close menu", "Fermer le menu") : L("Open menu", "Ouvrir le menu"));
  };

  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}
