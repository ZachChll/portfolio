/**
 * Carpes koi en "pixels" ASCII, vues de dessus, pour le fond animé.
 * Même style que les méduses : corps en cases carrées alignées sur une grille,
 * nageoires en caractères qui ondulent.
 *
 * - Nage libre sur tout l'écran (errance + ondulation du corps).
 * - Évite le texte de la page : chaque poisson "voit" les blocs de texte devant
 *   lui et s'en écarte (il peut encore les frôler, mais n'y reste pas).
 * - Clic dans l'eau : une petite onde, et les koi proches s'enfuient.
 *
 * Utilisé par jellyfish.js (option { koi: true }).
 */
import { hash, rand, clamp, parseColor, mix } from "./ascii-utils.js";

const AVOID_SELECTOR = "main :is(h1, h2, h3, p, li, .wheel__label)";
const FIN_GLYPHS = ":;|'.,";
const JOINTS = 14;          // articulations de la colonne vertébrale
const AVOID_MARGIN = 46;    // distance (px) à partir de laquelle un koi s'écarte du texte
const EDGE_MARGIN = 70;     // distance (px) aux bords de l'écran
const UNDER_TEXT_ALPHA = 0.18; // opacité d'un koi quand il passe sous du texte

/** Demi-largeur du corps (0..1) le long du corps (t = 0 tête → 1 queue). */
function profile(t) {
  if (t < 0.3) return 0.55 + 0.45 * Math.sin((t / 0.3) * (Math.PI / 2));   // tête arrondie
  return 1 - 0.78 * ((t - 0.3) / 0.7) ** 1.25;
}

/** Motifs classiques : kohaku (blanc/rouge), sanke (+ noir), tancho, orenji. */
function createPattern() {
  const r = Math.random();
  const patches = [];
  if (r < 0.2) {
    // tancho : une seule tache ronde sur la tête
    patches.push({ t: 0.1, u: 0, rt: 0.07, ru: 0.75, c: "orange" });
    return { base: "white", patches };
  }
  if (r < 0.35) return { base: "orange", patches }; // orenji : tout orange
  // kohaku / sanke : 2 ou 3 grandes taches rouges
  const centers = [rand(0.06, 0.18), rand(0.34, 0.5), rand(0.6, 0.76)];
  const count = Math.random() < 0.5 ? 2 : 3;
  for (let k = 0; k < count; k++) {
    patches.push({ t: centers[k], u: rand(-0.45, 0.45), rt: rand(0.07, 0.13), ru: rand(0.7, 1.5), c: "orange" });
  }
  if (r > 0.7) {
    // sanke : petites taches noires
    for (let k = 0; k < 4; k++) {
      patches.push({ t: rand(0.25, 0.8), u: rand(-0.7, 0.7), rt: rand(0.025, 0.045), ru: rand(0.25, 0.45), c: "black" });
    }
  }
  return { base: "white", patches };
}

