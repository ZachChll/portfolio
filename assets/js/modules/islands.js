/**
 * Îles flottantes en voxels (page Projets) : description des blocs, sans Three.js.
 * archipelago.js transforme ces descriptions en maillages.
 *
 * Une île = un VoxelSet :
 *  - solid : blocs pleins 1×1×1 (le sol, les murs…), une couleur par bloc ;
 *  - water : blocs d'eau (translucides) ;
 *  - props : petits pavés de taille libre (brins d'herbe, roues, pales…) ;
 *  - glow  : pavés lumineux, non éclairés (fenêtres, éclair, cristaux…) ;
 *  - parts : sous-ensembles animés (pales du moulin, méduse, éclair…), chacun
 *    avec son pivot.
 * + des émetteurs de particules (cascade, fumée, pluie).
 */

/* ---------- aléatoire reproductible ---------- */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Variante d'une couleur (#rrggbb), plus claire ou plus sombre de ±amt. */
function shade(hex, amt, r) {
  const k = 1 + (r() * 2 - 1) * amt;
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}
const hexToInt = (hex) => parseInt(hex.slice(1), 16);

export class VoxelSet {
  constructor(r) {
    this.r = r;
    this.solid = new Map();
    this.water = new Map();
    this.props = [];
    this.glow = [];
    this.parts = [];
    this.emitters = [];
  }
  key(x, y, z) { return `${x},${y},${z}`; }
  set(x, y, z, color, amt = 0.06) { this.solid.set(this.key(x, y, z), { x, y, z, c: shade(color, amt, this.r) }); }
  has(x, y, z) { return this.solid.has(this.key(x, y, z)); }
  del(x, y, z) { this.solid.delete(this.key(x, y, z)); }
  wet(x, y, z) { this.del(x, y, z); this.water.set(this.key(x, y, z), { x, y, z }); }
  box(x0, y0, z0, x1, y1, z1, color, amt) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, color, amt);
  }
  /** Pavé libre : centre (x, y, z), taille (sx, sy, sz), rotation autour de y facultative. */
  prop(x, y, z, sx, sy, sz, color, { rotY = 0, rotZ = 0, amt = 0.05 } = {}) {
    this.props.push({ x, y, z, sx, sy, sz, rotY, rotZ, c: typeof color === "number" ? color : shade(color, amt, this.r) });
  }
  light(x, y, z, sx, sy, sz, color, { rotY = 0 } = {}) {
    this.glow.push({ x, y, z, sx, sy, sz, rotY, c: hexToInt(color) });
  }
  part(name, px, py, pz) {
    const p = new VoxelSet(this.r);
    this.parts.push({ name, pivot: [px, py, pz], set: p });
    return p;
  }
  emit(kind, opts) { this.emitters.push({ kind, ...opts }); }
  /** Hauteur du sol (dessus du bloc le plus haut) en (x, z), ou null. */
  topAt(x, z, from = 12) {
    for (let y = from; y >= -20; y--) if (this.has(x, y, z) || this.water.has(this.key(x, y, z))) return y;
    return null;
  }
}

/* ---------- palettes ---------- */
const GREEN = { grass: "#7cc35a", grassDark: "#5fa646", dirt: "#8a5a3b", stone: "#8d8f99", stoneDark: "#6f717c", leaf: "#4f9e4a", leafLight: "#74bf5a", trunk: "#7a5134" };
const STORM = { grass: "#4f7f6a", grassDark: "#3e6857", dirt: "#4e3f3c", stone: "#555a6e", stoneDark: "#43475a", leaf: "#3f6f5c", leafLight: "#548a72", trunk: "#4a3a33" };

/* ---------- socle commun ---------- */
/**
 * Socle d'île : dessus herbeux irrégulier, terre, puis roche qui s'affine vers le bas
 * (forme de "goutte"), coulures d'herbe sur les bords et lianes qui pendent.
 */
