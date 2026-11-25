/**
 * Page Projets : un archipel d'îles flottantes en voxels, une île par projet.
 *
 * - Vue d'ensemble : les îles flottent doucement, des nuages passent. Survol d'une île
 *   (ou de son nom) : elle s'élève un peu.
 * - Clic sur une île : la caméra s'approche, les autres îles s'effacent, l'île tourne
 *   lentement (on peut la faire tourner en la glissant) et le détail du projet s'affiche.
 * - Nouveau clic sur l'île (ou Échap, ou "← archipel") : retour à l'archipel.
 *
 * Rendu WebGL avec Three.js (chargé seulement sur cette page). Sans WebGL, les projets
 * restent accessibles sous forme de liste.
 */
import { loadData, fromRoot, escapeHTML } from "./utils.js";
import { L } from "./i18n.js";
import { buildIsland } from "./islands.js";

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
const AZIMUTH = Math.PI / 4;
const ELEVATION = 0.58;
const NARROW = matchMedia("(max-width: 54rem), (max-aspect-ratio: 23/20)");

/* ---------- textes ---------- */
function labelTemplate(p, i) {
  return `<button class="archi__label" type="button" data-i="${i}" aria-controls="archi-detail" aria-expanded="false">
      <span class="archi__label-name">${escapeHTML(p.label || p.title)}</span>
      <span class="archi__label-meta">${escapeHTML(p.date || "")}</span>
    </button>`;
}

function detailTemplate(p) {
  const list = (p.tasks || []).map((t) => `<li>${escapeHTML(t)}</li>`).join("");
  const tags = (p.technologies || []).map((t) => `<span class="archi__tag">${escapeHTML(t)}</span>`).join("");
  return `
    <button class="archi__back" type="button" data-back>← ${L("archipelago", "archipel")}</button>
    <p class="archi__eyebrow">${escapeHTML([p.type, p.date].filter(Boolean).join(" · "))}</p>
    <h2 class="archi__title">${escapeHTML(p.title)}</h2>
    <p class="archi__summary">${escapeHTML(p.summary || "")}</p>
    ${list ? `<ul class="archi__points">${list}</ul>` : ""}
    ${tags ? `<div class="archi__tags">${tags}</div>` : ""}
    <p class="archi__meta">${escapeHTML([p.team, p.status].filter(Boolean).join(" · "))}</p>
    <a class="archi__more" href="${fromRoot(`pages/projet.html?id=${encodeURIComponent(p.id)}`)}">${L("see the project", "voir le projet")} <span aria-hidden="true">→</span></a>
    ${p.links?.code ? `<a class="archi__more archi__more--code" href="${escapeHTML(p.links.code)}" target="_blank" rel="noopener">${L("source code", "code source")} <span aria-hidden="true">↗</span></a>` : ""}`;
}

