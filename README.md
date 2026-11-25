# E-portfolio

Site statique en HTML / CSS / JavaScript (sans framework, sans build).

## Lancer le site en local

Le JavaScript utilise des modules ES et charge des fichiers JSON : il faut un petit serveur local
(ouvrir `index.html` en double-cliquant ne suffit pas).

- **VS Code** : extension *Live Server* → clic droit sur `index.html` → *Open with Live Server*
- **ou en ligne de commande** : `npx serve .` ou `python -m http.server 8000`

## Arborescence

```
e-portfolio/
├── index.html                 Accueil (accroche, statut, projets à la une)
├── pages/
│   ├── a-propos.html          Fiche d’identité, présentation, centres d’intérêt (fond ASCII)
│   ├── competences.html       Roue des compétences interactive (fond ASCII)
│   ├── parcours.html          3 frises (scolaire, expériences, jobs) sur un même axe du temps
│   ├── projets.html           Archipel d’îles flottantes en voxels, une par projet (Three.js)
│   ├── projet.html            Fiche détaillée d'un projet (projet.html?id=...)
│   ├── contact.html           Coordonnées + formulaire "terminal" (Formspree), montagnes et oiseaux ASCII
│   └── cv.html                CV en PDF intégré + téléchargement
└── assets/
    ├── css/
    │   ├── main.css           Importe tous les styles communs
    │   ├── base/              Variables (couleurs, typo…), reset, typographie
    │   ├── layout/            Conteneur, header, footer, grilles
    │   ├── components/        Boutons, cartes, formulaires
    │   └── pages/             Styles propres à chaque page
    ├── js/
    │   ├── main.js            Point d'entrée : active les modules utiles à la page
    │   └── modules/           nav, theme, projects, skills, parcours, contact-form, fonds animés (jellyfish, koi, ivy, birds), archipelago + islands (page Projets)
    ├── data/
    │   ├── projects.json      ← vos projets
    │   ├── parcours.json      ← vos expériences et formations
    │   └── skills.json        ← vos compétences et langues
    ├── img/                   Photo, favicon, images des projets (img/projets/)
    ├── fonts/                 Polices auto-hébergées (optionnel)
    └── docs/                  CV (cv.pdf) et autres documents à télécharger
```

## Ajouter un projet

Ajoutez un objet dans `assets/data/projects.json` et son image dans `assets/img/projets/`.
Sa page de détail est générée automatiquement à l'adresse `pages/projet.html?id=<id>`.
Chaque texte s'écrit dans les deux langues : `"title": { "en": "…", "fr": "…" }`.

## Langues (anglais / français)

Le site est en anglais par défaut ; le bouton EN / FR du header bascule en français (choix mémorisé).

- **Pages HTML** : le texte anglais est dans la balise, la version française juste à côté,
  sur le même élément : `<h1 data-fr="À propos">About</h1>`.
  Pour un attribut : `data-fr-aria-label`, `data-fr-alt`, `data-fr-title`, `data-fr-content`.
- **Données** (`assets/data/*.json`) : `{ "en": "…", "fr": "…" }` ; un texte identique dans
  les deux langues reste une simple chaîne.
- **JavaScript** : `L("English text", "Texte français")` (voir `assets/js/modules/i18n.js`).

## Personnaliser

- Couleurs, polices, espacements : `assets/css/base/variables.css`
- Nom, liens GitHub/LinkedIn : header et footer de chaque page HTML
- Formulaire de contact : adresse Formspree dans l’attribut `action` du formulaire (`pages/contact.html`)
- CV : déposez `cv.pdf` dans `assets/docs/`

## Mise en ligne

Le dossier se déploie tel quel sur GitHub Pages, Netlify ou Vercel.