function base(v, { R = 5.6, depth = 7, pal = GREEN, vines = 0.22 } = {}) {
  const r = v.r;
  const ph = [r() * 6.3, r() * 6.3, r() * 6.3];
  const radius = (a) => R * (0.86 + 0.09 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]));
  const cols = [];
  const n = Math.ceil(R) + 1;
  for (let x = -n; x <= n; x++) {
    for (let z = -n; z <= n; z++) {
      const a = Math.atan2(z, x), d = Math.hypot(x, z), rr = radius(a);
      if (d > rr) continue;
      const t = d / rr;
      const bottom = -Math.round(1 + depth * Math.pow(1 - t, 0.75) + r() * 1.6 + 0.8 * Math.sin(x * 1.3 + ph[2]) * (1 - t));
      cols.push({ x, z, t, bottom });
      for (let y = bottom; y <= 0; y++) {
        let c;
        if (y === 0) c = r() < 0.18 ? pal.grassDark : pal.grass;
        else if (y >= -2) c = pal.dirt;
        else c = y < bottom + 2 ? pal.stoneDark : r() < 0.12 ? pal.dirt : pal.stone;
        v.set(x, y, z, c, y === 0 ? 0.05 : 0.07);
      }
      // coulures d'herbe sur le bord
      if (t > 0.78 && r() < 0.55) {
        const k = 1 + Math.floor(r() * 2);
        for (let y = -1; y >= -k; y--) v.set(x, y, z, pal.grassDark, 0.05);
      }
    }
  }
  // lianes : fines, sur le flanc des colonnes du bord
  for (const c of cols) {
    if (c.t < 0.8 || r() > vines) continue;
    const len = 2 + Math.floor(r() * 4);
    const nx = c.x / (Math.hypot(c.x, c.z) || 1), nz = c.z / (Math.hypot(c.x, c.z) || 1);
    const px = c.x + nx * 0.58, pz = c.z + nz * 0.58;
    v.prop(px, -len / 2 - 0.3, pz, 0.18, len, 0.18, pal.leaf);
    v.prop(px, -len - 0.45, pz, 0.36, 0.36, 0.36, pal.leafLight);
  }
  return cols;
}

/** Touffes d'herbe et fleurs posées sur le dessus. */
function scatter(v, { count = 14, flowers = ["#e8e2d5", "#e5602a"], pal = GREEN, avoid = () => false } = {}) {
  const r = v.r;
  for (let i = 0; i < count; i++) {
    const x = Math.round((r() * 2 - 1) * 5), z = Math.round((r() * 2 - 1) * 5);
    if (avoid(x, z)) continue;
    const y = v.topAt(x, z);
    if (y === null || !v.has(x, y, z)) continue;
    const ox = x + (r() - 0.5) * 0.6, oz = z + (r() - 0.5) * 0.6;
    if (r() < 0.35 && flowers.length) {
      v.prop(ox, y + 0.75, oz, 0.08, 0.5, 0.08, pal.leaf);
      v.prop(ox, y + 1.05, oz, 0.22, 0.18, 0.22, flowers[Math.floor(r() * flowers.length)]);
    } else {
      v.prop(ox, y + 0.68, oz, 0.14, 0.36, 0.14, pal.grassDark);
      v.prop(ox + 0.15, y + 0.62, oz + 0.1, 0.12, 0.24, 0.12, pal.grass);
    }
  }
}

/** Arbre "cube" (tronc + houppier à coins cassés). */
function tree(v, x, z, { h = 3, size = 1, pal = GREEN } = {}) {
  const y0 = v.topAt(x, z);
  if (y0 === null) return;
  for (let y = 1; y <= h; y++) v.set(x, y0 + y, z, pal.trunk);
  const top = y0 + h + 1;
  for (let dx = -size; dx <= size; dx++) {
    for (let dz = -size; dz <= size; dz++) {
      for (let dy = 0; dy <= size + 1; dy++) {
        const corner = Math.abs(dx) === size && Math.abs(dz) === size;
        if (corner && (dy === 0 || dy === size + 1)) continue;
        if (dy === size + 1 && (Math.abs(dx) === size || Math.abs(dz) === size)) continue;
        v.set(x + dx, top + dy, z + dz, dy > size || v.r() < 0.3 ? pal.leafLight : pal.leaf, 0.06);
      }
    }
  }
}

/** Sapin en étages. */
function pine(v, x, z, { h = 2, pal = GREEN } = {}) {
  const y0 = v.topAt(x, z);
  if (y0 === null) return;
  for (let y = 1; y <= h; y++) v.set(x, y0 + y, z, pal.trunk);
  let y = y0 + h;
  for (const w of [1.6, 1.2, 0.8, 0.45]) {
    y += 0.55;
    v.prop(x, y, z, w * 1.6, 0.6, w * 1.6, pal.leaf);
  }
}

