/**
 * Lierre grimpant et papillons en pixel art, pour le fond de la page À propos.
 *
 * - Lierre : des tiges brunes partent des coins des cases et longent leurs bords
 *   (une branche le long du haut ou du bas, une le long du côté), avec des feuilles
 *   d'ivy à pointes, ombrées comme en pixel art (contour, ombre, lumière, nervure).
 *   À l'arrivée sur la page, les tiges poussent depuis les coins et les feuilles
 *   éclosent (bourgeon → feuille). Ensuite, un léger coup de vent fait frémir les
 *   feuilles d'un pixel, de gauche à droite. Jamais sur le texte.
 * - Papillons : petits sprites qui battent des ailes, évitent le texte, se posent sur
 *   les feuilles et s'envolent si on clique près d'eux.
 *
 * Tout est dessiné sur une grille de gros pixels (P px CSS), accrochée à la page
 * (défile avec elle), sur un calque au-dessus des cases.
 * Utilisé par jellyfish.js (option { ivy: true }).
 */
import { rand, clamp, mix, parseColor } from "./ascii-utils.js";

const PANELS = "main .panel";
const AVOID = "main :is(h1, h2, h3, p, li, dt, dd, img, .page-head > *)";
const INNER = 30;              // les feuilles peuvent entrer de 30 px dans une case (jamais sur le texte)
const GROW_SPEED = 16;         // cellules de tige par seconde
const UNDER_TEXT_ALPHA = 0.3;

/* Formes (pointe vers le haut ; la tige arrive sous la ligne du bas, au centre). */
const LEAF_L = [
  "......#......",
  ".....###.....",
  "....#####....",
  "#...#####...#",
  "##..#####..##",
  "###.#####.###",
  "#############",
  ".###########.",
  "..#########..",
  "...###.###...",
  "....#...#....",
];
const LEAF_M = [
  ".....#.....",
  "....###....",
  "#..#####..#",
  "##.#####.##",
  "###########",
  "###########",
  ".#########.",
  "..###.###..",
  "...#...#...",
];
const LEAF_S = [
  "...#...",
  "..###..",
  "#.###.#",
  "#######",
  "#######",
  ".##.##.",
];
const MASKS = { l: LEAF_L, m: LEAF_M, s: LEAF_S };
const STEPS = 16;              // orientations possibles des feuilles (tous les 22,5°)
/* Papillon : w aile, l reflet, b corps, a antennes */
const FLY_FRAMES = [
  ["..a.a..", "ww.b.ww", "wlwbwlw", ".wwbww.", "..w.w.."],
  ["..a.a..", "...b...", ".wlbwl.", "..wbw..", "...w..."],
  ["..a.a..", "..wbw..", "..lbl..", "...b...", "......."],
];
const FLAP_SEQ = [0, 1, 2, 1];

/** Direction (vecteur unitaire) d'une orientation : 0 = haut, puis dans le sens horaire. */
const dirOf = (step) => {
  const a = (step / STEPS) * Math.PI * 2;
  return [Math.sin(a), -Math.cos(a)];
};

/**
 * Cellules d'une feuille tournée (pas de 22,5°), avec ombrage pixel art.
 * Coordonnées relatives au bout du pétiole (la feuille démarre juste après).
 */
function leafCells(mask, step) {
  const h = mask.length, w = mask[0].length, cx = (w - 1) / 2;
  const a = (step / STEPS) * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
  const R = Math.ceil(Math.hypot(w, h)) + 1;
  const cells = [];
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      // rotation inverse, puis on lit la forme d'origine (plus proche voisin)
      const u = x * cos + y * sin, v = -x * sin + y * cos;
      const c = Math.round(u + cx), r = Math.round(v + h);
      if (r < 0 || r >= h || c < 0 || c >= w || mask[r][c] !== "#") continue;
      cells.push({ x, y, vein: c === cx && r >= 2 && r < h - 1 });
    }
  }
  const key = (x, y) => `${x},${y}`;
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2, bw = maxX - minX + 1, bh = maxY - minY + 1;
  for (const c of cells) {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !set.has(key(c.x + a, c.y + b)));
    // lumière venant d'en haut à gauche, quelle que soit l'orientation
    const s = (c.x - mx) / bw + (c.y - my) / bh;
    c.tone = edge ? 0 : c.vein ? 3 : s < -0.28 ? 3 : s > 0.3 ? 1 : 2;
  }
  return { cells, minX, minY, w: bw, h: bh };
}

