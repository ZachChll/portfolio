/**
 * Point d'entrée JS — chargé sur toutes les pages.
 * Chaque module ne s'active que si les éléments dont il a besoin existent dans la page.
 */
import { initI18n } from "./modules/i18n.js";
import { initNav } from "./modules/nav.js";
import { initTheme } from "./modules/theme.js";
import { initProjects, initProjectDetail } from "./modules/projects.js";
import { initSkills } from "./modules/skills.js";
import { initParcours } from "./modules/parcours.js";
import { initJellyfish } from "./modules/jellyfish.js";
import { initTypewriter } from "./modules/typewriter.js";
import { initContactForm } from "./modules/contact-form.js";
import { initPageTransitions } from "./modules/page-transitions.js";

// En premier : les modules suivants lisent le texte déjà traduit
initI18n();
initTheme();
initNav();
initPageTransitions();

document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = new Date().getFullYear();
});

const jellyCanvas = document.querySelector("[data-jellyfish]");
if (jellyCanvas) {
  initJellyfish(jellyCanvas);
  // L'indice "clique sur une méduse" disparaît après le premier clic
  jellyCanvas.addEventListener("jelly:poke", () => {
    document.querySelector(".hero__hint")?.classList.add("is-done");
  }, { once: true });
}

// Fond ASCII des pages intérieures (sans méduses) :
// data-ascii-bg="koi" ajoute des carpes koi, data-ascii-bg="ivy" du lierre et des papillons,
// data-ascii-bg="birds" des montagnes et une volée d'oiseaux
const asciiBg = document.querySelector("[data-ascii-bg]");
if (asciiBg) {
  const extra = asciiBg.dataset.asciiBg;
  initJellyfish(asciiBg, { jellies: false, koi: extra === "koi", ivy: extra === "ivy", birds: extra === "birds" });
}

const typewriter =document.querySelector("[data-typewriter]");
if (typewriter) initTypewriter(typewriter);

// Archipel de la page Projets (Three.js chargé seulement ici)
const archipelago = document.querySelector("[data-archipelago]");
if (archipelago) import("./modules/archipelago.js").then((m) => m.initArchipelago(archipelago));

const projectsGrid =document.querySelector("[data-projects]");
if (projectsGrid) initProjects(projectsGrid);

const projectDetail = document.querySelector("[data-project-detail]");
if (projectDetail) initProjectDetail(projectDetail);

const skills = document.querySelector("[data-skills]");
if (skills) initSkills(skills);

const parcours = document.querySelector("[data-parcours]");
if (parcours) initParcours(parcours);

const contactForm = document.querySelector("[data-contact-form]");
if (contactForm) initContactForm(contactForm);
