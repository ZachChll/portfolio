/**
 * Parcours : trois frises chronologiques sur un même axe du temps
 * (parcours scolaire, expériences étudiantes, jobs étudiants), depuis assets/data/parcours.json.
 *
 * - Chaque frise n'affiche que les titres ; les étapes longues sont des segments,
 *   les courtes des points. La partie future d'une étape est en pointillés.
 * - Clic sur un titre : un panneau de détails se déplie sous la frise.
 *   Clic sur un autre titre de la même frise : le contenu change ; re-clic : il se replie.
 * - Les titres sont placés au-dessus / en dessous de la ligne pour ne jamais se chevaucher.
 * - Sur mobile, chaque frise devient une liste verticale et les détails s'ouvrent sous le titre.
 */
import { loadData, escapeHTML } from "./utils.js";
import { L } from "./i18n.js";

const narrow = matchMedia("(max-width: 48rem)");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const LABEL_GAP = 28;                                   // espace minimal entre deux titres (px)
const LEVELS = ["a0", "a1", "b0", "a2", "b1"];          // a = au-dessus (de préférence), b = en dessous

const monthIndex = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const pad = (n) => String(n).padStart(2, "0");

/* ---------- gabarits ---------- */

function marksTemplate(e, i, pct, todayPct) {
  if (e.x1 === undefined) {
    const future = e.x0 > todayPct ? " is-future" : "";
    return `<span class="tl-mark tl-mark--dot${future}" data-i="${i}" style="--x:${e.x0}%"></span>`;
  }
  const solidEnd = Math.min(e.x1, todayPct);
  const dashStart = Math.max(e.x0, todayPct);
  return `
    <span class="tl-mark tl-mark--seg" data-i="${i}" style="--x0:${e.x0}%; --x1:${e.x1}%">
      ${solidEnd > e.x0 ? `<span class="tl-mark__solid" style="left:0; width:${((solidEnd - e.x0) / (e.x1 - e.x0)) * 100}%"></span>` : ""}
      ${e.x1 > dashStart ? `<span class="tl-mark__future${e.ongoing ? " is-ongoing" : ""}" style="left:${((dashStart - e.x0) / (e.x1 - e.x0)) * 100}%; right:0"></span>` : ""}
    </span>`;
}

function panelTemplate(e) {
  const points = (e.points || []).map((p, k) => `<li style="--d:${k + 2}">${escapeHTML(p)}</li>`).join("");
  const tags = (e.tags || []).map((t) => `<li>${escapeHTML(t)}</li>`).join("");
  return `
    <p class="tl-panel__meta" style="--d:0"><span>${escapeHTML(e.date || "")}</span><span>${escapeHTML(e.place || "")}</span></p>
    <h3 class="tl-panel__title" style="--d:1">${escapeHTML(e.title)}</h3>
    ${points ? `<ul class="tl-panel__points">${points}</ul>` : ""}
    ${tags ? `<ul class="tl-panel__tags" style="--d:${(e.points || []).length + 2}">${tags}</ul>` : ""}`;
}

/* ---------- initialisation ---------- */

