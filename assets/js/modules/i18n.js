/**
 * Langues du site : anglais (par défaut) et français.
 *
 * - Le HTML est écrit en anglais. La version française est rangée à côté,
 *   sur le même élément :
 *     data-fr="…"             → remplace le contenu (le HTML est accepté)
 *     data-fr-aria-label="…"  → remplace l'attribut aria-label
 *     (idem pour alt, title, content, placeholder)
 * - Les fichiers JSON écrivent chaque texte traduit sous la forme { "en": "…", "fr": "…" } ;
 *   loadData() (utils.js) ne garde que la langue active.
 * - Dans le JS : L("English text", "Texte français").
 *
 * La langue choisie est mémorisée ; js/boot.js la pose sur <html lang> avant l'affichage.
 * Changer de langue recharge la page (en fondu), ce qui remet chaque module à jour.
 */
const KEY = "lang";
const ATTRS = ["aria-label", "alt", "title", "content", "placeholder"];

export const lang = document.documentElement.lang === "fr" ? "fr" : "en";

/** Choisit le texte de la langue active. */
export const L = (en, fr) => (lang === "fr" ? fr : en);

/** Remplace chaque { en, fr } d'une donnée JSON par le texte de la langue active. */
export function localize(value) {
  if (Array.isArray(value)) return value.map(localize);
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 2 && "en" in value && "fr" in value) return value[lang];
    return Object.fromEntries(keys.map((k) => [k, localize(value[k])]));
  }
  return value;
}

function applyFrench() {
  const selector = ["[data-fr]", ...ATTRS.map((a) => `[data-fr-${a}]`)].join(",");
  document.querySelectorAll(selector).forEach((el) => {
    if (el.hasAttribute("data-fr")) el.innerHTML = el.getAttribute("data-fr");
    ATTRS.forEach((a) => {
      const v = el.getAttribute(`data-fr-${a}`);
      if (v != null) el.setAttribute(a, v);
    });
  });
}

export function initI18n() {
  const root = document.documentElement;
  if (lang === "fr") applyFrench();
  root.classList.remove("i18n-wait");

  const button = document.querySelector(".lang-toggle");
  if (!button) return;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    const next = lang === "fr" ? "en" : "fr";
    try { localStorage.setItem(KEY, next); } catch { /* stockage indisponible */ }
    root.dataset.langNext = next;          // l'interrupteur glisse tout de suite
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) root.classList.add("is-switching");
    setTimeout(() => location.reload(), reduce ? 0 : 240);
  });
}