/** Buisson rond. */
function bush(v, x, z, pal = GREEN) {
  const y = v.topAt(x, z);
  if (y === null) return;
  v.prop(x, y + 0.85, z, 0.9, 0.7, 0.9, pal.leaf);
  v.prop(x + 0.1, y + 1.25, z - 0.1, 0.55, 0.35, 0.55, pal.leafLight);
}

/* ---------- les îles ---------- */

/** Refonte e-commerce (Tesla) : route, voiture électrique, borne, boutique vitrée. */
function tesla(v) {
  base(v, { R: 5.8, depth: 7 });
  // route (asphalte) en travers de l'île, avec marquage
  for (let x = -6; x <= 6; x++) {
    for (const z of [1, 2]) if (v.has(x, 0, z)) v.set(x, 0, z, "#3b3f48", 0.04);
  }
  for (let x = -5; x <= 5; x += 2) v.prop(x, 0.53, 1.5, 0.7, 0.04, 0.12, "#f2f2ee", { amt: 0 });
  // voiture : carrosserie blanche, vitres sombres, feux
  const cx = -1.2, cy = 0.5, cz = 1.5;
  v.prop(cx, cy + 0.42, cz, 3.1, 0.5, 1.35, "#eef0f2", { amt: 0.02 });
  v.prop(cx + 0.2, cy + 0.85, cz, 1.8, 0.42, 1.2, "#1e2531", { amt: 0.02 });
  v.prop(cx - 1.25, cy + 0.6, cz, 0.6, 0.18, 1.36, "#eef0f2", { amt: 0.02 });
  for (const [dx, dz] of [[-0.95, -0.62], [0.95, -0.62], [-0.95, 0.62], [0.95, 0.62]]) {
    v.prop(cx + dx, cy + 0.2, cz + dz, 0.55, 0.42, 0.2, "#22252b", { amt: 0 });
  }
  v.light(cx - 1.56, cy + 0.5, cz - 0.45, 0.06, 0.12, 0.3, "#ff4b4b");
  v.light(cx - 1.56, cy + 0.5, cz + 0.45, 0.06, 0.12, 0.3, "#ff4b4b");
  v.light(cx + 1.56, cy + 0.5, cz - 0.45, 0.06, 0.1, 0.32, "#fff6d8");
  v.light(cx + 1.56, cy + 0.5, cz + 0.45, 0.06, 0.1, 0.32, "#fff6d8");
  // borne de recharge
  v.prop(2.2, 1.25, 3.2, 0.5, 1.5, 0.45, "#f4f5f6", { amt: 0.02 });
  v.light(2.2, 1.7, 2.96, 0.3, 0.16, 0.04, "#e82127");
  v.prop(2.2, 0.55, 3.2, 0.7, 0.1, 0.6, "#8d8f99");
  // boutique : murs blancs, grande vitrine sombre, bandeau rouge, panneaux solaires
  const [bx0, bx1, bz0, bz1] = [-3, 1, -4, -1];
  for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) for (let y = 1; y <= 3; y++) {
    const front = z === bz1, edge = x === bx0 || x === bx1;
    const c = front && !edge && y <= 2 ? "#2a3950" : "#f1f2f4";
    v.set(x, y, z, c, front && !edge && y <= 2 ? 0.03 : 0.02);
  }
  for (let x = bx0 + 1; x < bx1; x++) v.light(x, 1.95, bz1 + 0.505, 0.9, 0.08, 0.02, "#9cc2ee");
  for (let x = bx0; x <= bx1; x++) v.prop(x, 3.62, bz1 + 0.15, 1.001, 0.22, 0.75, "#e82127", { amt: 0 });
  for (let x = bx0; x <= bx1; x += 2) v.prop(x + 0.5, 3.6, bz0 + 1, 1.7, 0.12, 1.6, "#22355a", { amt: 0.04 });
  // un peu de verdure
  tree(v, 4, -2, { h: 2 });
  bush(v, -4, 3);
  bush(v, 3, -4);
  pine(v, -4, -0, { h: 1 });
  scatter(v, { count: 16, avoid: (x, z) => (z >= 1 && z <= 2) || (x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1) });
}

