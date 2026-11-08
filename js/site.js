// Point Pneus Guerido — accueil v2.
// Pneu 3D qu'on traverse, pages qui glissent les unes sous les autres, voiture violette qui devient un plan.
import { initUI, setActiveNav } from "./ui.js";

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const range = (p, a, b) => clamp01((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mobile = matchMedia("(max-width: 760px)").matches || matchMedia("(pointer: coarse)").matches;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const motion = root.classList.contains("motion");

initUI();
$("year").textContent = String(new Date().getFullYear());

/* ---------------- Les feuilles qui glissent ---------------- */
const sheets = [...document.querySelectorAll(".pw")].map((pw) => ({ pw, page: pw.firstElementChild, rv: 1, last: "" }));
const NAV_OF = { garage: "garage", atelier: "atelier", services: "services", infos: "infos", contact: "infos" };
let navKey = null;

function updateSheets() {
  const vh = innerHeight;
  let current = null;
  for (const s of sheets) {
    const top = s.pw.getBoundingClientRect().top;
    s.rv = motion ? clamp01(-top / vh) : top < vh * 0.5 ? 1 : 0;
    if (s.rv >= 0.5) current = s;
    if (!motion) continue;
    const key = s.rv >= 1 ? "1" : s.rv.toFixed(3);
    if (key === s.last) continue;
    s.last = key;
    if (s.rv >= 1) { s.page.style.transform = ""; s.page.style.setProperty("--veil", "0"); }
    else {
      const e = easeOut(s.rv);
      s.page.style.transform = `scale(${(0.93 + 0.07 * e).toFixed(4)})`;
      s.page.style.setProperty("--veil", ((1 - e) * 0.78).toFixed(3));
    }
  }
  const key = current ? NAV_OF[current.page.id] || null : null;
  if (key !== navKey) { navKey = key; setActiveNav(key); }
}
addEventListener("resize", () => setActiveNav(navKey));

// Apparitions : seulement quand la feuille est vraiment découverte
const pending = new Set(document.querySelectorAll("[data-reveal]"));
const sheetOf = new Map();
pending.forEach((el) => sheetOf.set(el, sheets.find((s) => s.pw.contains(el)) || null));
function updateReveals() {
  if (!pending.size) return;
  const vh = innerHeight;
  for (const el of pending) {
    const s = sheetOf.get(el);
    if (s && s.rv < 0.35) continue;
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.9 && r.bottom > 0) { el.classList.add("in"); pending.delete(el); }
  }
}

// Profondeur : les photos glissent à des vitesses différentes
const depthEls = [...document.querySelectorAll("[data-depth]")];
function updateDepth() {
  const vh = innerHeight;
  for (const el of depthEls) {
    const r = el.parentElement.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const off = (r.top + r.height / 2 - vh / 2) * Number(el.dataset.depth);
    el.style.transform = `translate3d(0, ${(-off).toFixed(1)}px, 0)`;
  }
}

// Cartes qui s'inclinent sous la souris
if (fine) {
  document.querySelectorAll("[data-tilt]").forEach((c) => {
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty("--ry", `${((x - 0.5) * 8).toFixed(2)}deg`);
      c.style.setProperty("--rx", `${((0.5 - y) * 6).toFixed(2)}deg`);
      c.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      c.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    });
    c.addEventListener("pointerleave", () => { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
  });
}

/* ---------------- Liens internes ---------------- */
let lenis = null;
function scrollToTarget(el) {
  if (!el) return;
  let y;
  if (el.id === "haut") y = 0;
  else {
    const s = sheets.find((x) => x.pw.contains(el));
    const base = s ? s.pw.getBoundingClientRect().top + scrollY + (motion ? innerHeight : 0) : 0;
    y = s && s.page !== el ? base + (el.getBoundingClientRect().top - s.page.getBoundingClientRect().top) - 90 : s ? base : el.getBoundingClientRect().top + scrollY;
  }
  if (lenis) lenis.scrollTo(y, { duration: 1.6 }); else scrollTo({ top: y, behavior: "smooth" });
}
const SVC_CARD = { crevaison: "svc-crevaison", geometrie: "svc-geometrie", clim: "svc-clim", freins: "svc-freins", vidange: "svc-vidange", phares: "svc-meca" };
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute("href").slice(1);
  const el = id ? document.getElementById(id) : null;
  if (!el) return;
  e.preventDefault();
  const card = a.dataset.svc ? $(SVC_CARD[a.dataset.svc]) : null;
  scrollToTarget(card || el);
  if (card) setTimeout(() => { card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1800); }, 1500);
});