export function createKoiPond() {
  let fish = [];
  let ripples = [];
  let rects = [];
  let rectTimer = 0;
  let colors = {};
  let W = 0, H = 0;

  /* --- couleurs (variables CSS, donc liées au thème) --- */
  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const get = (name, fallback) => parseColor(s.getPropertyValue(name) || fallback);
    const edge = get("--koi-edge", "#5a5560");
    const shades = (base) => [mix(base, edge, 0.45), mix(base, edge, 0.18), base, mix(base, [255, 255, 255], 0.35)];
    colors = {
      white: shades(get("--koi-white", "#ede6da")),
      orange: shades(get("--koi-orange", "#e8642c")),
      black: shades(get("--koi-black", "#232329")),
      eye: get("--koi-black", "#232329"),
      ripple: s.getPropertyValue("--jelly-glyph").trim() || "rgba(150,150,175,.8)",
    };
  }

  /* --- zones de texte à éviter (coordonnées écran, comme le canvas) --- */
  function readRects() {
    rects = [];
    for (const el of document.querySelectorAll(AVOID_SELECTOR)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > H) continue;
      rects.push(r);
    }
  }

  function insideText(x, y, pad = 0) {
    return rects.some((r) => x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad);
  }

  /* --- création --- */
  function createFish() {
    const depth = rand(0.45, 1);
    const s = Math.round(4 + depth * 3);              // taille d'une case
    const len = Math.round(rand(20, 26));             // longueur en cases
    const f = {
      depth, s, len,
      maxW: len * rand(0.14, 0.16),                   // demi-largeur max en cases
      segLen: (len * s) / (JOINTS - 1),
      speed: rand(28, 44) * (0.7 + depth * 0.5),
      heading: rand(0, Math.PI * 2),
      wander: 0,
      beat: rand(0, Math.PI * 2),
      beatRate: rand(4.5, 6),
      startle: 0,
      flee: null,
      seed: Math.floor(rand(1, 1e6)),
      pattern: createPattern(),
      joints: [],
    };
    // position de départ hors du texte si possible
    let x, y, tries = 0;
    do { x = rand(0, W); y = rand(0, H); } while (insideText(x, y, 60) && ++tries < 25);
    for (let i = 0; i < JOINTS; i++) {
      f.joints.push({ x: x - Math.cos(f.heading) * f.segLen * i, y: y - Math.sin(f.heading) * f.segLen * i });
    }
    return f;
  }

  function populate(w, h) {
    W = w; H = h;
    readRects();
    const count = clamp(Math.round((W * H) / 160000), 3, 7);
    fish = Array.from({ length: count }, createFish).sort((a, b) => a.depth - b.depth);
  }

  function resize(w, h) {
    const sx = w / (W || w), sy = h / (H || h);
    for (const f of fish) for (const j of f.joints) { j.x *= sx; j.y *= sy; }
    W = w; H = h;
    readRects();
  }

  /* --- comportement --- */

  /** Poussée pour s'éloigner du texte, vue depuis un point (x, y). */
  function avoidFrom(x, y) {
    let ax = 0, ay = 0;
    for (const r of rects) {
      const nx = clamp(x, r.left, r.right), ny = clamp(y, r.top, r.bottom);
      let dx = x - nx, dy = y - ny;
      const d = Math.hypot(dx, dy);
      if (d === 0) {
        // dans le bloc : sortir par le bord le plus proche
        const exits = [[x - r.left, -1, 0], [r.right - x, 1, 0], [y - r.top, 0, -1], [r.bottom - y, 0, 1]];
        exits.sort((a, b) => a[0] - b[0]);
        ax += exits[0][1] * 2.2;
        ay += exits[0][2] * 2.2;
      } else if (d < AVOID_MARGIN) {
        const w = (1 - d / AVOID_MARGIN) ** 2 * 1.6;
        ax += (dx / d) * w;
        ay += (dy / d) * w;
      }
    }
    return [ax, ay];
  }

  function update(f, dt) {
    const head = f.joints[0];
    const fx = Math.cos(f.heading), fy = Math.sin(f.heading);

    // errance douce
    f.wander = clamp(f.wander + rand(-1, 1) * dt * 2.2, -0.9, 0.9);
    let dx = fx + Math.cos(f.heading + f.wander) * 0.5;
    let dy = fy + Math.sin(f.heading + f.wander) * 0.5;

    // texte : on regarde là où on est et un peu devant
    const look = 70 + f.len * f.s * 0.3;
    const [a1x, a1y] = avoidFrom(head.x, head.y);
    const [a2x, a2y] = avoidFrom(head.x + fx * look, head.y + fy * look);
    const ax = a1x + a2x, ay = a1y + a2y;
    const avoiding = Math.hypot(ax, ay) > 0.05;
    dx += ax * 1.6;
    dy += ay * 1.6;

    // bords de l'écran
    const m = EDGE_MARGIN;
    if (head.x < m) dx += ((m - head.x) / m) * 2.5;
    if (head.x > W - m) dx -= ((head.x - (W - m)) / m) * 2.5;
    if (head.y < m) dy += ((m - head.y) / m) * 2.5;
    if (head.y > H - m) dy -= ((head.y - (H - m)) / m) * 2.5;

    // fuite après un clic
    if (f.flee && f.startle > 0.2) {
      const vx = head.x - f.flee.x, vy = head.y - f.flee.y, d = Math.hypot(vx, vy) || 1;
      dx += (vx / d) * 3 * f.startle;
      dy += (vy / d) * 3 * f.startle;
    }

    // on tourne progressivement vers la direction voulue
    const target = Math.atan2(dy, dx);
    let diff = ((target - f.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = (avoiding ? 2.4 : 1.2) + f.startle * 4;
    f.heading += clamp(diff, -turn * dt, turn * dt);

    f.startle = Math.max(0, f.startle - dt * 0.9);
    f.beat += dt * f.beatRate * (1 + f.startle * 1.5 + (avoiding ? 0.3 : 0));

    const speed = f.speed * (1 + f.startle * 3.2 + (avoiding ? 0.35 : 0)) * (0.85 + 0.15 * Math.sin(f.beat));
    const swim = f.heading + Math.sin(f.beat) * 0.16;   // battement de queue
    head.x += Math.cos(swim) * speed * dt;
    head.y += Math.sin(swim) * speed * dt;

    // le corps suit la tête
    for (let i = 1; i < JOINTS; i++) {
      const p = f.joints[i - 1], q = f.joints[i];
      const vx = q.x - p.x, vy = q.y - p.y, d = Math.hypot(vx, vy) || 1;
      q.x = p.x + (vx / d) * f.segLen;
      q.y = p.y + (vy / d) * f.segLen;
    }
  }

  /* --- dessin --- */
  function patchAt(f, t, u) {
    let c = f.pattern.base;
    for (const p of f.pattern.patches) {
      const k = ((t - p.t) / p.rt) ** 2 + ((u - p.u) / p.ru) ** 2;
      if (k < 1 - hash(Math.round(t * 60), Math.round(u * 6), f.seed) * 0.35) c = p.c;
    }
    return c;
  }

  function drawFish(ctx, f, time) {
    const s = f.s;
    const J = f.joints;
    const alpha = 0.45 + 0.45 * f.depth;
    const cells = new Map();

    // corps : tranches perpendiculaires à la colonne, rastérisées sur la grille
    for (let i = 0; i < JOINTS - 1; i++) {
      const p = J[i], q = J[i + 1];
      let tx = p.x - q.x, ty = p.y - q.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const sub = Math.max(2, Math.ceil(f.segLen / (s * 0.5)));
      for (let k = 0; k < sub; k++) {
        const e = k / sub;
        const cx = p.x + (q.x - p.x) * e, cy = p.y + (q.y - p.y) * e;
        const t = (i + e) / (JOINTS - 1);
        const w = profile(t) * f.maxW * s;
        const reach = Math.ceil(w / s) + 1;
        const gx0 = Math.floor(cx / s), gy0 = Math.floor(cy / s);
        for (let gy = gy0 - reach; gy <= gy0 + reach; gy++) {
          for (let gx = gx0 - reach; gx <= gx0 + reach; gx++) {
            const vx = (gx + 0.5) * s - cx, vy = (gy + 0.5) * s - cy;
            const along = vx * tx + vy * ty;
            if (Math.abs(along) > s * 0.6) continue;
            const across = vx * nx + vy * ny;
            if (Math.abs(across) > w) continue;
            const key = gx + "," + gy;
            const prev = cells.get(key);
            if (!prev || Math.abs(along) < prev.a) cells.set(key, { gx, gy, t, u: across / w, a: Math.abs(along) });
          }
        }
      }
    }

    const tick = Math.floor(time * 4);
    // sous le texte, le koi devient presque transparent pour ne pas gêner la lecture
    const under = (gx, gy) => insideText((gx + 0.5) * s, (gy + 0.5) * s, 4);
    for (const c of cells.values()) {
      ctx.globalAlpha = under(c.gx, c.gy) ? alpha * UNDER_TEXT_ALPHA : alpha;
      const h = hash(c.gx, c.gy, f.seed);
      const au = Math.abs(c.u);
      let color;
      if (c.t > 0.035 && c.t < 0.085 && au > 0.42 && au < 0.9) {
        color = colors.eye;                                       // yeux
      } else {
        const shades = colors[patchAt(f, c.t, c.u)];
        let shade = au > 0.78 ? 0 : au > 0.45 ? 1 : 2;            // bords plus sombres
        if (hash(c.gx, c.gy, f.seed + tick) < 0.05) shade = 3;   // reflets
        else if (h > 0.9 && shade > 0) shade--;
        color = shades[shade];
      }
      ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
      ctx.fillRect(c.gx * s + 0.5, c.gy * s + 0.5, s - 1, s - 1);
    }

    // nageoires : cases translucides qui ondulent, avec quelques caractères
    const finBase = colors[f.pattern.base === "orange" ? "orange" : "white"];
    const fins = new Map();
    const finCell = (x, y, a) => {
      const gx = Math.floor(x / s), gy = Math.floor(y / s), key = gx + "," + gy;
      if (!cells.has(key) && !(fins.get(key)?.a >= a)) fins.set(key, { gx, gy, a });
    };
    const frame = (i) => {
      const p = J[i], q = J[i + 1];
      const tl = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      const tx = (p.x - q.x) / tl, ty = (p.y - q.y) / tl;
      return { p, tx, ty, nx: -ty, ny: tx };
    };

    // nageoires pectorales : petits éventails de chaque côté, qui battent
    {
      const { p, tx, ty, nx, ny } = frame(3);
      const w = profile(3 / (JOINTS - 1)) * f.maxW * s;
      for (const side of [-1, 1]) {
        const ang = 0.75 + Math.sin(f.beat * 0.6 + side * 1.3) * 0.3;   // vers l'arrière
        const dx = nx * side * Math.cos(ang) - tx * Math.sin(ang);
        const dy = ny * side * Math.cos(ang) - ty * Math.sin(ang);
        const bx = p.x + nx * side * w * 0.8, by = p.y + ny * side * w * 0.8;
        for (let a = 0.5; a <= f.maxW * 1.3; a += 0.5) {
          const half = a * 0.45;
          for (let b = -half; b <= half; b += 0.5) {
            finCell(bx + (dx * a + -dy * b) * s, by + (dy * a + dx * b) * s, 0.55 - (a / (f.maxW * 1.3)) * 0.3);
          }
        }
      }
    }

    // nageoire caudale : voile fourchu qui ondule derrière la queue
    {
      const { tx, ty, nx, ny } = frame(JOINTS - 2);
      const tail = J[JOINTS - 1];
      const L = f.maxW * 2.4;                       // longueur en cases
      for (let d = 0; d <= L; d += 0.5) {
        const k = d / L;
        const spread = 0.6 + d * 0.62;
        const sway = Math.sin(f.beat - d * 0.45) * (0.4 + k * 1.4);
        const notch = k > 0.6 ? (k - 0.6) * L * 1.1 : -1;   // échancrure de la fourche
        for (let b = -spread; b <= spread; b += 0.5) {
          if (Math.abs(b) < notch) continue;
          const x = tail.x - tx * d * s + nx * (b + sway) * s;
          const y = tail.y - ty * d * s + ny * (b + sway) * s;
          finCell(x, y, 0.6 - k * 0.35);
        }
      }
    }

    ctx.font = `bold ${Math.max(7, s + 2)}px ui-monospace, Consolas, monospace`;
    for (const c of fins.values()) {
      const h = hash(c.gx, c.gy, f.seed + 7);
      const col = finBase[h > 0.8 ? 3 : 2];
      ctx.globalAlpha = alpha * c.a * (under(c.gx, c.gy) ? UNDER_TEXT_ALPHA : 1);
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      if (h < 0.18) {
        ctx.globalAlpha *= Math.min(1.6, 1 / c.a);   // quelques caractères dans les voiles
        ctx.fillText(FIN_GLYPHS[Math.floor(h * 97) % FIN_GLYPHS.length], c.gx * s + s / 2, c.gy * s + s / 2);
      } else {
        ctx.fillRect(c.gx * s + 0.5, c.gy * s + 0.5, s - 1, s - 1);
      }
    }

    ctx.globalAlpha = 1;
  }

  function drawRipples(ctx, dt) {
    ripples = ripples.filter((r) => (r.age += dt) < 1.1);
    ctx.fillStyle = colors.ripple;
    ctx.font = "12px ui-monospace, Consolas, monospace";
    for (const r of ripples) {
      const radius = 6 + r.age * 70;
      const n = Math.max(8, Math.round(radius / 5));
      ctx.globalAlpha = (1 - r.age / 1.1) * 0.8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.fillText(i % 2 ? "." : "·", r.x + Math.cos(a) * radius, r.y + Math.sin(a) * radius);
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    readColors,
    populate,
    resize,

    update(dt) {
      rectTimer -= dt;
      if (rectTimer <= 0) { readRects(); rectTimer = 0.25; }
      for (const f of fish) update(f, dt);
    },

    draw(ctx, time, dt) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const f of fish) drawFish(ctx, f, time);
      drawRipples(ctx, dt);
    },

    /** Clic dans l'eau : une onde, et les koi proches s'enfuient. */
    poke(x, y) {
      ripples.push({ x, y, age: 0 });
      for (const f of fish) {
        const h = f.joints[0];
        if (Math.hypot(h.x - x, h.y - y) < 220) { f.startle = 1; f.flee = { x, y }; }
      }
    },
  };
}
