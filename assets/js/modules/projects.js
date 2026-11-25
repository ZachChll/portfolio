/**
 * Projets : liste (accueil + page Projets), filtres et page de détail.
 * Les données viennent de assets/data/projects.json.
 */
import { loadData, fromRoot, escapeHTML } from "./utils.js";
import { L } from "./i18n.js";

const detailUrl = (id) => `${fromRoot("pages/projet.html")}?id=${encodeURIComponent(id)}`;

function cardTemplate(p) {
  return `
    <article class="card" data-tags="${escapeHTML(p.tags.join(","))}">
      <img class="card__img" src="${fromRoot(p.image)}" alt="" loading="lazy">
      <div class="card__body">
        <h3 class="card__title"><a href="${detailUrl(p.id)}">${escapeHTML(p.title)}</a></h3>
        <p class="card__meta">${escapeHTML([p.status, p.date].filter(Boolean).join(" · "))}</p>
        <p class="card__text">${escapeHTML(p.summary)}</p>
        <div class="card__tags">${p.tags.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}</div>
      </div>
    </article>`;
}

function renderFilters(container, projects, grid) {
  const ALL = L("All", "Tous");
  const tags = [ALL, ...new Set(projects.flatMap((p) => p.tags))];
  container.innerHTML = tags
    .map((t, i) => `<button type="button" aria-pressed="${i === 0}" data-tag="${escapeHTML(t)}">${escapeHTML(t)}</button>`)
    .join("");

  container.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tag]");
    if (!btn) return;
    container.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    const tag = btn.dataset.tag;
    grid.querySelectorAll(".card").forEach((card) => {
      card.hidden = tag !== ALL && !card.dataset.tags.split(",").includes(tag);
    });
  });
}

export async function initProjects(grid) {
  try {
    let projects = await loadData("projects");
    const limit = Number(grid.dataset.limit);
    if (limit) projects = projects.filter((p) => p.featured).slice(0, limit);

    grid.innerHTML = projects.map(cardTemplate).join("");

    const filters = document.querySelector("[data-filters]");
    if (filters) renderFilters(filters, projects, grid);
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p>${L("Projects could not be loaded.", "Les projets n'ont pas pu être chargés.")}</p>`;
  }
}

export async function initProjectDetail(container) {
  const id = new URLSearchParams(location.search).get("id");
  try {
    const projects = await loadData("projects");
    const p = projects.find((x) => x.id === id);
    if (!p) {
      container.innerHTML = `<h1>${L("Project not found", "Projet introuvable")}</h1><p><a href="${fromRoot("pages/projets.html")}">${L("Back to projects", "Retour aux projets")}</a></p>`;
      return;
    }

    document.title = `${p.title} | ${document.title.split("| ")[1] ?? ""}`;
    const fact = (label, value) =>
      value ? `<div class="fact"><dt>${label}</dt><dd>${escapeHTML(value)}</dd></div>` : "";
    const panel = (title, body) => (body ? `<section class="panel"><h2>${title}</h2>${body}</section>` : "");

    container.innerHTML = `
      <a class="project__back" href="${fromRoot("pages/projets.html")}">← ${L("All projects", "Tous les projets")}</a>
      <header>
        <p class="project__status">${escapeHTML([p.status, p.date].filter(Boolean).join(" · "))}</p>
        <h1>${escapeHTML(p.title)}</h1>
        <p>${escapeHTML(p.summary)}</p>
      </header>
      ${p.image && !p.image.includes("placeholder") ? `<img class="project__cover" src="${fromRoot(p.image)}" alt="">` : ""}
      <div class="two-columns">
        <section class="panel">
          <h2>${L("Project sheet", "Fiche projet")}</h2>
          <dl class="facts">
            ${fact("Type", p.type)}
            ${fact(L("Team", "Équipe"), p.team)}
            ${fact(L("Context", "Contexte"), p.context)}
            ${fact(L("Goal", "Objectif"), p.goal)}
          </dl>
        </section>
        <div class="stack">
          ${panel(L("What I did", "Ce que j'ai fait"), p.tasks?.length ? `<ul class="bullets">${p.tasks.map((t) => `<li>${escapeHTML(t)}</li>`).join("")}</ul>` : "")}
          ${panel("Technologies", p.technologies?.length ? `<div class="tags">${p.technologies.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}</div>` : "")}
          ${panel(L("What I learned", "Ce que j'en retiens"), p.learned ? `<p>${escapeHTML(p.learned)}</p>` : "")}
        </div>
      </div>
      <div class="project__links">
        ${p.links.demo ? `<a class="btn btn--primary" href="${escapeHTML(p.links.demo)}" target="_blank" rel="noopener">${L("See the demo", "Voir la démo")}</a>` : ""}
        ${p.links.code ? `<a class="btn btn--ghost" href="${escapeHTML(p.links.code)}" target="_blank" rel="noopener">${L("Source code", "Code source")}</a>` : ""}
      </div>`;
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p>${L("The project could not be loaded.", "Le projet n'a pas pu être chargé.")}</p>`;
  }
}