export async function initParcours(root) {
  let data;
  try {
    data = await loadData("parcours");
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p>${L("The timeline could not be loaded.", "Le parcours n'a pas pu être chargé.")}</p>`;
    return;
  }

  const a0 = monthIndex(data.axis.start);
  const a1 = monthIndex(data.axis.end) + 1;
  const now = new Date();
  const todayM = now.getFullYear() * 12 + now.getMonth() + (now.getDate() - 1) / 31;
  const pct = (m) => +clamp(((m - a0) / (a1 - a0)) * 100, 0, 100).toFixed(3);
  const todayPct = pct(todayM);

  // positions de chaque étape sur l'axe (en %)
  for (const track of data.tracks) {
    for (const e of track.entries) {
      const s = monthIndex(e.start);
      if (e.end || e.ongoing) {
        e.x0 = pct(s);
        e.x1 = e.ongoing ? 100 : pct(monthIndex(e.end) + 1);
        e.anchor = e.ongoing ? (e.x0 + Math.max(todayPct, e.x0 + 4)) / 2 : (e.x0 + e.x1) / 2;
      } else {
        e.x0 = pct(s + 0.5);
        e.anchor = e.x0;
      }
    }
  }

  // repères d'années (1er janvier)
  const years = [];
  for (let m = Math.ceil(a0 / 12) * 12; m < a1; m += 12) years.push({ y: m / 12, x: pct(m) });

  root.style.setProperty("--today", `${todayPct}%`);
  root.innerHTML = `
    <div class="tl__axis" aria-hidden="true">
      <span></span>
      <div class="tl__ruler">
        ${years.map((y) => `<span class="tl__year" style="--x:${y.x}%">${y.y}</span>`).join("")}
        <span class="tl__today">${L("today", "aujourd’hui")}</span>
      </div>
    </div>
    ${data.tracks.map((t, ti) => `
      <section class="tl-track" data-track="${ti}" aria-labelledby="tl-name-${t.id}">
        <h2 class="tl-track__name" id="tl-name-${t.id}"><span>${pad(ti + 1)}</span>${escapeHTML(t.title)}</h2>
        <div class="tl-track__lane">
          <span class="tl-track__line" aria-hidden="true"></span>
          ${years.map((y) => `<span class="tl-track__year" style="--x:${y.x}%" aria-hidden="true"></span>`).join("")}
          <span class="tl-track__now" aria-hidden="true"></span>
          <span class="tl-track__marks" aria-hidden="true">${t.entries.map((e, i) => marksTemplate(e, i, pct, todayPct)).join("")}</span>
          <ol class="tl-track__items">
            ${t.entries.map((e, i) => `
              <li class="tl-item" data-i="${i}" style="--ax:${e.anchor}%">
                <button class="tl-item__btn" type="button" aria-expanded="false" aria-controls="tl-panel-${t.id}">
                  <span class="tl-item__title">${escapeHTML(e.title)}</span>
                  <span class="tl-item__date">${escapeHTML(e.date || "")}</span>
                </button>
              </li>`).join("")}
          </ol>
        </div>
        <div class="tl-panel" id="tl-panel-${t.id}" role="region" aria-labelledby="tl-name-${t.id}">
          <div class="tl-panel__clip"><div class="tl-panel__box"></div></div>
        </div>
      </section>`).join("")}`;

  const tracks = [...root.querySelectorAll(".tl-track")].map((el, ti) => ({
    el,
    data: data.tracks[ti],
    lane: el.querySelector(".tl-track__lane"),
    items: [...el.querySelectorAll(".tl-item")],
    marks: [...el.querySelectorAll(".tl-mark")],
    panel: el.querySelector(".tl-panel"),
    box: el.querySelector(".tl-panel__box"),
    current: null,
    token: 0,
  }));

  /* --- placement des titres (ordinateur) --- */
  function layout(t) {
    const { lane, items } = t;
    if (narrow.matches) {
      items.forEach((li) => { li.removeAttribute("data-side"); li.style.removeProperty("left"); });
      return;
    }
    const W = lane.clientWidth;
    const taken = Object.fromEntries(LEVELS.map((k) => [k, []]));
    let maxA = 0, maxB = -1;
    items.forEach((li, i) => {
      const w = li.offsetWidth;
      const anchor = (t.data.entries[i].anchor / 100) * W;
      const left = clamp(anchor - w / 2, 0, Math.max(0, W - w));
      const level = LEVELS.find((k) => taken[k].every(([l, r]) => left + w + LABEL_GAP <= l || left >= r + LABEL_GAP)) || LEVELS.at(-1);
      taken[level].push([left, left + w]);
      const side = level[0], n = Number(level[1]);
      if (side === "a") maxA = Math.max(maxA, n); else maxB = Math.max(maxB, n);
      li.dataset.side = side;
      li.style.left = `${left}px`;
      li.style.setProperty("--level", n);
      li.style.setProperty("--stem-x", `${anchor - left}px`);
    });
    t.el.style.setProperty("--above", maxA + 1);
    t.el.style.setProperty("--below", maxB + 1);
  }
  const layoutAll = () => tracks.forEach(layout);

  /* --- panneau de détails --- */
  const animate = (el, frames, opts) =>
    reduceMotion.matches ? null : el.animate(frames, { easing: EASE, ...opts });

  function placePanel(t) {
    // sur mobile, le panneau s'ouvre juste sous le titre choisi
    if (narrow.matches && t.current !== null) t.items[t.current].append(t.panel);
    else if (t.panel.parentElement !== t.el) t.el.append(t.panel);
  }

  function setActive(t, i) {
    t.items.forEach((li, k) => {
      li.classList.toggle("is-active", k === i);
      li.querySelector("button").setAttribute("aria-expanded", String(k === i));
    });
    t.marks.forEach((m, k) => m.classList.toggle("is-active", k === i));
  }

  function fill(t, i) {
    const e = t.data.entries[i];
    t.box.innerHTML = panelTemplate(e);
    t.panel.style.setProperty("--x", `${e.anchor}%`);
    t.box.classList.remove("is-entering");
    void t.box.offsetWidth;
    t.box.classList.add("is-entering");
  }

  async function select(t, i) {
    const my = ++t.token;

    if (t.current === i) {                         // re-clic : on replie
      t.current = null;
      setActive(t, -1);
      t.panel.classList.remove("is-open");
      return;
    }

    const wasOpen = t.current !== null;
    t.current = i;
    setActive(t, i);

    if (wasOpen && !narrow.matches) {             // changement dans la même frise : fondu
      const out = animate(t.box, [{ opacity: 1 }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 160, easing: "ease-in", fill: "forwards" });
      if (out) await out.finished.catch(() => {});
      if (my !== t.token) return;
      out?.cancel();
      fill(t, i);
      return;
    }

    if (wasOpen) t.panel.classList.remove("is-open");  // mobile : on referme avant de déplacer
    fill(t, i);
    placePanel(t);
    void t.panel.offsetWidth;
    t.panel.classList.add("is-open");
  }

  /* --- interactions --- */
  for (const t of tracks) {
    t.items.forEach((li, i) => {
      li.querySelector("button").addEventListener("click", () => select(t, i));
      li.addEventListener("pointerenter", () => t.marks[i].classList.add("is-hover"));
      li.addEventListener("pointerleave", () => t.marks[i].classList.remove("is-hover"));
    });
    // une fois replié, le panneau est vidé
    t.panel.addEventListener("transitionend", (e) => {
      if (e.target === t.panel && !t.panel.classList.contains("is-open") && t.current === null) {
        t.box.innerHTML = "";
        placePanel(t);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    for (const t of tracks) if (t.current !== null) select(t, t.current);
  });

  layoutAll();
  document.fonts?.ready.then(layoutAll);
  let timer;
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(layoutAll, 120); });
  narrow.addEventListener("change", () => { tracks.forEach(placePanel); layoutAll(); });
}
