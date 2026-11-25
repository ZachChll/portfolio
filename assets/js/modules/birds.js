/**
 * Montagnes et volée d'oiseaux en ASCII, pour le fond de la page Contact.
 *
 * - Montagnes : trois lignes de crêtes en caractères (/ \ ^ -) en bas de l'écran,
 *   de la plus lointaine (pâle, enneigée) à la plus proche, avec un versant à l'ombre
 *   plus texturé que le versant au soleil. Rendu une fois (refait au changement de
 *   thème ou de taille).
 * - Oiseaux : une petite volée (règles de "boids" : rester groupés, aller dans la même
 *   direction, ne pas se coller) qui vole au-dessus des crêtes en évitant le texte.
 *   Un clic près d'eux les disperse.
 * - Envoi du formulaire (événement "contact:sent") : une lettre ASCII apparaît, un
 *   oiseau quitte la volée, vient la prendre et s'envole au-dessus des montagnes.
 *
 * Utilisé par jellyfish.js (option { birds: true }).
 */
import { hash, rand, clamp } from "./ascii-utils.js";

const CW = 10, RH = 14;                       // grille des montagnes (px)
const AVOID = "main :is(h1, h2, p, li, label, legend, input, textarea, button)";
const UNDER_TEXT_ALPHA = 0.2;
const FAR_FRAMES = ["v", "~", "-", "~"];
const NEAR_FRAMES = ["\\v/", "~v~", "_v_", "~v~"];
const LETTER = [" ____ ", "|\\__/|", "|____|"];

