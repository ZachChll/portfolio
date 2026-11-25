/**
 * Méduses ASCII animées en fond de l'accueil.
 *
 * - Fond : grille de caractères discrète qui scintille doucement.
 * - Méduses : cloche en "pixels" carrés (alignés sur une grille) qui pulse et
 *   s'oriente dans le sens de la nage ; tentacules en caractères qui ondulent.
 * - Clic sur une méduse : petit "boing" (écrasement + rebond, puis petite
 *   accélération). Dure moins d'une seconde.
 * - Clic dans l'eau : quelques bulles.
 * - Respecte prefers-reduced-motion (image fixe) et suit le thème clair/sombre.
 */

import { hash, rand, clamp, parseColor, mix } from "./ascii-utils.js";
import { createKoiPond } from "./koi.js";
import { createIvy } from "./ivy.js";
import { createSky } from "./birds.js";

const BG_GLYPHS = ".:-=+*#%01";
const TRAIL_GLYPHS = "01:.|;";
const CELL_GLYPHS = "+*%#:";
const BG_CELL = 14;          // taille d'une case de la grille de fond (px)
const HAPPY_DURATION = 0.75; // durée de l'animation au clic (s)

/* ---------- moteur ---------- */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ jellies?: boolean, koi?: boolean, ivy?: boolean, birds?: boolean }} options
 *   jellies: false → pas de méduses ; koi: true → carpes koi (koi.js) ;
 *   ivy: true → lierre et papillons en pixel art (ivy.js) ;
 *   birds: true → montagnes et volée d'oiseaux (birds.js)
 */
