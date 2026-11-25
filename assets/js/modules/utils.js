/** Fonctions utilitaires partagées entre les modules. */
import { localize } from "./i18n.js";

/** URL de la racine du site, quelle que soit la page (index.html ou pages/*.html). */
export const ROOT = new URL("../../../", import.meta.url);

/** Construit un chemin absolu à partir d'un chemin relatif à la racine du site. */
export const fromRoot = (path) => new URL(path, ROOT).href;

/** Charge un fichier JSON du dossier assets/data/. */
export async function loadData(name) {
  const res = await fetch(fromRoot(`assets/data/${name}.json`));
  if (!res.ok) throw new Error(`Impossible de charger ${name}.json (${res.status})`);
  return localize(await res.json());
}

/** Échappe le texte avant de l'insérer dans du HTML. */
export function escapeHTML(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