export function createSky({ reduceMotion = false } = {}) {
  let W = 0, H = 0, mtnH = 0;
  let colors = {};
  let mtn = null;                              // canvas des montagnes
  let ranges = [];                             // paramètres des crêtes (gardés entre deux rendus)
  let birds = [];
  let textRects = [];
  let rectTimer = 0;
  let layer, lctx, dpr = 1;
  let letter = null, carrier = null, respawn = 0;

  /* --- couleurs --- */
  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const v = (name, fb) => (s.getPropertyValue(name) || fb).trim();
    colors = {
      layers: [v("--mount-far", "rgb(156 194 238 / .18)"), v("--mount-mid", "rgb(156 194 238 / .28)"), v("--mount-near", "rgb(156 194 238 / .42)")],
      snow: v("--mount-snow", "rgb(232 234 238 / .85)"),
      bg: v("--color-bg", "#111318"),
      bird: v("--bird", "#9aa1ad"),
      letter: v("--jelly-text", "#6f9fdb"),
    };
  }

  /* --- montagnes --- */
  function makeRanges() {
    ranges = [
      { base: 0.62, amp: 0.5, f: [rand(0.03, 0.045), rand(0.08, 0.11), rand(0.2, 0.3)], snow: true, density: 0.16 },
      { base: 0.8, amp: 0.34, f: [rand(0.04, 0.06), rand(0.1, 0.14), rand(0.25, 0.35)], snow: true, density: 0.26 },
      { base: 0.95, amp: 0.18, f: [rand(0.05, 0.07), rand(0.12, 0.18), rand(0.3, 0.4)], snow: false, density: 0.36 },
    ].map((r, i) => {
      // sommets rapprochés (en colonnes), pour que les versants se croisent en V
      const peaks = [];
      const gap = [[9, 16], [7, 13], [4, 9]][i];
      for (let x = rand(-6, 4); x < 400; x += rand(...gap)) {
        const gentle = () => (Math.random() < 0.25 ? 0.5 : 1);
        peaks.push({ x, h: rand(0.4, 1), sl: gentle(), sr: gentle() });
      }
      return { ...r, peaks, p: [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)], seed: Math.floor(rand(1, 1e5)) };
    });
  }

  const ridged = (t) => (1 - Math.abs(Math.sin(t))) ** 1.6;

  function renderMountains() {
    if (!W || !H || !ranges.length) return;
    mtnH = Math.round(clamp(H * 0.4, 190, 380));
    const d = Math.min(window.devicePixelRatio || 1, 2);
    mtn = mtn || document.createElement("canvas");
    mtn.width = W * d;
    mtn.height = mtnH * d;
    const g = mtn.getContext("2d");
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, W, mtnH);
    g.font = `12px ui-monospace, Consolas, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const cols = Math.ceil(W / CW) + 2, rows = Math.ceil(mtnH / RH);

    ranges.forEach((L, li) => {
      // hauteur de la crête, en lignes de la grille : des sommets en / \ (pente d'une
      // ligne par colonne), plus quelques épaulements en pente douce
      const baseRow = Math.round((mtnH * L.base) / RH), ampRows = (mtnH * L.amp) / RH;
      const rr = [];
      for (let x = -1; x <= cols; x++) {
        let row = baseRow;
        for (const pk of L.peaks) {
          const px = pk.x, dist = Math.abs(x - px);
          if (dist > 60) continue;
          const slope = x < px ? pk.sl : pk.sr;
          row = Math.min(row, Math.round(baseRow - pk.h * ampRows + dist * slope));
        }
        // petit relief irrégulier
        row += Math.round(0.6 * Math.sin(x * L.f[2] + L.p[2]) * ridged(x * L.f[1] + L.p[1]));
        rr.push(row);
      }
      // pentes d'au plus une ligne par colonne (pour que les / et \ se suivent)
      for (let i = 1; i < rr.length; i++) rr[i] = clamp(rr[i], rr[i - 1] - 1, rr[i - 1] + 1);
      for (let i = rr.length - 2; i >= 0; i--) rr[i] = clamp(rr[i], rr[i + 1] - 1, rr[i + 1] + 1);
      const at = (x) => rr[x + 1];

      // cache ce qui est derrière (les crêtes lointaines)
      g.fillStyle = colors.bg;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.moveTo(0, mtnH);
      for (let x = 0; x < cols; x++) g.lineTo(x * CW + CW / 2, at(x) * RH + RH / 2);
      g.lineTo(W, mtnH);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;

      const snowLine = Math.round((mtnH * (L.base - L.amp * 0.58)) / RH);
      for (let x = 0; x < cols; x++) {
        const r = at(x), prev = at(x - 1), next = at(x + 1);
        const cx = x * CW + CW / 2;
        let ch = "-";
        if (prev > r && next > r) ch = "^";
        else if (next < r) ch = "/";
        else if (prev < r) ch = "\\";
        const snowy = L.snow && r <= snowLine;
        g.fillStyle = snowy ? colors.snow : colors.layers[li];
        g.fillText(ch, cx, r * RH + RH / 2);

        // versant : à l'ombre (la crête descend vers la droite) plus texturé
        const shade = next > prev ? 1.5 : next < prev ? 0.55 : 1;
        for (let y = r + 1; y < rows; y++) {
          const depth = y - r;
          const h = hash(x, y, L.seed + li);
          if (snowy && depth <= 1 && h < 0.75) {
            g.fillStyle = colors.snow;
            g.fillText(h < 0.3 ? "*" : ".", cx, y * RH + RH / 2);
            continue;
          }
          const p = L.density * shade * (depth < 3 ? 1.3 : 1);
          if (h > p) continue;
          g.fillStyle = colors.layers[li];
          g.fillText(shade > 1 ? (h < p * 0.4 ? ":" : ".") : (h < p * 0.2 ? "'" : "."), cx, y * RH + RH / 2);
        }
      }
    });
  }

  /* --- oiseaux --- */
  const skyTop = () => 80;
  const skyBottom = () => H - mtnH * 0.45;

  function createBird(edge = false) {
    const near = Math.random() < 0.4;
    const a = rand(-0.4, 0.4) + (Math.random() < 0.5 ? 0 : Math.PI);
    const sp = rand(45, 65);
    return {
      x: edge ? (Math.cos(a) > 0 ? -20 : W + 20) : rand(0.1, 0.9) * W,
      y: rand(skyTop() + 20, Math.max(skyTop() + 40, skyBottom() - 40)),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.4,
      near, flap: rand(0, 4), rate: rand(7, 10), glide: 0, scatter: 0,
    };
  }

  function inText(x, y, pad = 0) {
    return textRects.some((r) => x > r.l - pad && x < r.r + pad && y > r.t - pad && y < r.b + pad);
  }

  function updateBird(b, dt) {
    let ax = 0, ay = 0, n = 0, cx = 0, cy = 0, avx = 0, avy = 0;
    for (const o of birds) {
      if (o === b) continue;
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
      if (d > 110) continue;
      n++; cx += o.x; cy += o.y; avx += o.vx; avy += o.vy;
      if (d < 30 && d > 0) { ax -= (dx / d) * (30 - d) * 3; ay -= (dy / d) * (30 - d) * 3; }
    }
    if (n && b.scatter <= 0) {
      ax += (cx / n - b.x) * 0.35 + (avx / n - b.vx) * 0.6;
      ay += (cy / n - b.y) * 0.35 + (avy / n - b.vy) * 0.6;
    }
    // un peu de fantaisie
    ax += rand(-20, 20); ay += rand(-12, 12);
    // rester dans le ciel, au-dessus des crêtes
    const m = 60;
    if (b.x < -m) ax += 120; else if (b.x > W + m) ax -= 120;
    if (b.y < skyTop()) ay += 90; else if (b.y > skyBottom()) ay -= 90;
    // éviter le texte : on regarde un peu devant
    const sp0 = Math.hypot(b.vx, b.vy) || 1;
    const lx = b.x + (b.vx / sp0) * 50, ly = b.y + (b.vy / sp0) * 50;
    for (const r of textRects) {
      if (lx > r.l - 20 && lx < r.r + 20 && ly > r.t - 20 && ly < r.b + 20) {
        const midY = (r.t + r.b) / 2;
        ay += (b.y < midY ? -1 : 1) * 160;
      }
    }

    b.vx += ax * dt; b.vy += ay * dt;
    const sp = Math.hypot(b.vx, b.vy), max = b.scatter > 0 ? 150 : 72, min = 35;
    const k = sp > max ? max / sp : sp < min ? min / sp : 1;
    b.vx *= k; b.vy *= k * 0.985;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.scatter = Math.max(0, b.scatter - dt);

    // battements, avec des moments de vol plané
    if (b.glide > 0) { b.glide -= dt; if (b.glide <= 0) b.flap = 0; }
    else {
      b.flap += dt * b.rate * (b.scatter > 0 ? 1.6 : 1);
      if (Math.random() < dt * 0.25) b.glide = rand(0.6, 1.6);
    }
  }

  function birdGlyph(b, frames) {
    return b.glide > 0 ? frames[2] : frames[Math.floor(b.flap) % frames.length];
  }

  /* --- la lettre et l'oiseau qui l'emporte --- */
  function ensureLayer() {
    if (!layer) {
      layer = document.createElement("canvas");
      layer.className = "sky-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.append(layer);
      lctx = layer.getContext("2d");
    }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = W * dpr;
    layer.height = H * dpr;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function onSent(e) {
    if (reduceMotion || !W) return;
    const { x, y } = e.detail;
    letter = { x, y, t: 0, swing: 0 };
    // l'oiseau le plus proche quitte la volée
    let best = null, bd = Infinity;
    for (const b of birds) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd && b.x > 0 && b.x < W) { bd = d; best = b; }
    }
    if (best) birds.splice(birds.indexOf(best), 1);
    const from = best || createBird(true);
    carrier = { x: from.x, y: from.y, vx: from.vx, vy: from.vy, flap: 0, state: "fetch", t: 0 };
  }

  function updateCarrier(dt) {
    if (letter) letter.t += dt;
    if (!carrier) return;
    carrier.t += dt;
    carrier.flap += dt * (carrier.state === "carry" ? 14 : 11);
    let tx, ty, speed;
    if (carrier.state === "fetch") {
      if (letter.t < 0.5) return;               // la lettre finit d'apparaître
      tx = letter.x; ty = letter.y - 18; speed = 230;
      if (Math.hypot(tx - carrier.x, ty - carrier.y) < 10) carrier.state = "carry";
    } else {
      // s'envole vers le haut, au-dessus des montagnes, puis sort de l'écran
      tx = carrier.x + (carrier.vx >= 0 ? 400 : -400); ty = -200; speed = 150 + carrier.t * 30;
    }
    const dx = tx - carrier.x, dy = ty - carrier.y, d = Math.hypot(dx, dy) || 1;
    const turn = carrier.state === "fetch" ? 6 : 1.5;
    carrier.vx += ((dx / d) * speed - carrier.vx) * Math.min(1, turn * dt);
    carrier.vy += ((dy / d) * speed - carrier.vy) * Math.min(1, turn * dt);
    carrier.x += carrier.vx * dt;
    carrier.y += carrier.vy * dt;
    if (carrier.state === "carry") {
      letter.swing += dt;
      letter.x = carrier.x + Math.sin(letter.swing * 5) * 3;
      letter.y = carrier.y + 22;
      if (carrier.y < -60 || carrier.x < -80 || carrier.x > W + 80) {
        carrier = null; letter = null; respawn = 2.5;
      }
    }
  }

  function drawFx() {
    if (!lctx) return;
    lctx.clearRect(0, 0, W, H);
    if (!letter) return;
    const pop = clamp(letter.t / 0.35, 0, 1);
    const s = 0.4 + 0.6 * (1 - (1 - pop) ** 3);
    lctx.save();
    lctx.translate(letter.x, letter.y);
    lctx.scale(s, s);
    lctx.globalAlpha = pop;
    lctx.font = `bold 12px ui-monospace, Consolas, monospace`;
    lctx.textAlign = "center";
    lctx.textBaseline = "middle";
    lctx.fillStyle = colors.letter;
    LETTER.forEach((row, i) => lctx.fillText(row, 0, (i - 1) * 11));
    lctx.restore();
    if (carrier) {
      lctx.font = `bold 17px ui-monospace, Consolas, monospace`;
      lctx.textAlign = "center";
      lctx.textBaseline = "middle";
      lctx.fillStyle = colors.bird;
      lctx.globalAlpha = 1;
      lctx.fillText(NEAR_FRAMES[Math.floor(carrier.flap) % NEAR_FRAMES.length], carrier.x, carrier.y);
    }
  }

  return {
    readColors() {
      readColors();
      renderMountains();
    },

    populate(w, h) {
      W = w; H = h;
      if (!ranges.length) makeRanges();
      renderMountains();
      ensureLayer();
      textRects = [...document.querySelectorAll(AVOID)].map((el) => el.getBoundingClientRect())
        .map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
      birds = Array.from({ length: clamp(Math.round((W * H) / 80000), 7, 15) }, () => createBird(false));
      // une partie de la volée part groupée
      const lead = birds[0];
      birds.slice(1, Math.ceil(birds.length * 0.6)).forEach((b) => {
        b.x = lead.x + rand(-60, 60); b.y = lead.y + rand(-30, 30); b.vx = lead.vx; b.vy = lead.vy;
      });
      window.removeEventListener("contact:sent", onSent);
      window.addEventListener("contact:sent", onSent);
    },

    resize(w, h) {
      W = w; H = h;
      renderMountains();
      ensureLayer();
    },

    update(dt) {
      rectTimer -= dt;
      if (rectTimer <= 0) {
        textRects = [...document.querySelectorAll(AVOID)]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width && r.bottom > 0 && r.top < H)
          .map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
        rectTimer = 0.25;
      }
      for (const b of birds) updateBird(b, dt);
      updateCarrier(dt);
      if (respawn > 0 && (respawn -= dt) <= 0) birds.push(createBird(true));
    },

    draw(ctx) {
      if (mtn) ctx.drawImage(mtn, 0, H - mtnH, W, mtnH);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = colors.bird;
      for (const b of birds) {
        ctx.font = b.near ? "bold 15px ui-monospace, Consolas, monospace" : "12px ui-monospace, Consolas, monospace";
        ctx.globalAlpha = (inText(b.x, b.y, 4) ? UNDER_TEXT_ALPHA : 1) * (b.near ? 0.9 : 0.6);
        ctx.fillText(birdGlyph(b, b.near ? NEAR_FRAMES : FAR_FRAMES), b.x, b.y);
      }
      ctx.globalAlpha = 1;
      drawFx();
    },

    /** Clic : les oiseaux proches se dispersent. */
    poke(x, y) {
      for (const b of birds) {
        const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
        if (d < 180) {
          b.vx = (dx / (d || 1)) * 150;
          b.vy = (dy / (d || 1)) * 150;
          b.scatter = rand(1, 1.8);
          b.glide = 0;
        }
      }
    },
  };
}