export function initJellyfish(canvas, { jellies: withJellies = true, koi: withKoi = false, ivy: withIvy = false, birds: withBirds = false } = {}) {
  const ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1;
  let palette = [];
  let colors = {};
  let jellies = [];
  let particles = [];
  let bgCanvas, bgCtx, bgCols, bgRows;
  let time = 0;
  let last = performance.now();
  // Autres habitants du fond (koi, lierre…) : mêmes méthodes readColors / populate / update / draw / resize / poke
  const extras = [
    withKoi && createKoiPond(),
    withBirds && createSky({ reduceMotion }),
    withIvy && createIvy({ reduceMotion, onReady: () => { if (reduceMotion) render(0); } }),
  ].filter(Boolean);

  /* --- couleurs (lues dans les variables CSS, donc liées au thème) --- */
  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const jelly = parseColor(s.getPropertyValue("--jelly") || "#00356b");
    const light = parseColor(s.getPropertyValue("--jelly-light") || "#9cc2ee");
    palette = [0, 0.25, 0.5, 0.75, 1].map((t) => mix(jelly, light, t));
    palette.push([255, 255, 255]);
    colors = {
      glyph: s.getPropertyValue("--jelly-glyph").trim() || "rgba(120,120,140,.55)",
      grid: s.getPropertyValue("--jelly-grid").trim() || "rgba(120,120,150,.1)",
    };
    extras.forEach((x) => x.readColors());
  }

  /* --- fond : grille de caractères --- */
  function drawBgCell(cx, cy) {
    const ch = BG_GLYPHS[Math.floor(Math.random() * BG_GLYPHS.length)];
    bgCtx.clearRect(cx * BG_CELL, cy * BG_CELL, BG_CELL, BG_CELL);
    if (Math.random() < 0.55) bgCtx.fillText(ch, cx * BG_CELL + BG_CELL / 2, cy * BG_CELL + BG_CELL / 2);
  }

  function buildBackground() {
    bgCanvas = document.createElement("canvas");
    bgCanvas.width = W * dpr;
    bgCanvas.height = H * dpr;
    bgCtx = bgCanvas.getContext("2d");
    bgCtx.scale(dpr, dpr);
    bgCtx.font = `${BG_CELL - 4}px ui-monospace, Consolas, monospace`;
    bgCtx.textAlign = "center";
    bgCtx.textBaseline = "middle";
    bgCtx.fillStyle = colors.grid;
    bgCols = Math.ceil(W / BG_CELL);
    bgRows = Math.ceil(H / BG_CELL);
    for (let y = 0; y < bgRows; y++) for (let x = 0; x < bgCols; x++) drawBgCell(x, y);
  }

  function twinkleBackground() {
    const n = Math.ceil(bgCols * bgRows * 0.0015);
    for (let i = 0; i < n; i++) {
      drawBgCell(Math.floor(Math.random() * bgCols), Math.floor(Math.random() * bgRows));
    }
  }

  /* --- méduses --- */
  function createJelly(spawnAtEdge) {
    const depth = rand(0.3, 1);                 // 0 = loin, 1 = proche
    const j = {
      depth,
      size: Math.round(4 + depth * 6),          // taille d'un "pixel" de la cloche
      R: rand(6.5, 8.5),                        // rayon de la cloche (en pixels)
      baseAngle: -Math.PI / 2 + rand(0.15, 0.75), // nage vers le haut-droite
      speed: 14 + depth * 26,
      phase: rand(0, Math.PI * 2),
      pulseRate: rand(1.6, 2.4),
      seed: Math.floor(rand(1, 1e6)),
      tentacles: Math.random() < 0.5 ? 4 : 5,
      happy: 0,
      boost: 0,
      x: 0, y: 0, angle: 0,
    };
    j.angle = j.baseAngle;
    if (spawnAtEdge) {
      // réapparaît en bas (ou à gauche) de l'écran
      if (Math.random() < 0.75) { j.x = rand(-0.3 * W, W * 0.9); j.y = H + j.R * j.size * 3; }
      else { j.x = -j.R * j.size * 3; j.y = rand(H * 0.3, H); }
    } else {
      j.x = rand(0, W);
      j.y = rand(0, H);
    }
    return j;
  }

  function populate() {
    extras.forEach((x) => x.populate(W, H));
    if (!withJellies) { jellies = []; return; }
    const count = clamp(Math.round((W * H) / 110000), 4, 14);
    jellies = Array.from({ length: count }, () => createJelly(false));
    jellies.sort((a, b) => a.depth - b.depth); // les lointaines dessinées d'abord
  }

  function update(j, dt) {
    j.phase += j.pulseRate * dt;
    const thrust = Math.max(0, Math.sin(j.phase));            // propulsion pendant la contraction
    j.angle = j.baseAngle + 0.22 * Math.sin(time * 0.35 + j.seed);
    const v = j.speed * (0.35 + 1.1 * thrust) * (1 + j.boost * 2.5);
    j.x += Math.cos(j.angle) * v * dt;
    j.y += Math.sin(j.angle) * v * dt;
    j.happy = Math.max(0, j.happy - dt / HAPPY_DURATION);
    j.boost = Math.max(0, j.boost - dt * 1.6);

    const margin = j.R * j.size * 4;
    if (j.y < -margin || j.x > W + margin || j.x < -margin * 2) {
      Object.assign(j, createJelly(true), { depth: j.depth, size: j.size, speed: j.speed });
    }
  }

  /** Forme de la cloche à l'instant t (rayons largeur / hauteur). */
  function bellShape(j) {
    const k = Math.max(0, Math.sin(j.phase));
    let rw = j.R * (1 - 0.16 * k);
    let rh = j.R * (0.85 + 0.15 * k);
    if (j.happy > 0) {
      const p = 1 - j.happy;                                   // 0 → 1
      const squash = Math.sin(p * Math.PI * 2.5) * (1 - p) * 0.3;
      rw *= 1 + squash;
      rh *= 1 - squash;
    }
    return { rw, rh };
  }

  function drawJelly(j) {
    const s = j.size;
    const fx = Math.cos(j.angle), fy = Math.sin(j.angle);   // avant
    const rx = -fy, ry = fx;                                 // côté
    const { rw, rh } = bellShape(j);
    const alpha = 0.35 + 0.65 * j.depth;
    const tick = Math.floor(time * 5);

    /* tentacules : caractères qui ondulent derrière la cloche */
    ctx.font = `bold ${Math.max(7, s + 1)}px ui-monospace, Consolas, monospace`;
    ctx.fillStyle = colors.glyph;
    const len = Math.round(j.R * 3.4);
    for (let i = 0; i < j.tentacles; i++) {
      const u0 = (i / (j.tentacles - 1) - 0.5) * rw * 1.2;
      for (let k = 1; k <= len; k++) {
        const wave = Math.sin(time * 2.4 - k * 0.45 + i * 1.3 + j.seed) * (0.6 + 0.08 * k);
        const u = u0 * (1 - k / (len * 2.2)) + wave;          // les tentacules se resserrent
        const v = -k * 0.9;
        const px = j.x + (u * rx + v * fx) * s;
        const py = j.y + (u * ry + v * fy) * s;
        const gx = Math.floor(px / s), gy = Math.floor(py / s);
        if (hash(gx, gy, j.seed + tick) < 0.12) continue;    // trous qui scintillent
        ctx.globalAlpha = alpha * (1 - (k / (len + 1)) ** 1.5);
        ctx.fillText(TRAIL_GLYPHS[Math.floor(hash(gx, gy, j.seed) * TRAIL_GLYPHS.length)], gx * s + s / 2, gy * s + s / 2);
      }
    }

    /* cloche : pixels carrés alignés sur la grille */
    const reach = Math.ceil(j.R * 1.5);
    const cgx = Math.floor(j.x / s), cgy = Math.floor(j.y / s);
    const showGlyphs = s >= 9;
    for (let gy = cgy - reach; gy <= cgy + reach; gy++) {
      for (let gx = cgx - reach; gx <= cgx + reach; gx++) {
        const dx = (gx + 0.5) * s - j.x;
        const dy = (gy + 0.5) * s - j.y;
        const u = (dx * rx + dy * ry) / s;
        const v = (dx * fx + dy * fy) / s;
        if (v < -0.5) continue;                               // bas de la cloche plat
        // bord inférieur légèrement creusé, comme une vraie ombrelle
        const rim = v < 0.6 ? 0.25 * (u / rw) ** 2 : 0;
        const d = (u / rw) ** 2 + (Math.max(v - rim, 0) / rh) ** 2;
        if (d > 1 || v < rim - 0.5) continue;
        const h = hash(gx, gy, j.seed);
        if (h < 0.025 && d < 0.7) continue;                   // quelques trous à l'intérieur
        const sparkle = hash(gx, gy, j.seed + tick) < 0.08;
        let shade = (d > 0.72 ? 3 : d > 0.4 ? 2 : 1) - (h > 0.85 ? 1 : 0); // bord plus clair
        if (sparkle) shade = 4 + (h > 0.5 ? 1 : 0);
        shade = clamp(shade, 0, 5);
        const c = palette[shade];
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(gx * s + 0.5, gy * s + 0.5, s - 1, s - 1);
        if (showGlyphs && h > 0.72) {
          ctx.fillStyle = "rgba(0,0,0,.28)";
          ctx.fillText(CELL_GLYPHS[Math.floor(h * 97) % CELL_GLYPHS.length], gx * s + s / 2, gy * s + s / 2 + 0.5);
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  /* --- particules (cœurs, étincelles, bulles) --- */
  function spawn(x, y, glyph, color, opts = {}) {
    particles.push({
      x, y, glyph, color,
      vx: opts.vx ?? rand(-25, 25),
      vy: opts.vy ?? rand(-70, -40),
      life: opts.life ?? rand(0.6, 0.9),
      age: 0,
      size: opts.size ?? rand(12, 18),
    });
  }

  function drawParticles(dt) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    particles = particles.filter((p) => (p.age += dt) < p.life);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 15 * dt;
      const t = p.age / p.life;
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = p.color;
      ctx.font = `${Math.round(p.size * (0.8 + 0.4 * Math.sin(t * Math.PI)))}px ui-monospace, Consolas, monospace`;
      ctx.fillText(p.glyph, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  /* --- rendu --- */
  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    if (bgCanvas.width && bgCanvas.height) ctx.drawImage(bgCanvas, 0, 0, W, H);  // fenêtre de taille 0 pendant un redimensionnement
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const j of jellies) drawJelly(j);
    extras.forEach((x) => x.draw(ctx, time, dt));
    drawParticles(dt);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    for (const j of jellies) update(j, dt);
    extras.forEach((x) => x.update(dt));
    if (Math.random() < 0.5) twinkleBackground();
    render(dt);
    requestAnimationFrame(frame);
  }

  /* --- interactions --- */
  function jellyAt(x, y) {
    for (let i = jellies.length - 1; i >= 0; i--) {           // la plus proche d'abord
      const j = jellies[i];
      const cx = j.x + Math.cos(j.angle) * j.R * 0.35 * j.size;
      const cy = j.y + Math.sin(j.angle) * j.R * 0.35 * j.size;
      if (Math.hypot(x - cx, y - cy) < j.R * j.size * 1.15) return j;
    }
    return null;
  }

  const IGNORE = "a, button, input, textarea, select, label, .hero__card, .hero__title, .site-header, .site-footer";

  function poke(j) {
    if (reduceMotion) return;
    j.happy = 1;
    j.boost = 1;
    canvas.dispatchEvent(new CustomEvent("jelly:poke", { bubbles: true }));
  }

  function bubbles(x, y) {
    for (let i = 0; i < 4; i++) {
      spawn(x + rand(-8, 8), y, i % 2 ? "o" : "°", colors.glyph, { vx: rand(-8, 8), vy: rand(-55, -30), size: rand(10, 15) });
    }
  }

  if (withJellies) window.addEventListener("click", (e) => {
    if (e.target.closest(IGNORE)) return;
    const j = jellyAt(e.clientX, e.clientY);
    if (j) poke(j);
    else if (!reduceMotion) bubbles(e.clientX, e.clientY);
  });

  if (withJellies) window.addEventListener("pointermove", (e) => {
    const over = !e.target.closest(IGNORE) && jellyAt(e.clientX, e.clientY);
    document.body.style.cursor = over ? "pointer" : "";
  });

  // Clic dans le fond (hors texte et liens) : onde + koi qui fuient, papillons qui s'envolent
  if (extras.length) window.addEventListener("click", (e) => {
    if (reduceMotion || e.target.closest(IGNORE + ", main :is(h1, h2, h3, p, li)")) return;
    extras.forEach((x) => x.poke?.(e.clientX, e.clientY));
  });

  /* --- taille et thème --- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBackground();
  }

  function onThemeChange() {
    readColors();
    buildBackground();
    if (reduceMotion) render(0);
  }

  readColors();
  resize();
  populate();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const oldW = W, oldH = H;
      resize();
      for (const j of jellies) { j.x *= W / oldW; j.y *= H / oldH; }
      extras.forEach((x) => x.resize(W, H));
      if (reduceMotion) render(0);
    }, 150);
  });

  new MutationObserver(onThemeChange).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onThemeChange);

  if (reduceMotion) render(0);
  else requestAnimationFrame(frame);
}