export async function initArchipelago(root) {
  const stage = root.querySelector("[data-stage]");
  const canvas = root.querySelector("canvas");
  const labelsEl = root.querySelector("[data-labels]");
  const detail = root.querySelector("[data-detail]");
  const hint = root.querySelector("[data-hint]");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  detail.id = "archi-detail";

  let projects;
  try {
    projects = await loadData("projects");
  } catch (err) {
    labelsEl.innerHTML = `<p>${L("Projects are unavailable right now.", "Projets indisponibles pour le moment.")}</p>`;
    console.error(err);
    return;
  }

  labelsEl.innerHTML = projects.map(labelTemplate).join("");
  const labels = [...labelsEl.querySelectorAll(".archi__label")];

  /* --- sélection (commune à la vue 3D et à la liste de secours) --- */
  let current = -1;
  let scene3d = null;

  function select(i, { keyboard = true } = {}) {
    if (i === current) return back({ keyboard });
    const switching = current !== -1;
    current = i;
    root.dataset.state = "focus";
    labels.forEach((l, k) => {
      l.setAttribute("aria-expanded", String(k === i));
      l.classList.toggle("is-current", k === i);
    });
    const fill = () => {
      detail.innerHTML = detailTemplate(projects[i]);
      detail.hidden = false;
      detail.classList.remove("is-out");
      detail.querySelector("[data-back]").addEventListener("click", () => back());
    };
    if (switching && !reduceMotion) {
      detail.classList.add("is-out");
      setTimeout(fill, 180);
    } else fill();
    hint.textContent = L("click the island again to go back", "cliquez à nouveau sur l’île pour revenir");
    scene3d?.focus(i);
  }

  function back({ keyboard = true } = {}) {
    if (current === -1) return;
    const was = current;
    current = -1;
    root.dataset.state = "overview";
    labels.forEach((l) => { l.setAttribute("aria-expanded", "false"); l.classList.remove("is-current"); });
    detail.classList.add("is-out");
    setTimeout(() => { if (current === -1) { detail.hidden = true; detail.innerHTML = ""; } }, 260);
    hint.textContent = L("click an island", "cliquez sur une île");
    scene3d?.focus(-1);
    if (keyboard) labels[was]?.focus({ preventScroll: true });   // rend le focus au nom de l'île (clavier)
  }

  labels.forEach((l, i) => {
    l.addEventListener("click", () => select(i));
    l.addEventListener("pointerenter", () => scene3d?.hover(i));
    l.addEventListener("pointerleave", () => scene3d?.hover(-1));
    l.addEventListener("focus", () => scene3d?.hover(i));
    l.addEventListener("blur", () => scene3d?.hover(-1));
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") back(); });

  /* --- 3D --- */
  let THREE;
  try {
    const test = document.createElement("canvas");
    if (!(test.getContext("webgl2") || test.getContext("webgl"))) throw new Error("WebGL indisponible");
    THREE = await import(THREE_URL);
  } catch (err) {
    root.dataset.mode = "flat";
    console.warn("Archipel : affichage en liste.", err);
    return;
  }
  scene3d = createScene(THREE, { stage, canvas, labels, projects, reduceMotion, onPick: (i) => select(i, { keyboard: false }) });
  root.dataset.mode = "3d";
}

/* ====================================================================== */

function createScene(THREE, { stage, canvas, labels, projects, reduceMotion, onPick }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);

  // lumière : ciel bleuté + soleil chaud qui porte les ombres
  scene.add(new THREE.HemisphereLight(0xe6efff, 0x6b5a4a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(-30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const tmp = new THREE.Object3D();
  const color = new THREE.Color();

  /* --- construction d'une île --- */
  function makeMats() {
    return {
      solid: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      glow: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      water: new THREE.MeshLambertMaterial({ color: 0x5ec3e6, transparent: true, opacity: 0.78 }),
      white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    };
  }

  function instanced(list, mat, place, shadows = true) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(box, mat, list.length);
    list.forEach((it, k) => {
      place(it);
      tmp.updateMatrix();
      mesh.setMatrixAt(k, tmp.matrix);
      if (it.c !== undefined) mesh.setColorAt(k, color.setHex(it.c));
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    return mesh;
  }

  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function meshSet(set, mats) {
    const g = new THREE.Group();
    const visible = [...set.solid.values()].filter((b) => DIRS.some(([a, c, d]) => !set.has(b.x + a, b.y + c, b.z + d)));
    const reset = () => { tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); };
    const parts = [
      instanced(visible, mats.solid, (b) => { reset(); tmp.position.set(b.x, b.y, b.z); }),
      instanced([...set.water.values()], mats.water, (b) => { reset(); tmp.position.set(b.x, b.y - 0.12, b.z); tmp.scale.set(1, 0.76, 1); }, false),
      instanced(set.props, mats.solid, (p) => { tmp.position.set(p.x, p.y, p.z); tmp.rotation.set(0, p.rotY, p.rotZ || 0); tmp.scale.set(p.sx, p.sy, p.sz); }),
      instanced(set.glow, mats.glow, (p) => { tmp.position.set(p.x, p.y, p.z); tmp.rotation.set(0, p.rotY || 0, 0); tmp.scale.set(p.sx, p.sy, p.sz); }, false),
    ].filter(Boolean);
    parts.forEach((m) => g.add(m));
    const named = {};
    for (const p of set.parts) {
      const child = meshSet(p.set, p.name === "cloud" ? { ...mats, solid: mats.cloud } : mats);
      child.group.position.set(...p.pivot);
      child.group.userData = { name: p.name, spin: p.set.spin };
      g.add(child.group);
      named[p.name] = child.group;
      Object.assign(named, child.named);
    }
    return { group: g, named };
  }

  /* --- particules (cascade, pluie, fumée) --- */
  function makeEmitter(e, mats) {
    const n = { waterfall: 70, rain: 46, smoke: 9 }[e.kind] || 0;
    const mat = e.kind === "waterfall" ? mats.foam : e.kind === "rain" ? mats.rain : mats.smoke;
    const mesh = new THREE.InstancedMesh(box, mat, n);
    mesh.frustumCulled = false;
    const ps = Array.from({ length: n }, (_, k) => ({ t: k / n, o: [Math.random() - 0.5, Math.random() - 0.5] }));
    const speed = { waterfall: 0.55, rain: 1.4, smoke: 0.16 }[e.kind];
    function update(dt) {
      ps.forEach((p, k) => {
        p.t = (p.t + dt * speed * (0.85 + 0.3 * ((k * 37) % 10) / 10)) % 1;
        const t = p.t;
        if (e.kind === "waterfall") {
          // sort du bord, s'écarte un peu puis tombe
          const out = Math.min(t * 6, 1) * 0.9;
          tmp.position.set(e.x + e.dir[0] * out + p.o[0] * 0.7, e.y - t * t * e.height, e.z + e.dir[1] * out + p.o[1] * 0.7);
          const s = 0.42 * (1 - t * 0.7);
          tmp.scale.set(s, s * 1.6, s);
        } else if (e.kind === "rain") {
          tmp.position.set(e.x + p.o[0] * 2 * e.rx, e.y - t * (e.y - e.floor), e.z + p.o[1] * 2 * e.rz);
          tmp.scale.set(0.06, 0.55, 0.06);
        } else {
          tmp.position.set(e.x + Math.sin(t * 5 + k) * 0.25 + t * 0.8, e.y + t * 3.2, e.z + t * 0.3);
          const s = 0.25 + t * 0.6;
          tmp.scale.setScalar(t > 0.85 ? s * (1 - t) / 0.15 : s);
        }
        tmp.rotation.set(0, 0, 0);
        tmp.updateMatrix();
        mesh.setMatrixAt(k, tmp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    update(0);
    return { mesh, update };
  }

  /* --- l'archipel --- */
  const islands = projects.map((p, i) => {
    const set = buildIsland(p.island);
    const mats = {
      ...makeMats(),
      cloud: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000 }),
      foam: new THREE.MeshLambertMaterial({ color: 0xc9f1ff, transparent: true, opacity: 0.85 }),
      rain: new THREE.MeshBasicMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.6 }),
      smoke: new THREE.MeshLambertMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.75 }),
    };
    const { group, named } = meshSet(set, mats);
    // cadrage : les blocs de l'île (et le nuage d'orage), sans les particules (cascade, fumée)
    const bbox = new THREE.Box3().setFromObject(group);
    const emitters = set.emitters.map((e) => makeEmitter(e, mats));
    emitters.forEach((em) => group.add(em.mesh));

    let flash = null;
    if (named.bolt) {
      named.bolt.visible = false;
      flash = new THREE.PointLight(0xfff3a8, 0, 30, 1.6);
      flash.position.set(0.5, 9, 0.5);
      group.add(flash);
    }
    const holder = new THREE.Group();          // position + flottement
    holder.add(group);                          // group : rotation de l'île
    scene.add(holder);

    // zone cliquable généreuse (invisible)
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 4, 15, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = -1;
    hit.userData.i = i;
    holder.add(hit);

    return {
      i, holder, group, named, emitters, flash, hit, mats, bbox,
      home: new THREE.Vector3(), phase: i * 1.7,
      lift: 0, liftGoal: 0, opacity: 1, opGoal: 1, rot: 0, rotVel: 0, drop: 0, dropGoal: 0,
      nextBolt: 2 + Math.random() * 3, boltT: -1,
    };
  });

  /* --- nuages qui traversent l'archipel --- */
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const clouds = Array.from({ length: 4 }, (_, k) => {
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 4);
    for (let j = 0; j < n; j++) {
      const m = new THREE.Mesh(box, cloudMat);
      const w = 1.2 + Math.random() * 1.8;
      m.scale.set(w, 0.9 + Math.random() * 0.9, w * 0.8);
      m.position.set((j - n / 2) * 1.3 + Math.random(), Math.random() * 0.8, (Math.random() - 0.5) * 1.6);
      g.add(m);
    }
    // derrière l'archipel (côté opposé à la caméra), pour ne jamais masquer une île
    g.userData = { u: (k / 4) * 90 - 45, v: -24 + Math.random() * 8, y: -6 + Math.random() * 14, speed: 0.6 + Math.random() * 0.6 };
    scene.add(g);
    return g;
  });

  /* --- caméra et cadrage --- */
  const view = { target: new THREE.Vector3(), viewH: 40, shiftX: 0, shiftY: 0 };
  const goal = { target: new THREE.Vector3(), viewH: 40, shiftX: 0, shiftY: 0 };
  let W = 1, H = 1, aspect = 1, wide = true;
  let current = -1, hovered = -1;

  const camDir = (az) => new THREE.Vector3(Math.sin(az) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(az) * Math.cos(ELEVATION));
  const right = new THREE.Vector3(Math.cos(AZIMUTH), 0, -Math.sin(AZIMUTH));
  const ground = new THREE.Vector3(Math.sin(AZIMUTH), 0, Math.cos(AZIMUTH));

  function placeCamera(target, az = AZIMUTH) {
    camera.position.copy(target).addScaledVector(camDir(az), 120);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  /** Rectangle (repère caméra) occupé par des îles, la caméra visant `target`. */
  function bounds(list, target) {
    placeCamera(target);
    const inv = camera.matrixWorldInverse;
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    const v = new THREE.Vector3();
    for (const isl of list) {
      const { min, max } = isl.bbox;
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        v.set(x, y, z).add(isl.home).applyMatrix4(inv);
        b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x);
        b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y);
      }
    }
    return b;
  }

  function layout() {
    // grand écran : les îles en ligne, en quinconce ; petit écran : deux par deux
    const spots = wide
      ? [[-16.5, 2.5, 0], [-5.5, -2.5, 2.5], [5.5, 2.5, -1], [16.5, -2.5, 1.5]]
      : [[-6.5, 2, 15], [6.5, -2, 13], [-6.5, 2, -12], [6.5, -2, -14]];
    islands.forEach((isl, k) => {
      const [u, v, y] = spots[k % spots.length];
      isl.home.copy(right).multiplyScalar(u).addScaledVector(ground, v).setY(y);
    });
  }

  function frame() {
    if (current === -1) {
      const b = bounds(islands, new THREE.Vector3());
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      goal.target.set(0, 0, 0);
      goal.viewH = Math.max(h * 1.08, (w * 1.06) / aspect);
      goal.shiftX = (b.x0 + b.x1) / 2;
      goal.shiftY = (b.y0 + b.y1) / 2 + goal.viewH * 0.02;
    } else {
      const isl = islands[current];
      const b = bounds([isl], isl.home);
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      const frac = wide ? 0.3 : 0.5;              // l'île à gauche, le détail à droite
      const room = wide ? 0.56 : 0.9;
      goal.target.copy(isl.home);
      goal.viewH = Math.max(h * 1.12, w / room / aspect);
      const viewW = goal.viewH * aspect;
      goal.shiftX = (b.x0 + b.x1) / 2 - (frac - 0.5) * viewW;
      goal.shiftY = (b.y0 + b.y1) / 2;
    }
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    aspect = W / H;
    const was = wide;
    wide = !NARROW.matches;                    // même seuil que le CSS (détail à droite ou dessous)
    renderer.setSize(W, H, false);
    if (was !== wide || !islands[0].home.lengthSq()) layout();
    frame();
  }

  /* --- interactions --- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = islands.filter((isl) => isl.opacity > 0.5).map((isl) => isl.hit);
    const hit = ray.intersectObjects(targets, false)[0];
    return hit ? hit.object.userData.i : -1;
  }

  let down = null, dragging = false;
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, last: e.clientX, t: performance.now() };
    dragging = false;
  });
  window.addEventListener("pointermove", (e) => {
    if (down && current !== -1) {
      const dx = e.clientX - down.last;
      if (Math.abs(e.clientX - down.x) > 6) { dragging = true; canvas.setPointerCapture?.(e.pointerId); }
      if (dragging) {
        const isl = islands[current];
        isl.rot += dx * 0.012;
        isl.rotVel = dx * 0.012 / Math.max(0.016, (performance.now() - down.t) / 1000);
        down.t = performance.now();
      }
      down.last = e.clientX;
      return;
    }
    if (e.target !== canvas) return;
    const i = pick(e);
    setHover(i);
    canvas.style.cursor = i !== -1 ? "pointer" : "";
  });
  window.addEventListener("pointerup", (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (dragging || moved > 6 || e.target !== canvas) { dragging = false; return; }
    const i = pick(e);
    if (i !== -1) onPick(i);
  });
  canvas.addEventListener("pointerleave", () => { if (!down) setHover(-1); });

  function setHover(i) {
    if (i === hovered) return;
    hovered = i;
    labels.forEach((l, k) => l.classList.toggle("is-hover", k === i));
  }

  /* --- boucle --- */
  const project = new THREE.Vector3();
  let last = performance.now(), time = 0, running = true, raf = 0;
  const ease = (dt, k) => (reduceMotion ? 1 : 1 - Math.exp(-dt * k));

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    const motion = reduceMotion ? 0 : 1;
    const k = ease(dt, 3.2);

    view.target.lerp(goal.target, k);
    view.viewH += (goal.viewH - view.viewH) * k;
    view.shiftX += (goal.shiftX - view.shiftX) * k;
    view.shiftY += (goal.shiftY - view.shiftY) * k;
    placeCamera(view.target, AZIMUTH + 0.035 * Math.sin(time * 0.12) * motion);
    const hh = view.viewH / 2, hw = hh * aspect;
    Object.assign(camera, { left: view.shiftX - hw, right: view.shiftX + hw, top: view.shiftY + hh, bottom: view.shiftY - hh });
    camera.updateProjectionMatrix();

    for (const isl of islands) {
      const focused = isl.i === current;
      isl.liftGoal = current === -1 && isl.i === hovered ? 0.7 : 0;
      isl.opGoal = current === -1 || focused ? 1 : 0;
      isl.dropGoal = current === -1 || focused ? 0 : -4;
      isl.lift += (isl.liftGoal - isl.lift) * ease(dt, 6);
      isl.opacity += (isl.opGoal - isl.opacity) * ease(dt, 4);
      isl.drop += (isl.dropGoal - isl.drop) * ease(dt, 2.5);

      isl.holder.position.copy(isl.home);
      isl.holder.position.y += isl.lift + isl.drop + Math.sin(time * 0.7 + isl.phase) * 0.28 * motion;
      isl.holder.visible = isl.opacity > 0.01;
      setOpacity(isl, isl.opacity);

      // rotation : lente en focus (+ élan après un glissé), retour à l'endroit sinon
      if (focused) {
        if (!dragging) {
          isl.rot += (0.16 * motion + isl.rotVel) * dt;
          isl.rotVel *= Math.exp(-dt * 2.5);
        }
      } else {
        const home = Math.round(isl.rot / (Math.PI * 2)) * Math.PI * 2;
        isl.rot += (home - isl.rot) * ease(dt, 2.5);
        isl.rotVel = 0;
      }
      isl.group.rotation.y = isl.rot;

      if (!isl.holder.visible) continue;
      animateParts(isl, dt, motion);
    }

    for (const c of clouds) {
      const d = c.userData;
      d.u += dt * d.speed * motion;
      if (d.u > 50) d.u = -50;
      c.position.copy(right).multiplyScalar(d.u).addScaledVector(ground, d.v).setY(d.y);
    }
    cloudMat.opacity += ((current === -1 ? 0.55 : 0) - cloudMat.opacity) * ease(dt, 4);
    clouds.forEach((c) => { c.visible = cloudMat.opacity > 0.02; });

    renderer.render(scene, camera);
    placeLabels();
    if (running) raf = requestAnimationFrame(tick);
  }

  function animateParts(isl, dt, motion) {
    const n = isl.named;
    if (n.blades) n.blades.rotation.z -= dt * 1.1 * motion;
    if (n.koi) n.koi.rotation.y += dt * 0.9 * motion;
    if (n.jelly) {
      n.jelly.position.y = 7 + Math.sin(time * 1.4) * 0.35 * motion;
      n.jelly.scale.y = 1 + Math.sin(time * 2.8) * 0.06 * motion;
    }
    if (motion) isl.emitters.forEach((em) => em.update(dt));
    // orage : un éclair toutes les quelques secondes (double flash)
    if (n.bolt && motion) {
      isl.nextBolt -= dt;
      if (isl.nextBolt <= 0) { isl.boltT = 0; isl.nextBolt = 3 + Math.random() * 4; }
      let on = false;
      if (isl.boltT >= 0) {
        isl.boltT += dt;
        const t = isl.boltT;
        on = (t < 0.09) || (t > 0.16 && t < 0.3);
        if (t > 0.35) isl.boltT = -1;
      }
      n.bolt.visible = on;
      isl.flash.intensity = on ? 60 : 0;
      isl.mats.cloud.emissive.setHex(on ? 0x5a5a40 : 0x000000);
    }
  }

  function setOpacity(isl, o) {
    const solidT = o < 0.999;
    for (const key of ["solid", "glow", "cloud", "white"]) {
      const m = isl.mats[key];
      if (m.transparent !== solidT) { m.transparent = solidT; m.needsUpdate = true; }
      m.opacity = o;
    }
    isl.mats.water.opacity = 0.78 * o;
    isl.mats.foam.opacity = 0.85 * o;
    isl.mats.rain.opacity = 0.6 * o;
    isl.mats.smoke.opacity = 0.75 * o;
  }

  function placeLabels() {
    islands.forEach((isl, k) => {
      const l = labels[k];
      if (!l) return;
      project.set(0, isl.bbox.max.y + 1.2, 0).add(isl.holder.position);
      project.project(camera);
      const x = (project.x * 0.5 + 0.5) * W, y = (-project.y * 0.5 + 0.5) * H;
      l.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
  }

  // pause hors écran / onglet caché
  const io = new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting && !document.hidden));
  io.observe(stage);
  document.addEventListener("visibilitychange", () => setRunning(!document.hidden));
  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  new ResizeObserver(resize).observe(stage);
  resize();
  view.target.copy(goal.target);
  view.viewH = goal.viewH * 1.25;              // petit zoom d'arrivée
  view.shiftX = goal.shiftX;
  view.shiftY = goal.shiftY;
  raf = requestAnimationFrame(tick);

  return {
    focus(i) { current = i; setHover(-1); frame(); },
    hover(i) { if (current === -1) setHover(i); },
  };
}