/** Boulangerie : moulin, fournil fumant, champ de blé, ruisseau et cascade. */
function bakery(v) {
  base(v, { R: 5.6, depth: 8 });
  // ruisseau vers le bord, puis cascade
  const stream = [[0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4], [4, 4]];
  for (const [x, z] of stream) if (v.has(x, 0, z)) v.wet(x, 0, z);
  const edge = stream.filter(([x, z]) => !v.has(x + 1, 0, z + 1) && !v.water.has(v.key(x + 1, 0, z + 1))).pop() || [4, 4];
  v.emit("waterfall", { x: edge[0] + 0.5, y: 0.2, z: edge[1] + 0.5, dir: [0.7, 0.7], height: 12 });
  // moulin : tour en pierre claire, toit, pales animées
  const mx = -2, mz = -2;
  for (let y = 1; y <= 5; y++) {
    const s = y <= 3 ? 1 : 0;
    for (let dx = -s; dx <= s; dx++) for (let dz = -s; dz <= s; dz++) {
      if (s && Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
      v.set(mx + dx, y, mz + dz, "#efe4cf", 0.04);
    }
  }
  v.set(mx, 6, mz, "#b5523b");
  v.prop(mx, 6.65, mz, 0.6, 0.3, 0.6, "#a04634");
  v.light(mx + 1.505, 2, mz, 0.02, 0.5, 0.4, "#ffd27a");
  v.prop(mx, 5, mz + 1.05, 0.18, 0.18, 1.1, "#6e4b2e");
  // pales : tournent autour de l'axe z de leur pivot (face avant du moulin)
  const blades = v.part("blades", mx, 5, mz + 1.62);
  blades.spin = "z";
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
    blades.prop(c * 1.35, s * 1.35, 0, 2.7, 0.12, 0.08, "#8a5a3b", { rotZ: a, amt: 0 });
    blades.prop(c * 1.55 - s * 0.32, s * 1.55 + c * 0.32, 0.02, 2.0, 0.5, 0.04, "#f6efe0", { rotZ: a, amt: 0.02 });
  }
  blades.prop(0, 0, 0.05, 0.36, 0.36, 0.2, "#6e4b2e", { amt: 0 });
  // fournil : murs crème, toit en escalier, porte, fenêtres chaudes, cheminée qui fume
  const [hx0, hx1, hz0, hz1] = [1, 4, -4, -2];
  for (let x = hx0; x <= hx1; x++) for (let z = hz0; z <= hz1; z++) for (let y = 1; y <= 2; y++) v.set(x, y, z, "#f3e2c3", 0.03);
  for (let x = hx0 - 0; x <= hx1; x++) {
    v.set(x, 3, hz0, "#b5523b"); v.set(x, 3, hz1, "#b5523b"); v.set(x, 3, hz0 + 1, "#c2603f");
    v.set(x, 4, hz0 + 1, "#a04634");
  }
  v.prop(2.5, 1.45, hz1 + 0.52, 0.6, 1.0, 0.05, "#6e4b2e");
  v.light(hx0 + 0.0, 1.6, hz1 + 0.51, 0.5, 0.45, 0.02, "#ffd27a");
  v.light(hx1, 1.6, hz1 + 0.51, 0.5, 0.45, 0.02, "#ffd27a");
  v.set(hx1, 4, hz0, "#8a5a3b"); v.set(hx1, 5, hz0, "#8a5a3b");
  v.emit("smoke", { x: hx1, y: 5.8, z: hz0 });
  // étal de pains devant la porte
  v.prop(0.6, 0.9, 0.2, 1.4, 0.5, 0.7, "#8a5a3b");
  for (const dx of [-0.4, 0, 0.4]) v.prop(0.6 + dx, 1.25, 0.2, 0.3, 0.2, 0.6, "#d79a4e", { rotY: 0.3 });
  // champ de blé
  for (let x = -5; x <= -2; x++) for (let z = 1; z <= 4; z++) {
    if (!v.has(x, 0, z)) continue;
    v.set(x, 0, z, "#9a6b3f", 0.05);
    for (let k = 0; k < 3; k++) v.prop(x + (v.r() - 0.5) * 0.7, 0.95, z + (v.r() - 0.5) * 0.7, 0.12, 0.9, 0.12, "#e3bd55", { amt: 0.08 });
  }
  tree(v, 4, 0, { h: 2, pal: { ...GREEN, leaf: "#e08a3a", leafLight: "#f2b04f" } });
  bush(v, -1, 4);
  scatter(v, { count: 14, flowers: ["#f2f2ee", "#e5602a", "#f2c94c"], avoid: (x, z) => (x <= -2 && z >= 1) || stream.some(([a, b]) => a === x && b === z) });
}

