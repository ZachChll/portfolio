/** Petits utilitaires partagés par les fonds ASCII animés (méduses, koi). */

/** Hash déterministe 0..1 à partir d'entiers (pour un aléatoire stable). */
export function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export const rand = (min, max) => min + Math.random() * (max - min);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function parseColor(str) {
  const s = str.trim();
  if (s.startsWith("#")) {
    const hex = s.length === 4 ? [...s.slice(1)].map((c) => c + c).join("") : s.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  const m = s.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [200, 60, 140];
}
export const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