function onScrollWork() { updateSheets(); updateReveals(); updateDepth(); }

if (!motion) {
  root.classList.add("loaded");
  addEventListener("scroll", onScrollWork, { passive: true });
  addEventListener("resize", onScrollWork);
  onScrollWork();
} else {
  startMotion().catch((err) => {
    console.error(err);
    root.classList.remove("motion"); root.classList.add("static", "loaded");
    addEventListener("scroll", onScrollWork, { passive: true });
    onScrollWork();
  });
}

/* ================= Animation 3D ================= */
async function startMotion() {
  const THREE = await import("three");
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const { buildTire } = await import("./tire.js?v=3");

  let shown = 0, target = 0;
  const countEl = $("loader-count");
  const tick = () => { shown += (target - shown) * 0.18; countEl.textContent = String(Math.round(shown)); if (!root.classList.contains("loaded")) requestAnimationFrame(tick); };
  tick();

  lenis = window.Lenis ? new window.Lenis({ lerp: 0.09, wheelMultiplier: 0.95, smoothWheel: true }) : null;
  window.__lenis = lenis;
  lenis?.stop();

  const makeRenderer = (canvas, maxDpr) => {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    return r;
  };

  /* ----- Scène 1 : le pneu ----- */
  const intro = $("intro"), introStage = intro.querySelector(".intro-stage"), lightLayer = $("intro-light");
  const tireRenderer = makeRenderer($("gl-tire"), mobile ? 1.75 : 2);
  const tireScene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(tireRenderer);
  tireScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const tireCam = new THREE.PerspectiveCamera(30, 1, 0.01, 60);
  const rim = new THREE.SpotLight(0xc9b6ff, 110, 14, 0.6, 0.6);
  rim.position.set(2.8, 2.6, -2.6);
  const rim2 = new THREE.SpotLight(0xffe6c8, 40, 14, 0.7, 0.7);
  rim2.position.set(-3, -2, -2.4);
  const keyLight = new THREE.DirectionalLight(0xfff3e4, 0.5);
  keyLight.position.set(-3, 3, 4);
  tireScene.add(rim, rim.target, rim2, rim2.target, keyLight);

  target = 12;
  await document.fonts.load('800 100px "Archivo"').catch(() => {});
  target = 30;
  await new Promise((r) => setTimeout(r, 30));
  const tire = buildTire({ quality: mobile ? 0.55 : 1, textureSize: mobile ? 2048 : 4096 });
  tireScene.add(tire);
  target = 82;

  const BORE = tire.userData.boreRadius;
  let d0 = 6;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  if (fine) addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  const sizeTire = () => {
    const w = introStage.clientWidth, h = introStage.clientHeight;
    tireRenderer.setSize(w, h, false);
    tireCam.aspect = w / h; tireCam.updateProjectionMatrix();
    const halfMin = Math.tan(THREE.MathUtils.degToRad(tireCam.fov / 2)) * Math.min(1, tireCam.aspect);
    d0 = (tireCam.aspect < 1 ? 1.22 : 1.56) / halfMin;
  };
  sizeTire();

  // Aperçu figé d'un moment de l'animation : ?vue=atelier:0.6 (section:avancement), pour les captures.
  const vueParam = new URLSearchParams(location.search).get("vue");
  const forced = vueParam ? { id: vueParam.split(":")[0], p: Number(vueParam.split(":")[1] || 0) } : null;
  const sectionProgress = (el) => {
    if (forced) return forced.id === el.id ? { p: forced.p, visible: true } : { p: 0, visible: false };
    const r = el.getBoundingClientRect();
    const total = r.height - innerHeight;
    return { p: total > 0 ? clamp01(-r.top / total) : 0, visible: r.bottom > 0 && r.top < innerHeight };
  };

  const ring = Array.from({ length: 16 }, (_, i) => new THREE.Vector3(Math.cos((i / 16) * Math.PI * 2) * BORE * 0.99, Math.sin((i / 16) * Math.PI * 2) * BORE * 0.99, 0));
  const tmp = new THREE.Vector3();
  let spin = 0, lastScroll = scrollY;

  function updateTire(dt) {
    const { p, visible } = sectionProgress(intro);
    if (!visible) return;
    const turn = easeInOut(range(p, 0, 0.5));
    pointer.sx += (pointer.x - pointer.sx) * 0.05; pointer.sy += (pointer.y - pointer.sy) * 0.05;
    const v = scrollY - lastScroll; lastScroll = scrollY;
    spin += dt * 0.12 + v * 0.0009;
    tire.rotation.set(lerp(0.14, 0, turn) + pointer.sy * 0.08 * (1 - turn), lerp(-0.62, 0, turn) + pointer.sx * 0.12 * (1 - turn), 0);
    tire.rotateZ(spin);
    const t = range(p, 0.08, 0.86);
    const z = -0.5 + (d0 + 0.5) * Math.pow(1 - t, 1.7);
    tireCam.position.set(0, 0, z);
    tireCam.lookAt(0, 0, z - 1);
    tire.visible = z > 0.06;

    const w = introStage.clientWidth, h = introStage.clientHeight;
    if (!tire.visible) lightLayer.style.clipPath = "none";
    else {
      tire.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const q of ring) {
        tmp.copy(q).applyMatrix4(tire.matrixWorld).project(tireCam);
        const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      lightLayer.style.clipPath = `ellipse(${((maxX - minX) / 2).toFixed(1)}px ${((maxY - minY) / 2).toFixed(1)}px at ${((minX + maxX) / 2).toFixed(1)}px ${((minY + maxY) / 2).toFixed(1)}px)`;
    }
    introStage.style.setProperty("--copy-op", (1 - range(p, 0.04, 0.26)).toFixed(3));
    introStage.style.setProperty("--spread", easeIn(range(p, 0, 0.34)).toFixed(3));
    lightLayer.style.setProperty("--mark-scale", lerp(0.4, 1, easeOut(range(p, 0.1, 0.9))).toFixed(3));
    lightLayer.style.setProperty("--chips-op", range(p, 0.84, 0.96).toFixed(3));
    if (tire.visible) tireRenderer.render(tireScene, tireCam);
    else tireRenderer.clear();
  }

  updateTire(0);
  target = 100;
  await new Promise((r) => setTimeout(r, 450));
  countEl.textContent = "100";
  root.classList.add("loaded");
  lenis?.start();

  /* ----- Scène 2 : la voiture violette ----- */
  const drive = $("atelier"), driveStage = $("drive-stage");
  const carRenderer = makeRenderer($("gl-car"), mobile ? 1.5 : 1.6);
  carRenderer.localClippingEnabled = true;
  const carScene = new THREE.Scene();
  carScene.environment = new THREE.PMREMGenerator(carRenderer).fromScene(studioEnvironment(THREE), 0.02).texture;
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.2);
  sun.position.set(-4, 10, 3);
  carScene.add(sun);
  const carCam = new THREE.PerspectiveCamera(16, 1, 0.5, 200);
  carCam.up.set(0, 0, -1);
  const carState = { ready: false, car: null, length: 4.4, width: 2.3, lines: null, glows: [], anchors: [] };
  const clipCar = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const clipPlan = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  let halfH = 3, dirty = true;

  const sizeCar = () => {
    const w = driveStage.clientWidth, h = driveStage.clientHeight;
    carRenderer.setSize(w, h, false);
    carCam.aspect = w / h; carCam.updateProjectionMatrix();
    const fill = carCam.aspect < 1 ? 0.48 : 0.7;
    const byLength = carState.length / fill / 2;
    const byWidth = carState.width / (carCam.aspect < 1 ? 0.66 : 0.5) / 2 / carCam.aspect;
    halfH = Math.max(byLength, byWidth);
    const d = halfH / Math.tan(THREE.MathUtils.degToRad(carCam.fov / 2));
    carCam.position.set(0, d, 0);
    carCam.lookAt(0, 0, 0);
    dirty = true;
  };
  sizeCar();

  const VIOLET = new THREE.Color(0xa47bff);
  const glowTexture = () => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(200,170,255,0.75)"); gr.addColorStop(1, "rgba(120,60,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  };

  const loadCarScene = async () => {
    const { loadCar, buildBlueprint } = await import("./car.js?v=3");
    const res = await loadCar("assets/3d/car-concept.glb", { variant: "Pearly Swirly" });
    res.model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (/Paint/i.test(m.name)) {
          m.color.set(0x5a2fc2); m.metalness = 0.72; m.roughness = 0.3;
          if ("clearcoat" in m) { m.clearcoat = 1; m.clearcoatRoughness = 0.04; }
          if ("iridescence" in m) m.iridescence = 0.25;
        }
        if (/Headlight|Brakelight|Signallight/i.test(m.name)) {
          m.emissive = VIOLET.clone(); m.emissiveIntensity = /Head/i.test(m.name) ? 2.2 : 3;
          m.color.set(0x8b5cf6);
        }
        m.clippingPlanes = [clipCar];
        m.needsUpdate = true;
      });
    });
    const bp = await buildBlueprint(res.model, { color: 0xe4dcf6, opacity: 0.5, threshold: 34, glow: /Headlight|Taillight|Turnsignal/i, glowColor: 0xb794ff });
    bp.material.clippingPlanes = [clipPlan];
    bp.glowMaterial.clippingPlanes = [clipPlan];
    res.car.add(bp.lines);

    // Halos violets sur les feux du plan
    const tex = glowTexture();
    res.model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    res.model.traverse((o) => {
      if (!o.isMesh || !/BodyHeadlights|BodyTaillights$/.test(o.name)) return;
      box.setFromObject(o);
      const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      for (const sx of [-1, 1]) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb794ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, clippingPlanes: [clipPlan], opacity: 0.95 }));
        sp.position.set(c.x + sx * size.x * 0.36, c.y + 0.4, c.z);
        sp.scale.setScalar(Math.max(0.55, size.z * 2.6));
        res.car.add(sp); carState.glows.push(sp);
      }
    });

    // Points d'ancrage des services, dans le repère de la voiture
    const anchors = [];
    document.querySelectorAll("#callouts .co").forEach((el, i) => {
      let node = null;
      res.model.traverse((o) => { if (!node && o.name === el.dataset.anchor) node = o; });
      if (!node) return;
      box.setFromObject(node);
      const c = box.getCenter(new THREE.Vector3());
      c.y = Math.max(c.y, 0.3);
      anchors.push({ el, i, local: c });
    });
    carState.anchors = anchors;

    // Ombre de contact douce
    const sc = document.createElement("canvas"); sc.width = 256; sc.height = 512;
    const g = sc.getContext("2d");
    g.filter = "blur(22px)"; g.fillStyle = "rgba(0,0,0,0.9)";
    g.beginPath(); g.roundRect?.(46, 40, 164, 432, 70); if (!g.roundRect) g.rect(46, 40, 164, 432); g.fill();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(res.width * 1.25, res.length * 1.16),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0.6, depthWrite: false, clippingPlanes: [clipCar] }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.004;
    res.car.add(shadow);

    carScene.add(res.car);
    Object.assign(carState, { car: res.car, length: res.length, width: Math.min(res.width, 2.35), lines: bp.lines });
    sizeCar();
    // Shaders et textures préparés avant que la voiture n'arrive à l'écran : pas d'à-coup au premier passage.
    res.car.position.z = halfH * 3;
    if (carRenderer.compileAsync) await carRenderer.compileAsync(carScene, carCam).catch(() => {});
    carRenderer.render(carScene, carCam);
    carState.ready = true; dirty = true;
  };
  const startCarLoad = (() => { let started = false; return () => { if (started) return; started = true; loadCarScene().catch((e) => console.error("voiture", e)); }; })();
  setTimeout(startCarLoad, mobile ? 2200 : 700);

  // Légendes reliées aux pièces
  const callouts = [...document.querySelectorAll("#callouts .co")];
  const lineSvg = $("co-lines");
  const NS = "http://www.w3.org/2000/svg";
  const groups = callouts.map((el, i) => {
    const gEl = document.createElementNS(NS, "g");
    gEl.innerHTML = `<path class="ln"/><circle class="ring" r="7"/><circle class="dot" r="${mobile ? 8 : 4}"/>${mobile ? `<text class="num">${i + 1}</text>` : ""}`;
    lineSvg.appendChild(gEl);
    el.addEventListener("pointerenter", () => gEl.classList.add("hot"));
    el.addEventListener("pointerleave", () => gEl.classList.remove("hot"));
    el.addEventListener("focus", () => gEl.classList.add("hot"));
    el.addEventListener("blur", () => gEl.classList.remove("hot"));
    return gEl;
  });

  function placeCallouts(op) {
    const w = driveStage.clientWidth, h = driveStage.clientHeight;
    const pos = carState.car.position;
    const cols = { l: [], r: [] };
    for (const a of carState.anchors) {
      tmp.copy(a.local).add(pos).project(carCam);
      a.x = (tmp.x + 1) / 2 * w; a.y = (1 - tmp.y) / 2 * h;
      const side = Math.abs(a.local.x) > 0.15 ? (a.x < w / 2 ? "l" : "r") : a.el.dataset.side;
      cols[side].push(a);
    }
    if (!mobile) {
      const boxW = 230, gap = 66;
      for (const side of ["l", "r"]) {
        const list = cols[side].sort((p, q) => p.y - q.y);
        list.forEach((a, k) => { a.ly = Math.max(a.y, k ? list[k - 1].ly + gap : 150); });
        for (let k = list.length - 1; k >= 0; k--) list[k].ly = Math.min(list[k].ly, h - 110 - (list.length - 1 - k) * gap);
        list.forEach((a) => {
          const lx = side === "l" ? Math.max(24, w * 0.06) : w - Math.max(24, w * 0.06) - boxW;
          a.el.style.left = `${lx}px`; a.el.style.top = `${a.ly}px`;
          const edge = side === "l" ? lx + boxW - 6 : lx + 6;
          const knee = side === "l" ? edge + 34 : edge - 34;
          a.path = `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${knee.toFixed(1)} ${a.ly.toFixed(1)} L${edge.toFixed(1)} ${a.ly.toFixed(1)}`;
        });
      }
    }
    carState.anchors.forEach((a) => {
      const gEl = groups[a.i];
      const o = op[a.i];
      gEl.style.opacity = o.toFixed(3);
      gEl.querySelector(".ln").setAttribute("d", mobile ? "" : a.path);
      for (const c of gEl.querySelectorAll("circle")) { c.setAttribute("cx", a.x.toFixed(1)); c.setAttribute("cy", a.y.toFixed(1)); }
      const t = gEl.querySelector("text"); if (t) { t.setAttribute("x", a.x.toFixed(1)); t.setAttribute("y", a.y.toFixed(1)); }
      const ln = gEl.querySelector(".ln");
      if (!mobile && ln.getTotalLength) { const L = ln.getTotalLength(); ln.style.strokeDasharray = `${L}`; ln.style.strokeDashoffset = `${(L * (1 - o)).toFixed(1)}`; }
      a.el.style.setProperty("--o", o.toFixed(3));
      a.el.style.pointerEvents = o > 0.5 ? "auto" : "none";
      a.el.tabIndex = o > 0.5 ? 0 : -1;
    });
  }

  // Avancement lissé : la voiture glisse au lieu de suivre chaque cran de molette.
  let sp = 0, done = false, lastSp = -1;
  function updateDrive(dt) {
    const { p, visible } = sectionProgress(drive);
    if (!visible && !forced) return;
    if (sectionProgress(intro).p > 0.45 || p > 0) startCarLoad();
    sp += (p - sp) * (1 - Math.exp(-dt * 7));
    if (Math.abs(p - sp) < 0.0004) sp = p;
    if (sp >= 0.92) done = true;
    const e = done ? 1 : sp;
    if (Math.abs(e - lastSp) < 0.0002 && !dirty) return;
    lastSp = e; dirty = false;

    const s = driveStage.style;
    s.setProperty("--title-op", (1 - range(e, 0.3, 0.4)).toFixed(3));
    s.setProperty("--title-spread", easeIn(range(e, 0.26, 0.42)).toFixed(3));
    const wipe = easeInOut(range(e, 0.46, 0.76));
    s.setProperty("--bp", wipe.toFixed(3));
    s.setProperty("--co-op", range(e, 0.78, 0.88).toFixed(3));
    if (!carState.ready) { carRenderer.clear(); return; }

    const L = carState.length, car = carState.car;
    const centerZ = mobile ? -halfH * 0.2 : 0;
    const enter = easeOut(range(e, 0, 0.32));
    car.position.z = lerp(halfH + L * 0.62, centerZ, enter);
    car.position.x = Math.sin(enter * Math.PI) * 0.18;
    car.rotation.y = Math.sin(enter * Math.PI) * -0.05 * (1 - enter * 0.6);
    const zc = car.position.z + lerp(-L / 2 - 0.25, L / 2 + 0.25, wipe);
    clipCar.constant = -zc;
    clipPlan.constant = zc;
    carState.lines.visible = wipe > 0;
    const pulse = 0.85 + Math.sin(performance.now() / 600) * 0.1;
    carState.glows.forEach((g) => { g.visible = wipe > 0; g.material.opacity = pulse; });
    const scanOn = wipe > 0 && wipe < 1;
    if (scanOn) { tmp.set(0, 0, zc).project(carCam); s.setProperty("--scan-y", `${((1 - tmp.y) / 2 * driveStage.clientHeight).toFixed(1)}px`); }
    s.setProperty("--scan-op", scanOn ? Math.sin(Math.PI * wipe).toFixed(3) : "0");
    carRenderer.render(carScene, carCam);
    placeCallouts(callouts.map((_, i) => range(e, 0.78 + i * 0.018, 0.84 + i * 0.018)));
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    lenis?.raf(now);
    onScrollWork();
    updateTire(dt);
    updateDrive(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (forced) {
    $("loader").style.display = "none";
    const stage = document.getElementById(forced.id)?.querySelector(".intro-stage, .drive-stage");
    if (stage) {
      stage.style.cssText += ";position:fixed;inset:0;z-index:25";
      document.getElementById(forced.id).closest(".pw")?.style.setProperty("z-index", "20");
      sizeTire(); sizeCar();
    } else {
      const t = document.getElementById(forced.id);
      const pw = t?.closest(".pw");
      if (pw) setTimeout(() => scrollTo(0, pw.getBoundingClientRect().top + scrollY + innerHeight), 50);
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("in"));
    }
    if (forced.id === "atelier") startCarLoad();
  }

  let resizeTimer;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { sizeTire(); sizeCar(); }, 120); });
  window.__pp = { THREE, tire, tireCam, carState, carCam, lenis };
}

// Éclairage « studio auto » : longues boîtes à lumière, reflets propres sur la carrosserie.
function studioEnvironment(THREE) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 vP; void main(){ float y = vP.y; vec3 top = vec3(.26,.24,.30); vec3 hor = vec3(.80,.76,.86); vec3 bot = vec3(.08,.07,.10); vec3 c = y > 0. ? mix(hor, top, smoothstep(0., .9, y)) : mix(hor, bot, smoothstep(0., .35, -y)); gl_FragColor = vec4(c, 1.); }",
  }));
  s.add(dome);
  const strip = (x, y, z, w, h, k, tint = [1, 1, 0.96]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k * tint[0], k * tint[1], k * tint[2]), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  strip(-14, 18, 0, 3, 40, 6);
  strip(14, 18, 0, 3, 40, 6, [0.9, 0.8, 1.2]);
  strip(0, 26, -16, 30, 3, 3);
  strip(0, 30, 0, 3, 36, 2.6);
  return s;
}