/** Jeu « foudre » : île sombre, tour à paratonnerre, nuage d'orage, pluie, éclairs. */
function storm(v) {
  base(v, { R: 5.4, depth: 9, pal: STORM, vines: 0.12 });
  // aiguilles rocheuses
  for (const [x, z, h] of [[-4, 2, 3], [-3, 3, 2], [4, -3, 2], [3, 4, 1]]) {
    const y0 = v.topAt(x, z);
    if (y0 !== null) for (let y = 1; y <= h; y++) v.set(x, y0 + y, z, STORM.stoneDark, 0.08);
  }
  // tour sombre + paratonnerre
  for (let y = 1; y <= 6; y++) for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) v.set(dx, y, dz, y === 6 ? "#3a3e50" : "#4a4f63", 0.05);
  v.light(1.51, 4, 0.5, 0.02, 0.5, 0.3, "#ffe066");
  v.prop(0.5, 8, 0.5, 0.14, 3.2, 0.14, "#b8bcc8", { amt: 0 });
  v.light(0.5, 9.7, 0.5, 0.3, 0.3, 0.3, "#ffe066");
  // cristaux lumineux
  for (const [x, z] of [[-2, -3], [3, 1], [-3, -1]]) {
    const y = v.topAt(x, z);
    if (y === null) continue;
    v.light(x, y + 0.85, z, 0.32, 0.8, 0.32, "#7ff3ff", { rotY: 0.6 });
    v.light(x + 0.3, y + 0.65, z + 0.2, 0.22, 0.45, 0.22, "#5fd8ef", { rotY: 0.2 });
  }
  // petit héros (le joueur), éclair jaune sur la poitrine
  v.prop(-1.5, 1.45, 2, 0.5, 0.7, 0.35, "#2b3a67", { amt: 0 });
  v.prop(-1.5, 2.05, 2, 0.42, 0.42, 0.42, "#f0c7a0", { amt: 0 });
  v.prop(-1.5, 2.32, 2, 0.46, 0.14, 0.46, "#ffe066", { amt: 0 });
  v.light(-1.5, 1.5, 2.18, 0.14, 0.3, 0.02, "#ffe066");
  // nuage d'orage (animé : il s'illumine pendant l'éclair)
  const cloud = v.part("cloud", 0, 12.5, 0);
  const rc = v.r;
  for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) {
    const d = Math.hypot(x / 4.2, z / 3.2);
    if (d > 1) continue;
    const h = d < 0.5 ? 2 : 1;
    for (let y = 0; y < h; y++) cloud.set(x, y, z, rc() < 0.5 ? "#5b6070" : "#6b7080", 0.05);
    if (d < 0.75) cloud.set(x, -1, z, "#4a4e5c", 0.04);
  }
  v.emit("rain", { x: 0, y: 11.6, z: 0, rx: 3.6, rz: 2.6, floor: 0.6 });
  // éclair : zigzag du nuage au paratonnerre (visible pendant les flashs)
  const bolt = v.part("bolt", 0, 0, 0);
  let x = 0.2, z = 0.4;
  for (let y = 11.4; y > 10; y -= 0.45) {
    x += (rc() - 0.5) * 0.9; z += (rc() - 0.5) * 0.4;
    bolt.light(x, y, z, 0.22, 0.5, 0.22, "#fff3a8");
  }
  bolt.light(0.5, 10.2, 0.5, 0.3, 0.4, 0.3, "#fff3a8");
  pine(v, -4, -2, { h: 1, pal: STORM });
  pine(v, 2, 3, { h: 2, pal: STORM });
  scatter(v, { count: 10, flowers: ["#7ff3ff"], pal: STORM, avoid: (x, z) => x >= 0 && x <= 1 && z >= 0 && z <= 1 });
}

