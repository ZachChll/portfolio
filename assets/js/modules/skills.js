/**
 * Roue des compétences (page Compétences), depuis assets/data/skills.json.
 *
 * - Au départ, la roue (invisible) est au centre : seuls les titres des catégories
 *   sont affichés, disposés en cercle.
 * - Clic sur un titre : la roue glisse à gauche (à moitié hors écran), tourne pour
 *   amener ce titre face au contenu, et la catégorie s'affiche en grand au centre.
 * - Clic sur un autre titre : la roue tourne et le contenu change.
 * - Clic sur le titre déjà ouvert (ou Échap) : la roue revient au centre.
 * Sur mobile, la roue remonte en haut au lieu d'aller à gauche.
 */
import { loadData, escapeHTML } from "./utils.js";
import { L } from "./i18n.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const narrow = matchMedia("(max-width: 48rem)");
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Inclinaison de la roue au repos (au centre), pour que deux titres ne soient jamais au même niveau. */
const REST_TILT = 0;

const pad = (n) => String(n).padStart(2, "0");

/* ---------- construction de la roue ---------- */

function buildWheel(disc, cats) {
  const n = cats.length;
  const step = 360 / n;
  const angleOf = (i) => i * step - 90; // 1re catégorie en haut

  // Fines lignes partant du centre, entre chaque titre
  for (let i = 0; i < n; i++) {
    const spoke = document.createElement("span");
    spoke.className = "wheel__spoke";
    spoke.setAttribute("aria-hidden", "true");
    spoke.style.setProperty("--a", `${angleOf(i) + step / 2}deg`);
    spoke.style.setProperty("--d", i);
    disc.append(spoke);
  }

  const labels = cats.map((c, i) => {
    const slot = document.createElement("div");
    slot.className = "wheel__slot";
    slot.style.setProperty("--a", `${angleOf(i)}deg`);
    slot.innerHTML = `<button class="wheel__label" type="button" data-i="${i}"
      aria-pressed="false" aria-controls="skill-detail"><span>${escapeHTML(c.title)}</span></button>`;
    disc.append(slot);
    return slot.firstElementChild;
  });

  return { labels, angleOf };
}

/* ---------- contenu du détail ---------- */

function detailTemplate(c, i, n) {
  return `
    <p class="skill-detail__index">${pad(i + 1)} / ${pad(n)}</p>
    <h2 class="skill-detail__title" tabindex="-1">${escapeHTML(c.title)}</h2>
    <p class="skill-detail__intro">${escapeHTML(c.intro || "")}</p>
    <ul class="skill-detail__list">
      ${(c.items || []).map((it, k) => `
        <li style="--d:${k + 2}">
          <h3>${escapeHTML(it.name)}</h3>
          ${it.text ? `<p>${escapeHTML(it.text)}</p>` : ""}
        </li>`).join("")}
    </ul>
    <button class="skill-detail__back" type="button" style="--d:${(c.items || []).length + 2}">← ${L("back to the wheel", "recentrer la roue")}</button>`;
}

/* ---------- initialisation ---------- */

export async function initSkills(stage) {
  const disc = stage.querySelector("[data-wheel-disc]");
  const detail = stage.querySelector("[data-skill-detail]");

  let cats;
  try {
    cats = await loadData("skills");
  } catch (err) {
    console.error(err);
    detail.hidden = false;
    detail.innerHTML = `<p>${L("Skills could not be loaded.", "Les compétences n'ont pas pu être chargées.")}</p>`;
    return;
  }

  const n = cats.length;
  const { labels, angleOf } = buildWheel(disc, cats);

  let rot = REST_TILT;  // rotation cumulée de la roue (en degrés)
  let current = null;   // index de la catégorie ouverte, ou null
  let token = 0;        // pour ignorer les animations devenues obsolètes

  // Inclinaison de départ appliquée sans animation (sinon la roue tourne au chargement)
  disc.style.transition = "none";
  disc.style.setProperty("--rot", `${rot}deg`);
  void disc.offsetWidth;
  disc.style.transition = "";

  const animate = (el, frames, opts) =>
    reduceMotion.matches ? null : el.animate(frames, { easing: EASE, fill: "backwards", ...opts });

  /**
   * Fait tourner la roue (par le chemin le plus court) pour amener i à l'angle voulu :
   * par défaut face au contenu (à droite sur ordinateur, en bas sur mobile).
   */
  function rotateTo(i, target = narrow.matches ? 90 : 0) {
    const desired = target - angleOf(i);
    const delta = ((((desired - rot) % 360) + 540) % 360) - 180;
    rot += delta;
    disc.style.setProperty("--rot", `${rot}deg`);
  }

  function setActive(i) {
    labels.forEach((l, k) => l.setAttribute("aria-pressed", String(k === i)));
  }

  function renderDetail(i) {
    detail.innerHTML = detailTemplate(cats[i], i, n);
    detail.querySelector(".skill-detail__back").addEventListener("click", close);
    detail.classList.remove("is-entering");
    void detail.offsetWidth; // relance les animations CSS
    detail.classList.add("is-entering");
  }

  /** Ouverture depuis la roue centrée : le titre "s'envole" depuis la roue. */
  function open(i) {
    const label = labels[i];
    const from = label.getBoundingClientRect();
    const fromSize = parseFloat(getComputedStyle(label).fontSize);

    current = i;
    token++;
    setActive(i);
    rotateTo(i);
    stage.dataset.state = "side";
    detail.hidden = false;
    renderDetail(i);

    const title = detail.querySelector(".skill-detail__title");
    const to = title.getBoundingClientRect();
    const scale = fromSize / parseFloat(getComputedStyle(title).fontSize);
    animate(title, [
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`, opacity: 0.4 },
      { transform: "none", opacity: 1 },
    ], { duration: 850 });
  }

  /** Passage d'une catégorie à une autre : la roue tourne, le contenu se remplace. */
  async function switchTo(i) {
    current = i;
    const my = ++token;
    setActive(i);
    rotateTo(i);
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });

    const out = animate(detail, [{ opacity: 1 }, { opacity: 0, transform: "translateY(-8px)" }], { duration: 180, easing: "ease-in", fill: "forwards" });
    if (out) await out.finished.catch(() => {});
    if (my !== token) return;
    out?.cancel();

    renderDetail(i);
    animate(detail.querySelector(".skill-detail__title"), [
      { transform: "translateX(-40px)", opacity: 0 },
      { transform: "none", opacity: 1 },
    ], { duration: 650 });
  }

  /** Retour de la roue au centre. */
  async function close() {
    if (current === null) return;
    const i = current;
    current = null;
    const my = ++token;
    setActive(-1);
    rotateTo(i, -90 + REST_TILT);   // la roue reprend sa disposition d'origine
    stage.dataset.state = "center";

    const out = animate(detail, [{ opacity: 1 }, { opacity: 0, transform: "translateX(24px)" }], { duration: 220, easing: "ease-in", fill: "forwards" });
    if (out) await out.finished.catch(() => {});
    if (my !== token) return;
    out?.cancel();
    detail.hidden = true;
    detail.innerHTML = "";
    labels[i].focus({ preventScroll: true });
  }

  function select(i) {
    if (current === i) close();
    else if (current === null) open(i);
    else switchTo(i);
  }

  /* --- interactions --- */
  labels.forEach((label, i) => label.addEventListener("click", () => select(i)));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current !== null) close();
  });

  // Passage ordinateur ↔ mobile : on réaligne la catégorie ouverte
  narrow.addEventListener("change", () => { if (current !== null) rotateTo(current); });
}