export function createIvy({ reduceMotion = false, onReady = () => {} } = {}) {
  let W = 0, H = 0, P = 3;
  let colors = {};
  let vines = [];
  let leaves = [];
  let flies = [];
  let textRects = [];
  let rectTimer = 0;
  let clock = 0;
  let built = false;
  let layer, lctx, dpr = 1;
  let sprites = {};

  const docRect = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY };
  };

  function ensureLayer() {
    if (!layer) {
      layer = document.createElement("canvas");
      layer.className = "ivy-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.append(layer);
      lctx = layer.getContext("2d");
    }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = W * dpr;
    layer.height = H * dpr;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.imageSmoothingEnabled = false;
  }

  /* --- couleurs et sprites --- */
  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const v = (name, fb) => (s.getPropertyValue(name) || fb).trim();
    colors = {
      leaf: [v("--ivy-outline", "#2c5530"), v("--ivy-dark", "#3e7a3b"), v("--ivy-mid", "#5c9e45"), v("--ivy-light", "#93cc63")],
      stem: v("--ivy-stem", "#6b5537"),
      wings: [v("--fly-1", "#9cc2ee"), v("--fly-2", "#f2c94c"), v("--fly-3", "#f1ebe0"), v("--fly-4", "#e5602a")],
      body: v("--fly-body", "#9aa1ad"),
    };
    colors.wingLight = colors.wings.map((c) => `rgb(${mix(parseColor(c), [255, 255, 255], 0.45).join(",")})`);
  }

  /** Sprite d'une feuille (taille + orientation), rendu une fois puis gardé en cache. */
  function sprite(size, step) {
    const k = size + step;
    if (sprites[k]) return sprites[k];
    const L = leafCells(MASKS[size], step);
    const c = document.createElement("canvas");
    c.width = L.w * P * dpr;
    c.height = L.h * P * dpr;
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    for (const cell of L.cells) {
      g.fillStyle = colors.leaf[cell.tone];
      g.fillRect((cell.x - L.minX) * P, (cell.y - L.minY) * P, P, P);
    }
    return (sprites[k] = { canvas: c, ox: L.minX, oy: L.minY, w: L.w, h: L.h });
  }
  const renderSprites = () => { sprites = {}; };

  /* --- placement --- */
  function build(grow) {
    P = W < 600 ? 2 : 3;
    renderSprites();
    const valid = (r) => r.r - r.l > 2 && r.b - r.t > 2;
    const panels = [...document.querySelectorAll(PANELS)].map(docRect).filter(valid);
    const texts = [...document.querySelectorAll(AVOID)].map(docRect).filter(valid);
    const forbidden = [
      ...panels.map((p) => ({ l: p.l + INNER, t: p.t + INNER, r: p.r - INNER, b: p.b - INNER })),
      ...texts.map((t) => ({ l: t.l - 4, t: t.t - 4, r: t.r + 4, b: t.b + 4 })),
    ];
    const hits = (l, t, r, b) => l < 0 || r > W || forbidden.some((f) => l < f.r && r > f.l && t < f.b && b > f.t);
    const occupied = [];  // feuilles déjà posées (pas de chevauchement)

    vines = [];
    leaves = [];
    let order = 0;

    const addVine = (x0, y0, axis, dir, len) => {
      const gx = Math.round(x0 / P), gy = Math.round(y0 / P);
      const amp = rand(0.6, 1.6), f = rand(0.1, 0.2), ph = rand(0, 6.28);
      const cells = [];
      let prev = 0;
      for (let i = 0; i < len; i++) {
        let off = Math.round(amp * Math.sin(i * f + ph) * Math.min(1, i / 8) - amp * Math.sin(ph) * Math.max(0, 1 - i / 8));
        off = clamp(off, prev - 1, prev + 1);
        prev = off;
        const cx = axis === "h" ? gx + i * dir : gx + off;
        const cy = axis === "h" ? gy + off : gy + i * dir;
        if (hits(cx * P, cy * P, cx * P + P, cy * P + P)) break;
        cells.push([cx, cy]);
      }
      if (cells.length < 6) return;
      const delay = grow ? 0.4 + order++ * rand(0.15, 0.35) : -999;
      const vine = { cells, delay };
      vines.push(vine);

      // feuilles, de chaque côté, en alternance, penchées dans le sens de la pousse
      const growStep = axis === "h" ? (dir > 0 ? 4 : 12) : (dir > 0 ? 8 : 0);
      let side = Math.random() < 0.5 ? -1 : 1;
      for (let i = Math.floor(rand(1, 3)); i < cells.length; i += Math.floor(rand(3, 6))) {
        side = -side;
        const base = axis === "h" ? (side < 0 ? 0 : 8) : (side < 0 ? 12 : 4);
        const toward = Math.sign(((growStep - base + STEPS * 1.5) % STEPS) - STEPS / 2) || 1;
        const step = (base + toward * [0, 1, 1, 2, -1][Math.floor(Math.random() * 5)] + STEPS) % STEPS;
        const [dx, dy] = dirOf(step);
        const near = i > cells.length - 7;
        const r0 = Math.random();
        const sizes = near ? ["s"] : r0 < 0.3 ? ["l", "m", "s"] : r0 < 0.75 ? ["m", "s"] : ["s"];
        const [sx, sy] = cells[i];
        for (const size of sizes) {
          const pet = size === "s" ? 1 : 2;
          const petiole = Array.from({ length: pet }, (_, k) => [Math.round(sx + dx * (k + 1)), Math.round(sy + dy * (k + 1))]);
          const [ex, ey] = petiole[pet - 1];
          const sp = sprite(size, step);
          const l = (ex + sp.ox) * P, t = (ey + sp.oy) * P, r = l + sp.w * P, b = t + sp.h * P;
          if (hits(l, t, r, b)) continue;
          const cx = (l + r) / 2, cy = (t + b) / 2, rad = Math.min(r - l, b - t) / 2;
          // de légers chevauchements, comme du vrai lierre, mais pas de feuilles empilées
          if (occupied.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < (o.rad + rad) * 0.75)) continue;
          occupied.push({ cx, cy, rad });
          leaves.push({
            vine, i, size, step, petiole, ex, ey, axis,
            bud: [Math.round(ex + dx), Math.round(ey + dy)],
            cx, cy, ph: rand(0, 6.28),
          });
          break;
        }
      }
      // petite pousse claire au bout
      vine.tip = cells[cells.length - 1];
    };

    for (const p of panels) {
      // une ou deux coins par case (en haut de préférence, comme du lierre qui retombe)
      const corners = {
        tl: [p.l, p.t, 1, 1], tr: [p.r, p.t, -1, 1], bl: [p.l, p.b, 1, -1], br: [p.r, p.b, -1, -1],
      };
      const pairs = [["tl"], ["tr"], ["tl", "tr"], ["tl", "br"], ["tr", "bl"], ["tl"], ["tr"]];
      const pick = pairs[Math.floor(Math.random() * pairs.length)];
      const wCells = (p.r - p.l) / P, hCells = (p.b - p.t) / P;
      for (const k of pick) {
        const [x, y, dx, dy] = corners[k];
        addVine(x, y, "h", dx, Math.round(Math.min(wCells * rand(0.22, 0.42), 95)));
        addVine(x, y, "v", dy, Math.round(Math.min(hCells * rand(0.3, 0.55), 120)));
      }
    }
    built = true;
  }

  /* --- papillons --- */
  function createFly(k) {
    return {
      x: rand(0.1, 0.9) * W,
      y: scrollY + rand(0.15, 0.85) * H,
      heading: rand(0, Math.PI * 2),
      speed: rand(45, 70),
      flap: rand(0, 4),
      bob: rand(0, Math.PI * 2),
      state: "fly",
      timer: rand(3, 8),
      target: null,
      boost: 0,
      k,
    };
  }

  function inText(x, y, pad = 0) {
    return textRects.some((r) => x > r.l - pad && x < r.r + pad && y > r.t - pad && y < r.b + pad);
  }

  const leafGrown = (lf) => (clock - lf.vine.delay) * GROW_SPEED - lf.i > 8;

  function updateFly(f, dt) {
    if (f.state === "rest") {
      f.flap += dt * 1.2;
      f.timer -= dt;
      if (f.timer <= 0) { f.state = "fly"; f.timer = rand(5, 10); f.heading = -Math.PI / 2 + rand(-1, 1); }
      return;
    }

    f.flap += dt * (12 + f.boost * 8);
    f.boost = Math.max(0, f.boost - dt * 0.8);
    f.bob += dt * 5;
    let desired = f.heading;

    if (f.state === "fly") {
      f.timer -= dt;
      if (f.timer <= 0) {
        // se poser sur une feuille visible
        const visible = leaves.filter((l) => leafGrown(l) && l.cy > scrollY + 60 && l.cy < scrollY + H - 20);
        if (visible.length) { f.target = visible[Math.floor(Math.random() * visible.length)]; f.state = "approach"; }
        else f.timer = rand(3, 6);
      }
    }
    if (f.state === "approach" && f.target) {
      const dx = f.target.cx - f.x, dy = f.target.cy - 3 - f.y, d = Math.hypot(dx, dy);
      desired = Math.atan2(dy, dx);
      if (d < 4) { f.state = "rest"; f.x = f.target.cx; f.y = f.target.cy - 3; f.timer = rand(3, 7); return; }
      if (f.target.cy < scrollY || f.target.cy > scrollY + H) { f.state = "fly"; f.timer = rand(2, 5); }
    }

    const top = scrollY, m = 50;
    let pushX = 0, pushY = 0;
    if (f.x < m) pushX += 1;
    if (f.x > W - m) pushX -= 1;
    if (f.y < top + m + 40) pushY += 1;
    if (f.y > top + H - m) pushY -= 1;
    if (f.state !== "approach" && inText(f.x + Math.cos(f.heading) * 30, f.y + Math.sin(f.heading) * 30, 10)) {
      desired = f.heading + 1.2;
    }
    if (pushX || pushY) desired = Math.atan2(pushY || Math.sin(desired), pushX || Math.cos(desired));
    if (f.y < top - 300 || f.y > top + H + 300) { f.y = top + (f.y < top ? -10 : H + 10); f.state = "fly"; }

    const diff = ((desired - f.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    f.heading += clamp(diff, -3 * dt, 3 * dt) + rand(-0.6, 0.6) * dt;
    const sp = f.speed * (1 + f.boost * 1.8) * (f.state === "approach" ? 0.8 : 1);
    f.x += Math.cos(f.heading) * sp * dt;
    f.y += Math.sin(f.heading) * sp * dt + Math.sin(f.bob) * 14 * dt;
  }

  /* --- dessin --- */
  function drawIvy(ctx) {
    const top = scrollY - 80, bottom = scrollY + H + 80;
    // tiges
    ctx.fillStyle = colors.stem;
    for (const v of vines) {
      const n = Math.min(v.cells.length, Math.floor((clock - v.delay) * GROW_SPEED));
      for (let i = 0; i < n; i++) {
        const [x, y] = v.cells[i];
        if (y * P < top || y * P > bottom) continue;
        ctx.fillRect(x * P, y * P, P, P);
      }
      // bout de pousse plus clair pendant la croissance
      if (n > 0 && n < v.cells.length) {
        const [x, y] = v.cells[n - 1];
        ctx.fillStyle = colors.leaf[3];
        ctx.fillRect(x * P, y * P, P, P);
        ctx.fillStyle = colors.stem;
      }
    }
    // feuilles
    for (const lf of leaves) {
      if (lf.cy < top || lf.cy > bottom) continue;
      const age = (clock - lf.vine.delay) * GROW_SPEED - lf.i;
      if (age <= 0) continue;
      ctx.fillStyle = colors.stem;
      lf.petiole.slice(0, Math.floor(age)).forEach(([x, y]) => ctx.fillRect(x * P, y * P, P, P));
      if (age < 3) continue;
      if (age < 7) {
        // bourgeon
        ctx.fillStyle = colors.leaf[1];
        ctx.fillRect(lf.ex * P, lf.ey * P, P, P);
        ctx.fillStyle = colors.leaf[3];
        ctx.fillRect(lf.bud[0] * P, lf.bud[1] * P, P, P);
        continue;
      }
      // frémissement : un coup de vent passe de gauche à droite (un pixel, le long de la tige)
      let shift = 0;
      if (!reduceMotion) {
        const wind = Math.sin(clock * 0.9 - lf.cx * 0.006) * 0.7 + Math.sin(clock * 2.3 + lf.ph) * 0.3;
        if (wind > 0.72) shift = 1;
      }
      const sp = sprite(lf.size, lf.step);
      const sx = lf.axis === "h" ? shift : 0, sy = lf.axis === "v" ? shift : 0;
      ctx.drawImage(sp.canvas, (lf.ex + sp.ox + sx) * P, (lf.ey + sp.oy + sy) * P, sp.w * P, sp.h * P);
    }
  }

  function drawFlies(ctx) {
    const B = 2;
    for (const f of flies) {
      if (f.y < scrollY - 20 || f.y > scrollY + H + 20) continue;
      const frame = f.state === "rest"
        ? (Math.sin(f.flap) > 0.6 ? 1 : 0)
        : FLAP_SEQ[Math.floor(f.flap) % FLAP_SEQ.length];
      const rows = FLY_FRAMES[frame];
      const wing = colors.wings[f.k % 4];
      const pal = { w: wing, l: colors.wingLight[f.k % 4], b: colors.body, a: colors.body };
      const x0 = Math.round(f.x / B) * B - 3 * B, y0 = Math.round(f.y / B) * B - 2 * B;
      ctx.globalAlpha = inText(f.x, f.y) ? UNDER_TEXT_ALPHA : 1;
      rows.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch === ".") return;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x0 + c * B, y0 + r * B, B, B);
      }));
    }
    ctx.globalAlpha = 1;
  }

  return {
    readColors() {
      readColors();
      if (built) renderSprites();
    },

    populate(w, h) {
      W = w; H = h;
      ensureLayer();
      // attendre la fin de l'animation d'arrivée de la page (sinon le lierre serait décalé)
      const anims = document.querySelector("main")?.getAnimations?.() ?? [];
      Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {
        build(!reduceMotion);
        textRects = [...document.querySelectorAll(AVOID)].map(docRect);
        onReady();
      });
      document.fonts?.ready.then(() => { if (built) build(false); });
      flies = Array.from({ length: clamp(Math.round((W * H) / 260000), 3, 5) }, (_, k) => createFly(k));
    },

    resize(w, h) {
      W = w; H = h;
      ensureLayer();
      if (built) build(false);
    },

    update(dt) {
      clock += dt;
      rectTimer -= dt;
      if (rectTimer <= 0) { textRects = [...document.querySelectorAll(AVOID)].map(docRect); rectTimer = 0.5; }
      for (const f of flies) updateFly(f, dt);
    },

    draw() {
      if (!lctx) return;
      const ctx = lctx;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(0, -Math.round(scrollY));
      if (built) drawIvy(ctx);
      drawFlies(ctx);
      ctx.restore();
    },

    /** Clic : les papillons proches s'envolent. */
    poke(x, y) {
      const py = y + scrollY;
      for (const f of flies) {
        if (Math.hypot(f.x - x, f.y - py) < 150) {
          f.state = "fly";
          f.timer = rand(4, 8);
          f.boost = 1;
          f.heading = Math.atan2(f.y - py, f.x - x);
        }
      }
    },
  };
}