/** E-portfolio : un clin d'œil à chaque page (méduse, koi, lierre, montagne, terminal). */
function portfolio(v) {
  base(v, { R: 5.7, depth: 7 });
  // montagne enneigée (Contact)
  const mx = 3, mz = -3;
  for (let lvl = 0; lvl < 5; lvl++) {
    const s = 2 - Math.floor(lvl / 2);
    for (let dx = -s; dx <= s; dx++) for (let dz = -s; dz <= s; dz++) {
      const x = mx + dx, z = mz + dz;
      if (!v.has(x, 0, z) && lvl === 0) continue;
      if (lvl > 0 && !v.has(x, lvl, z) && !v.has(x, lvl - 1, z)) continue;
      v.set(x, lvl + 1, z, lvl >= 3 ? "#f4f6fa" : lvl === 2 && v.r() < 0.5 ? "#f4f6fa" : "#8d8f99", 0.05);
    }
  }
  // bassin aux koi (Compétences)
  for (let x = -4; x <= -2; x++) for (let z = 1; z <= 3; z++) if (v.has(x, 0, z)) v.wet(x, 0, z);
  const koi = v.part("koi", -3, 0.42, 2);
  koi.prop(0.75, 0, 0, 0.5, 0.1, 0.2, "#e5602a", { amt: 0 });
  koi.prop(0.98, 0.01, 0, 0.14, 0.1, 0.18, "#f1ebe0", { amt: 0 });
  koi.prop(-0.7, 0, 0.2, 0.46, 0.1, 0.18, "#f1ebe0", { amt: 0 });
  koi.prop(-0.62, 0.01, 0.2, 0.16, 0.1, 0.17, "#e5602a", { amt: 0 });
  // colonne couverte de lierre (À propos)
  const ix = -4, iz = -2;
  for (let y = 1; y <= 4; y++) v.set(ix, y, iz, "#c9c5bb", 0.04);
  v.set(ix - 0, 5, iz, "#b8b3a8");
  for (let y = 1; y <= 4.5; y += 0.5) {
    const side = Math.floor(v.r() * 4);
    const [ox, oz] = [[0.52, 0], [-0.52, 0], [0, 0.52], [0, -0.52]][side];
    v.prop(ix + ox, y, iz + oz, ox ? 0.06 : 0.4, 0.36, oz ? 0.06 : 0.4, v.r() < 0.5 ? "#3e7a3b" : "#5c9e45");
  }
  // terminal (le site lui-même) : écran sombre avec "~/"
  v.box(0, 1, -4, 1, 2, -4, "#1b1e25", 0.02);
  v.prop(0.5, 0.55, -3.2, 1.6, 0.1, 0.8, "#2c313b");
  const px = [[0, 2], [1, 1], [2, 2], [4, 0], [4, 1], [5, 2], [3, 3]];
  for (const [i, j] of px) v.light(-0.25 + i * 0.25, 2.25 - j * 0.25, -3.49, 0.2, 0.2, 0.02, "#6f9fdb");
  // méduse qui flotte au-dessus (Accueil)
  const jelly = v.part("jelly", -0.5, 7, 1.5);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) jelly.set(x, 0, z, "#2c5f9e", 0.05);
  jelly.set(0, 1, 0, "#4f86c6", 0.04);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) jelly.prop(x * 1.02, 0.9, z * 1.02, 0.2, 0.2, 0.2, "#4f86c6", { amt: 0 });
  jelly.prop(0, 0.75, 0, 1.4, 0.5, 1.4, "#3a73b5", { amt: 0 });
  jelly.tentacles = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8], [0, 0]];
  for (const [x, z] of jelly.tentacles) for (let k = 1; k <= 4; k++) jelly.prop(x + Math.sin(k * 1.3) * 0.12, -0.4 - k * 0.42, z, 0.2, 0.38, 0.2, k % 2 ? "#9cc2ee" : "#6f9fdb", { amt: 0 });
  tree(v, 3, 2, { h: 2 });
  bush(v, 1, 4);
  pine(v, -1, -4, { h: 1 });
  scatter(v, { count: 16, flowers: ["#f2f2ee", "#9cc2ee", "#e5602a"], avoid: (x, z) => (x >= 1 && z <= -1) || (x <= -2 && z >= 1 && z <= 3) });
}

const BUILDERS = { tesla, bakery, storm, portfolio };
const SEEDS = { tesla: 11, bakery: 23, storm: 37, portfolio: 51 };

export function buildIsland(kind) {
  const v = new VoxelSet(rng(SEEDS[kind] ?? 7));
  (BUILDERS[kind] || portfolio)(v);
  return v;
}
