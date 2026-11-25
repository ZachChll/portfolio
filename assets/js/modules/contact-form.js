/**
 * Formulaire de contact "terminal", envoyé avec Formspree (l'adresse est dans
 * l'attribut action du formulaire, pages/contact.html).
 *
 * - Validation côté client, messages d'erreur sous les champs.
 * - Ctrl/Cmd + Entrée envoie le message.
 * - Après l'envoi, le formulaire se replie et un événement "contact:sent" est envoyé
 *   avec la position de la lettre : la volée d'oiseaux (birds.js) vient la chercher.
 * - Bouton "copier" pour l'adresse e-mail.
 */
import { L } from "./i18n.js";
const FALLBACK_EMAIL = "zachaillou@gmail.com";

const MESSAGES = {
  valueMissing: L("This field is required.", "Ce champ est obligatoire."),
  typeMismatch: L("Invalid e-mail address.", "Adresse e-mail invalide."),
};

function showError(field) {
  const id = `${field.id}-erreur`;
  let error = document.getElementById(id);
  if (field.validity.valid) {
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
    error?.remove();
    return true;
  }
  if (!error) {
    error = document.createElement("p");
    error.id = id;
    error.className = "term__error";
    field.after(error);
    field.setAttribute("aria-describedby", id);
  }
  field.setAttribute("aria-invalid", "true");
  error.textContent = field.validity.valueMissing ? MESSAGES.valueMissing : MESSAGES.typeMismatch;
  return false;
}

async function send(form) {
  const data = new FormData(form);
  data.set("_subject", `Portfolio — ${data.get("objet")} — ${data.get("nom")}`);
  const res = await fetch(form.action, {
    method: "POST",
    body: data,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Formspree ${res.status}`);
}

function initCopy() {
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    let timer;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
      } catch {
        // pas d'accès au presse-papiers : on sélectionne l'adresse pour un copier manuel
        const src = btn.parentElement.querySelector("[data-copy-source]");
        const range = document.createRange();
        range.selectNodeContents(src);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        return;
      }
      btn.textContent = L("copied ✓", "copié ✓");
      btn.classList.add("is-copied");
      clearTimeout(timer);
      timer = setTimeout(() => { btn.textContent = L("copy", "copier"); btn.classList.remove("is-copied"); }, 1800);
    });
  });
}

export function initContactForm(form) {
  initCopy();

  const panel = form.closest(".term");
  const done = panel.querySelector("[data-contact-done]");
  const status = form.querySelector(".term__status");
  const button = form.querySelector(".term__send");
  const label = button.querySelector("[data-send-label]");
  const fields = [...form.querySelectorAll("input[required], textarea[required]")];
  const message = form.querySelector("textarea");
  const count = form.querySelector("[data-count]");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  fields.forEach((f) => {
    f.addEventListener("blur", () => { if (f.value || f.hasAttribute("aria-invalid")) showError(f); });
    f.addEventListener("input", () => { if (f.hasAttribute("aria-invalid")) showError(f); });
  });

  const updateCount = () => { count.textContent = `${message.value.length} / ${message.maxLength}`; };
  message.addEventListener("input", updateCount);

  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    const allValid = fields.map(showError).every(Boolean);
    if (!allValid) {
      form.querySelector("[aria-invalid='true']")?.focus();
      return;
    }

    button.disabled = true;
    button.classList.add("is-sending");
    label.textContent = L("[ sending ]", "[ envoi ]");
    status.textContent = "";
    status.classList.remove("is-error");

    try {
      await send(form);
    } catch {
      button.disabled = false;
      button.classList.remove("is-sending");
      label.textContent = L("[ send ↵ ]", "[ envoyer ↵ ]");
      status.classList.add("is-error");
      status.innerHTML = `✗ ${L("Sending failed. Try again, or e-mail me directly at", "L’envoi a échoué. Réessayez, ou écrivez-moi directement à")} <a href="mailto:${FALLBACK_EMAIL}">${FALLBACK_EMAIL}</a>.`;
      return;
    }

    // le formulaire se replie en lettre, puis un oiseau vient la chercher
    const r = form.getBoundingClientRect();
    const at = { x: r.left + r.width / 2, y: r.top + r.height * 0.4 };
    const finish = () => {
      form.hidden = true;
      form.classList.remove("is-folding");
      done.hidden = false;
      done.querySelector("[data-contact-again]").focus({ preventScroll: true });
    };
    if (reduceMotion) finish();
    else {
      form.classList.add("is-folding");
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("contact:sent", { detail: at }));
        finish();
      }, 480);
    }
  });

  done.querySelector("[data-contact-again]").addEventListener("click", () => {
    form.reset();
    updateCount();
    button.disabled = false;
    button.classList.remove("is-sending");
    label.textContent = L("[ send ↵ ]", "[ envoyer ↵ ]");
    done.hidden = true;
    form.hidden = false;
    form.querySelector("input")?.focus();
  });
}
