// Point Pneus Guerido — accueil.
// Pneu de studio dans le hero, apparitions au défilement, voiture qui devient un plan.
import { initUI, setActiveNav } from "./ui.js?v=6";
import { initAtelier } from "./atelier.js?v=1";

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const range = (p, a, b) => clamp01((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mobile = false; // La 3D ne tourne qu'au-delà de 900 px : les téléphones ont les images fixes.
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const motion = root.classList.contains("motion");

initUI();
const atelier = initAtelier();
$("year").textContent = String(new Date().getFullYear());

/* ---------------- Titre du hero et apparitions ---------------- */
const heroTitle = $("hero-title");
(document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(() => heroTitle.classList.add("in")));
setTimeout(() => heroTitle.classList.add("in"), 300);

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px 6% 0px", threshold: 0 });
document.querySelectorAll("[data-reveal], [data-split]").forEach((el) => { if (el !== heroTitle) io.observe(el); });

/* ---------------- Rubrique active dans l'en-tête ---------------- */
const NAV_SECTIONS = ["services", "atelier", "garage", "contact"].map($);
let navKey = null;
// Une ligne à 40 % de la hauteur d'écran : aucun calcul pendant le défilement.
const navIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) navKey = e.target.id;
    else if (navKey === e.target.id) navKey = null;
  }
  setActiveNav(navKey);
}, { rootMargin: "-40% 0px -60% 0px" });
NAV_SECTIONS.forEach((s) => navIO.observe(s));
addEventListener("resize", () => setActiveNav(navKey));

/* ---------------- Barre fixe du téléphone : elle arrive quand les boutons du hero s'en vont ---------------- */
new IntersectionObserver(([e]) => $("dock").classList.toggle("on", !e.isIntersecting)).observe($("hero-cta"));

/* ---------------- Photo qui suit le service survolé ---------------- */
if (fine) document.querySelectorAll(".sv-block").forEach((block) => {
  const fig = block.querySelector(".sv-fig"), img = fig.querySelector("img");
  let current = img.getAttribute("src").match(/([\w-]+)\.webp/)[1], timer;
  const rows = [...block.querySelectorAll(".row[data-photo]")];
  // Toutes les photos sont prêtes avant le premier survol : le changement ne bloque jamais la page.
  const ready = [];
  const prepare = () => [...new Set(rows.map((a) => a.dataset.photo))].forEach((n) => { const i = new Image(); i.src = `assets/photos/${n}.webp`; i.decode?.().catch(() => {}); ready.push(i); });
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); prepare(); } }, { rootMargin: "60% 0px" }).observe(block);
  rows.forEach((a) => a.addEventListener("pointerenter", () => {
    clearTimeout(timer);
    // Une courte attente : balayer la liste à la souris ne déclenche pas une photo par ligne.
    timer = setTimeout(() => {
      if (a.dataset.photo === current) return;
      current = a.dataset.photo;
      img.classList.add("swap");
      setTimeout(() => { img.src = `assets/photos/${current}.webp`; img.classList.remove("swap"); }, 170);
    }, 110);
  }));
});

/* ---------------- La bande sponsor ne défile que lorsqu'elle est à l'écran ---------------- */
new IntersectionObserver(([e]) => $("tape").classList.toggle("run", e.isIntersecting), { rootMargin: "10% 0px" }).observe($("tape"));

/* ---------------- Liens internes ---------------- */
const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
const goTo = (y) => scrollTo({ top: y, behavior: instant ? "auto" : "smooth" });
let finishDrive = null;
function scrollToTarget(el) {
  if (!el) return;
  // Un lien vers l'atelier ou plus bas : on replie d'abord l'animation, la cible est alors à sa place définitive.
  const atelierEl = $("atelier");
  if (finishDrive && (el === atelierEl || (atelierEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))) finishDrive(false);
  if (el.id === "haut") return goTo(0);
  const top = el.getBoundingClientRect().top + scrollY;
  goTo(el.tagName === "SECTION" ? top : top - innerHeight * 0.3);
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
  if (card) setTimeout(() => { card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1900); }, 1300);
});

const heroStage = $("hero-stage");

if (motion) {
  // La page est lisible tout de suite ; la 3D s'installe ensuite, sans bloquer le titre.
  const boot = () => startMotion().catch((err) => { console.error(err); root.classList.remove("motion"); root.classList.add("static"); });
  const later = () => setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(boot, { timeout: 1500 }) : boot()), 500);
  if (document.readyState === "complete") later(); else addEventListener("load", later, { once: true });
}

/* ================= Animation 3D (grand écran) ================= */
async function startMotion() {
  const THREE = await import("three");

  const makeRenderer = (canvas, maxDpr) => {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    return r;
  };
  const tmp = new THREE.Vector3();

  // Aperçu figé d'un moment de l'animation : ?vue=atelier:0.6 (section:avancement), pour les captures.
  const vueParam = new URLSearchParams(location.search).get("vue");
  const forced = vueParam ? { id: vueParam.split(":")[0], p: Number(vueParam.split(":")[1] || 0) } : null;
  const sectionProgress = (el) => {
    if (forced) return forced.id === el.id ? { p: forced.p, visible: true, past: false } : { p: 0, visible: false, past: false };
    const r = el.getBoundingClientRect();
    const total = r.height - innerHeight;
    return { p: total > 0 ? clamp01(-r.top / total) : 0, visible: r.bottom > 0 && r.top < innerHeight, past: r.bottom <= 0 };
  };

  /* ----- Le pneu du hero ----- */
  const { createHeroTire, HERO_SPIN } = await import("./hero-tire.js?v=3");
  const hero = await createHeroTire($("gl-tire"), { dpr: Math.min(devicePixelRatio, 1.75), quality: 0.55, textureSize: 2048 });
  const sizeTire = () => hero.size(heroStage.clientWidth);
  sizeTire();
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  if (fine) addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });
  let spin = HERO_SPIN, lastScroll = scrollY;
  let tireClock = 0, tireSamples = 0, tireSpent = 0, tireLowered = false;
  function updateTire(dt) {
    const v = scrollY - lastScroll; lastScroll = scrollY;
    if (scrollY > innerHeight * 1.15) return;
    const dx = pointer.x - pointer.sx, dy = pointer.y - pointer.sy;
    pointer.sx += dx * 0.05; pointer.sy += dy * 0.05;
    spin -= dt * 0.05 + v * 0.0011;
    // Le pneu tourne lentement : au repos, 30 images par seconde suffisent et libèrent la carte graphique.
    tireClock += dt;
    if (v === 0 && Math.abs(dx) + Math.abs(dy) < 0.002 && dt > 0 && tireClock < 1 / 30) return;
    tireClock = 0;
    hero.render(spin, pointer.sx * 0.1, pointer.sy * 0.05);
    if (!tireLowered && dt > 0) {
      tireSamples++; tireSpent += dt;
      if (tireSamples >= 40) {
        if (tireSpent / tireSamples > 0.04) { tireLowered = true; hero.renderer.setPixelRatio(1); sizeTire(); hero.render(spin, pointer.sx * 0.1, pointer.sy * 0.05); }
        tireSamples = 0; tireSpent = 0;
      }
    }
  }
  updateTire(0);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("tire-live")));

  /* ----- La voiture violette ----- */
  const drive = $("atelier"), driveStage = $("drive-stage");
  const carRenderer = makeRenderer($("gl-car"), 1.5);
  carRenderer.localClippingEnabled = true;
  carRenderer.toneMapping = THREE.NeutralToneMapping;   // garde le violet des boutons, sans le délaver
  const carScene = new THREE.Scene();
  carScene.environment = new THREE.PMREMGenerator(carRenderer).fromScene(studioEnvironment(THREE), 0.02).texture;
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-4, 10, 3);
  carScene.add(sun);
  const carCam = new THREE.PerspectiveCamera(16, 1, 0.5, 200);
  carCam.up.set(0, 0, -1);
  const carState = { ready: false, car: null, model: null, length: 4.4, width: 2.3, lines: null, glows: [], anchors: [], lit: {}, trails: null };
  const layout = { m: 48, B: 230, g: 64, cx: 0, carW: 0, shift: 0, right: 0, single: false };
  const clipCar = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const clipPlan = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  let halfH = 3, dirty = true, placeDirty = true;

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
    // Composition finale : zones, plan, fiche de la prestation.
    layout.single = w < 1180;
    layout.m = Math.max(24, w * 0.04);
    layout.B = w < 1560 ? (w < 1180 ? 164 : 190) : 230;
    layout.g = w < 1180 ? 40 : 64;
    layout.carW = (carState.width / (2 * halfH * carCam.aspect)) * w;
    layout.cx = layout.m + layout.B + layout.g + layout.carW / 2;
    layout.shift = (layout.cx / w * 2 - 1) * halfH * carCam.aspect;
    layout.right = layout.cx + layout.carW / 2 + layout.g;
    const apLeft = layout.single ? layout.right : layout.right + layout.B + (w < 1560 ? 36 : 64);
    driveStage.style.setProperty("--ap-left", `${apLeft.toFixed(0)}px`);
    driveStage.style.setProperty("--co-w", `${layout.B}px`);
    driveStage.classList.toggle("compact", w < 1180 || h < 700);
    dirty = true; placeDirty = true;
  };
  sizeCar();

  const VIOLET = new THREE.Color(0xa47bff);
  const glowTexture = (mid = "200,170,255", out = "120,60,255") => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, `rgba(${mid},0.75)`); gr.addColorStop(1, `rgba(${out},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  };

  // Le téléchargement ne gêne pas la page ; le décodage, lui, attend qu'on approche de l'atelier.
  let carFile = null;
  const fetchCar = () => (carFile ||= fetch("assets/3d/car-concept.glb?v=2").then((r) => r.arrayBuffer()));
  // Les étapes lourdes attendent une pause dans le défilement : rien ne saute pendant qu'on lit la page.
  let lastMove = 0;
  addEventListener("scroll", () => { lastMove = performance.now(); }, { passive: true });
  const quiet = (max = 1500) => new Promise((done) => {
    const start = performance.now();
    const check = () => (performance.now() - lastMove > 200 || performance.now() - start > max ? setTimeout(done, 0) : setTimeout(check, 60));
    check();
  });
  const loadCarScene = async () => {
    const { loadCar, buildBlueprint, createTailTrails, createHeadBars } = await import("./car.js?v=9");
    const file = await fetchCar();
    await quiet();
    const res = await loadCar(file, { variant: "Pearly Swirly" });
    // La voiture prend le violet des boutons du site ; l'habitacle et les vitres s'effacent dans le noir.
    res.model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (/Paint/i.test(m.name)) {
          m.color.set(0x7a3cff); m.metalness = 0.5; m.roughness = 0.3;
          if ("clearcoat" in m) { m.clearcoat = 1; m.clearcoatRoughness = 0.05; }
          if ("iridescence" in m) m.iridescence = 0;
          if ("sheen" in m) m.sheen = 0;
          if ("specularIntensity" in m) { m.specularIntensity = 1; m.specularColor?.set(0xffffff); }
          m.envMapIntensity = 1.3;
        }
        if (/^Glass$/.test(m.name)) {
          // Pas de réfraction : elle oblige à redessiner toute la scène à chaque image.
          m.transmission = 0; m.transparent = true; m.opacity = 0.74; m.color.set(0x08070b); m.roughness = 0.03; m.metalness = 0; m.depthWrite = false; m.envMapIntensity = 1.5;
        }
        if (/Interior 3 Pearl/.test(m.name)) m.color.set(0x24222a);
        if (/^Mirror$/.test(m.name)) { m.color.set(0x1d1c21); m.metalness = 0.4; m.roughness = 0.2; }
        if (/^Rim2$/.test(m.name)) { m.color.set(0x77747f); m.roughness = 0.28; }
        if (/Dashboard/.test(m.name)) m.emissiveIntensity = 0;
        if (/Headlight/i.test(m.name)) { m.color.set(0xffffff); m.emissive?.set(0xffffff); m.emissiveIntensity = 1.6; }
        if (/Brakelight|Signallight/i.test(m.name)) { m.color.set(0x7a3cff); m.emissive?.set(0x7a3cff); m.emissiveIntensity = 2.4; }
        m.clippingPlanes = [clipCar];
        m.needsUpdate = true;
      });
      if (/WindshieldWipers/.test(o.name)) o.visible = false;
    });
    const bp = await buildBlueprint(res.model, { color: 0xf1ede5, opacity: 0.8, width: 1.25, threshold: 38,
      skip: /^Interior(?!SeatsColor|DashMid)|^Engine$|^Axles$|^BodyUnderside$|^BodyWindshieldWipers|^BodyHood(Interior|Under|Topgrill)|Handle|BrakePad|BrakeDisc|License_Plate/,
      tiers: [
        { test: /^Interior/, opacity: 0.2, threshold: 46 },
        { test: /^Wheel|Tire/, opacity: 0.42, threshold: 46 },
        { test: /Window|Windshield|Rearwindow/, opacity: 0.5, width: 1, threshold: 38 },
      ],
      lights: [
        { test: /Headlight|TurnsignalsFront/i, color: 0xffffff, width: 1 },
        { test: /Taillight|TurnsignalsRear/i, color: 0x9a6bff, width: 1 },
      ] });
    bp.materials.forEach((m) => { m.clippingPlanes = [clipPlan]; });
    res.car.add(bp.lines);

    // Chaque zone du plan peut s'allumer : une copie des pièces, en violet, au-dessus du dessin.
    const ZONE_PARTS = { pneus: /^Wheel(Front|Rear)[LR]$/, crevaison: /^WheelRearL$/, geometrie: /^WheelFront[LR]$/, freins: /^Wheel(Front|Rear)[LR]Brake(Disc|Pad)$/, phares: /^BodyHeadlights$/, moteur: /^Engine$/, clim: /^InteriorDash(Mid|Sides)$/ };
    res.model.updateMatrixWorld(true);
    const litRoot = new THREE.Group();
    res.car.add(litRoot);
    const litParts = [];
    res.model.traverse((o) => { if (o.isMesh && o.visible) litParts.push(o); });
    const addLit = (o) => {
      for (const [z, re] of Object.entries(ZONE_PARTS)) {
        let n = o, hit = false;
        while (n && n !== res.model) { if (re.test(n.name)) { hit = true; break; } n = n.parent; }
        if (!hit) continue;
        const zone = carState.lit[z] ??= (() => {
          const group = new THREE.Group(); group.visible = false; litRoot.add(group);
          return {
            level: 0, group,
            fill: new THREE.MeshBasicMaterial({ color: 0x7a3cff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [clipPlan] }),
            edge: new THREE.LineBasicMaterial({ color: 0xcdb6ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, clippingPlanes: [clipPlan] }),
          };
        })();
        const m = new THREE.Mesh(o.geometry, zone.fill); m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.renderOrder = 3;
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 34), zone.edge); e.matrixAutoUpdate = false; e.matrix.copy(o.matrixWorld); e.renderOrder = 4;
        zone.group.add(m, e);
      }
    };
    await new Promise((done) => {
      let i = 0;
      const slice = () => {
        const until = performance.now() + 8;
        while (i < litParts.length && performance.now() < until) addLit(litParts[i++]);
        if (i < litParts.length) setTimeout(slice, 0); else done();
      };
      slice();
    });
    // Ces pièces ne se voient jamais de dessus, même à travers les vitres : on ne les dessine plus.
    res.model.traverse((o) => {
      if (o.isMesh && /^Axles$|BrakePad|^InteriorPedal/.test(/^mesh_/.test(o.name) ? o.parent?.name || "" : o.name)) o.visible = false;
    });

    // Les feux du plan : phares d'un blanc franc, arrière violet et ses traînées.
    const box = new THREE.Box3();
    res.model.updateMatrixWorld(true);
    const nodeBox = (name) => { let n = null; res.model.traverse((o) => { if (!n && o.name === name) n = o; }); return n ? new THREE.Box3().setFromObject(n) : null; };
    const whiteTex = glowTexture("255,255,255", "255,255,255"), violetTex = glowTexture();
    const addSprite = (map, color, x, y, z, sx, sy, op) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, clippingPlanes: [clipPlan], toneMapped: false, opacity: op }));
      sp.position.set(x, y, z); sp.scale.set(sx, sy, 1); sp.userData.op = op; sp.renderOrder = 6;
      res.car.add(sp); carState.glows.push(sp);
    };
    const beamTexture = () => {
      const c = document.createElement("canvas"); c.width = 128; c.height = 256;
      const g = c.getContext("2d");
      const v = g.createLinearGradient(0, 256, 0, 0);
      v.addColorStop(0, "rgba(255,255,255,0.8)"); v.addColorStop(0.4, "rgba(255,255,255,0.24)"); v.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = v; g.fillRect(0, 0, 128, 256);
      g.globalCompositeOperation = "destination-in";
      const h = g.createLinearGradient(0, 0, 128, 0);
      h.addColorStop(0, "rgba(0,0,0,0)"); h.addColorStop(0.5, "rgba(0,0,0,1)"); h.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = h; g.fillRect(0, 0, 128, 256);
      return new THREE.CanvasTexture(c);
    };
    const head = nodeBox("BodyHeadlights");
    if (head) {
      const c = head.getCenter(new THREE.Vector3()), size = head.getSize(new THREE.Vector3());
      const beamMap = beamTexture();
      const y = c.y + 0.5;
      res.car.add(createHeadBars({ y, z: c.z - size.z * 0.1, half: size.x / 2, clip: [clipPlan] }));
      for (const sx of [-1, 1]) {
        const x = c.x + sx * size.x * 0.36;
        addSprite(whiteTex, 0xffffff, x, y, c.z - size.z * 0.1, 0.5, 0.5, 0.6);
        const len = 1.25, geo = new THREE.PlaneGeometry(0.42, len, 1, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setX(i, pos.getX(i) * 2.4);
        const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: beamMap, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, clippingPlanes: [clipPlan], toneMapped: false, opacity: 0.42 }));
        beam.rotation.x = -Math.PI / 2;
        beam.position.set(x + sx * 0.05, y, c.z - size.z * 0.1 - len / 2);
        beam.userData.op = 0.42; beam.renderOrder = 6;
        res.car.add(beam); carState.glows.push(beam);
      }
    }
    const tail = nodeBox("BodyTaillights");
    if (tail) {
      const c = tail.getCenter(new THREE.Vector3()), size = tail.getSize(new THREE.Vector3());
      const y = c.y + 0.3;
      for (const sx of [-1, 1]) addSprite(violetTex, 0x7a3cff, c.x + sx * size.x * 0.36, y, c.z - 0.02, 0.56, 0.56, 0.5);
      carState.trails = createTailTrails({ y, z: c.z + 0.02, half: size.x / 2 + 0.02, length: 3.2 });
      res.car.add(carState.trails.group);
    }

    // Points d'ancrage des services, dans le repère de la voiture
    const anchors = [];
    document.querySelectorAll("#callouts .co[data-anchor]").forEach((el, i) => {
      let node = null;
      res.model.traverse((o) => { if (!node && o.name === el.dataset.anchor) node = o; });
      if (!node) return;
      box.setFromObject(node);
      const c = box.getCenter(new THREE.Vector3());
      c.y = Math.max(c.y, 0.3);
      if (el.dataset.z === "phares") c.x += box.getSize(new THREE.Vector3()).x * 0.36;
      anchors.push({ el, i, local: c, hs: document.querySelector(`.hs[data-z="${el.dataset.z}"]`) });
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
    Object.assign(carState, { car: res.car, model: res.model, length: res.length, width: Math.min(res.width, 2.35), lines: bp.lines });
    sizeCar();
    await quiet();
    // Shaders, formes et textures partent vers la carte graphique avant que la voiture n'arrive : pas d'à-coup au premier passage.
    if (carRenderer.compileAsync) await carRenderer.compileAsync(carScene, carCam).catch(() => {});
    await quiet();
    const warm = new THREE.WebGLRenderTarget(32, 32);
    clipCar.constant = clipPlan.constant = 1e4;
    carState.glows.forEach((g) => { g.visible = true; });
    carState.lines.visible = true;
    carRenderer.setRenderTarget(warm);
    carRenderer.render(carScene, carCam);
    carRenderer.setRenderTarget(null);
    warm.dispose();
    clipCar.constant = clipPlan.constant = 0;
    carState.ready = true; dirty = true;
  };
  const startCarLoad = (() => { let started = false; return () => { if (started) return; started = true; loadCarScene().catch((e) => console.error("voiture", e)); }; })();
  // Tout se prépare pendant que le visiteur regarde le haut de page, pas pendant qu'il descend.
  if (!navigator.connection?.saveData) setTimeout(() => fetchCar().then(startCarLoad).catch(() => {}), 1800);
  const nearCar = new IntersectionObserver(([en]) => { if (en.isIntersecting) { nearCar.disconnect(); startCarLoad(); } }, { rootMargin: "200% 0px" });
  nearCar.observe(drive);

  // Légendes reliées aux pièces
  const callouts = [...document.querySelectorAll("#callouts .co")];
  const lineSvg = $("co-lines");
  const NS = "http://www.w3.org/2000/svg";
  const groups = callouts.map((el, i) => {
    const gEl = document.createElementNS(NS, "g");
    gEl.innerHTML = `<path class="ln"/>`;
    gEl.classList.toggle("on", el.dataset.z === atelier.current);
    lineSvg.appendChild(gEl);
    return gEl;
  });
  atelier.onChange((z) => { groups.forEach((g, i) => g.classList.toggle("on", callouts[i].dataset.z === z)); dirty = true; });
  atelier.onHot((z) => groups.forEach((g, i) => g.classList.toggle("hot", callouts[i].dataset.z === z)));

  function placeCallouts(op) {
    const w = driveStage.clientWidth, h = driveStage.clientHeight;
    const pos = carState.car.position;
    const cols = { l: [], r: [] };
    for (const a of carState.anchors) {
      tmp.copy(a.local).add(pos).project(carCam);
      a.x = (tmp.x + 1) / 2 * w; a.y = (1 - tmp.y) / 2 * h;
      const side = layout.single ? "l" : a.local.x < -0.15 ? "l" : a.local.x > 0.15 ? "r" : a.el.dataset.side;
      cols[side].push(a);
    }
    const { m, B, right } = layout;
    for (const side of ["l", "r"]) {
      const list = cols[side].sort((p, q) => p.y - q.y);
      if (!list.length) continue;
      const top = 160, bottom = h - 90;
      // Chaque libellé garde sa vraie hauteur : ceux qui passent sur deux lignes ne mordent plus sur le voisin.
      list.forEach((a) => { if (placeDirty || !a.h) a.h = a.el.offsetHeight; });
      const space = (p, q) => (p.h + q.h) / 2 + 10;
      list.forEach((a, k) => { a.ly = Math.max(a.y, k ? list[k - 1].ly + space(list[k - 1], a) : top); });
      for (let k = list.length - 1; k >= 0; k--) list[k].ly = Math.min(list[k].ly, k === list.length - 1 ? bottom : list[k + 1].ly - space(list[k], list[k + 1]));
      list.forEach((a) => {
        const lx = side === "l" ? m : right;
        a.el.style.left = `${lx}px`; a.el.style.top = `${a.ly}px`;
        const edge = side === "l" ? lx + B : lx;
        const knee = side === "l" ? edge + 22 : edge - 22;
        a.path = `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${knee.toFixed(1)} ${a.ly.toFixed(1)} L${edge.toFixed(1)} ${a.ly.toFixed(1)}`;
      });
    }
    carState.anchors.forEach((a) => {
      const gEl = groups[a.i], o = op[a.i], ln = gEl.querySelector(".ln");
      gEl.style.opacity = o.toFixed(3);
      ln.setAttribute("d", a.path);
      if (ln.getTotalLength) { const L = ln.getTotalLength(); ln.style.strokeDasharray = `${L}`; ln.style.strokeDashoffset = `${(L * (1 - o)).toFixed(1)}`; }
      a.el.style.setProperty("--o", o.toFixed(3));
      a.el.style.pointerEvents = o > 0.5 ? "auto" : "none";
      a.el.tabIndex = o > 0.5 ? 0 : -1;
      if (a.hs) { a.hs.style.left = `${a.x.toFixed(1)}px`; a.hs.style.top = `${a.y.toFixed(1)}px`; a.hs.style.setProperty("--o", o.toFixed(3)); a.hs.style.pointerEvents = o > 0.5 ? "auto" : "none"; }
    });
  }

  // Avancement lissé : la voiture glisse au lieu de suivre chaque cran de molette.
  let sp = 0, done = false, lastSp = -1, lastPlaced = -1, collapsed = false;
  let samples = 0, sampleTime = 0, lowered = false;

  // Une fois l'animation vue, la section reprend la hauteur d'un écran : remonter redevient immédiat.
  function collapseDrive(hold) {
    if (collapsed || forced) return;
    collapsed = true; done = true;
    const y = scrollY, top = drive.getBoundingClientRect().top + y;
    const total = drive.offsetHeight - innerHeight;
    const delta = Math.max(0, Math.min(y - top, total));
    root.classList.add("drive-done");
    scrollTo({ top: y - delta, behavior: "instant" });
    if (hold && delta > 0) {
      // L'élan de la molette ne doit pas emporter le visiteur au-delà du plan qui vient de s'ouvrir.
      const stop = (ev) => ev.preventDefault();
      addEventListener("wheel", stop, { passive: false });
      setTimeout(() => removeEventListener("wheel", stop), 380);
    }
    dirty = true;
  }
  finishDrive = collapseDrive;

  const scanEl = $("scan");
  let stageH = driveStage.clientHeight, lastScanOp = "";
  addEventListener("resize", () => { stageH = driveStage.clientHeight; });
  const applied = new Map();
  const setOp = (el, v) => { if (applied.get(el) !== v) { applied.set(el, v); el.style.opacity = v; } };
  const titleEl = $("drive-title"), subEl = driveStage.querySelector(".drive-sub"), headEl = driveStage.querySelector(".drive-head"), apEl = $("ap-panel");
  let flowClock = 0;

  function updateDrive(dt) {
    const { p, visible, past } = sectionProgress(drive);
    if (past && !collapsed) collapseDrive(false);
    if (!visible && !forced) return;
    startCarLoad();
    sp += (p - sp) * (1 - Math.exp(-dt * 13));
    if (Math.abs(p - sp) < 0.0004) sp = p;
    if (sp >= 0.96) done = true;
    if (done && !collapsed && sp >= 0.96) collapseDrive(true);
    const e = done ? 1 : sp;
    // La zone choisie monte en lumière, l'ancienne s'éteint.
    const planOn = range(e, 0.78, 0.88) > 0.5;
    for (const [z, zone] of Object.entries(carState.lit)) {
      const target = planOn && z === atelier.current ? 1 : 0;
      if (Math.abs(target - zone.level) > 0.004) { zone.level += (target - zone.level) * (1 - Math.exp(-dt * 11)); dirty = true; }
      else zone.level = target;
      zone.group.visible = zone.level > 0.01;
      zone.fill.opacity = zone.level * 0.3;
      zone.edge.opacity = zone.level;
    }
    // La traînée file en continu tant que le plan est à l'écran : 30 images par seconde suffisent.
    if (carState.trails?.on && !document.hidden) {
      flowClock += dt;
      if (flowClock >= 1 / 30) { carState.trails.tick(flowClock, carRenderer.domElement.height); flowClock = 0; dirty = true; }
    }
    if (Math.abs(e - lastSp) < 0.0002 && !dirty) return;
    const moved = Math.abs(e - lastSp) >= 0.0002;
    lastSp = e; dirty = false;

    const titleOp = (1 - range(e, 0.4, 0.5)).toFixed(3), coOp = range(e, 0.78, 0.88).toFixed(2);
    setOp(titleEl, titleOp); setOp(subEl, titleOp); setOp(headEl, coOp); setOp(apEl, coOp);
    const wipe = easeInOut(range(e, 0.46, 0.76));
    driveStage.classList.toggle("ap-on", planOn);
    if (!carState.ready) { carRenderer.clear(); return; }

    const L = carState.length, car = carState.car;
    const centerZ = mobile ? -halfH * 0.2 : 0;
    const enter = easeOut(range(e, 0, 0.32));
    car.position.z = lerp(halfH + L * 0.62, centerZ, enter);
    car.position.x = lerp(Math.sin(enter * Math.PI) * 0.18, layout.shift, easeInOut(range(e, 0.66, 0.86)));
    car.rotation.y = Math.sin(enter * Math.PI) * -0.05 * (1 - enter * 0.6);
    const zc = car.position.z + lerp(-L / 2 - 0.25, L / 2 + 0.25, wipe);
    clipCar.constant = -zc;
    clipPlan.constant = zc;
    carState.lines.visible = wipe > 0;
    carState.model.visible = wipe < 1;           // la voiture pleine n'est plus dessinée une fois le plan complet
    carState.glows.forEach((g) => { g.visible = wipe > 0; g.material.opacity = g.userData.op; });
    if (carState.trails) carState.trails.set(easeOut(range(e, 0.74, 0.92)));
    const scanOn = wipe > 0 && wipe < 1;
    if (scanOn) { tmp.set(0, 0, zc).project(carCam); scanEl.style.transform = `translateY(${((1 - tmp.y) / 2 * stageH).toFixed(1)}px)`; }
    const scanOp = scanOn ? Math.sin(Math.PI * wipe).toFixed(2) : "0";
    if (scanOp !== lastScanOp) { scanEl.style.opacity = scanOp; lastScanOp = scanOp; }
    carRenderer.render(carScene, carCam);
    // Si la machine peine pendant l'animation, on baisse la définition pour garder le mouvement.
    if (!lowered && moved && carState.ready) {
      samples++; sampleTime += dt;
      if (samples >= 24) {
        if (sampleTime / samples > 0.024) { lowered = true; carRenderer.setPixelRatio(1); sizeCar(); carRenderer.render(carScene, carCam); }
        samples = 0; sampleTime = 0;
      }
    }
    if (e >= 0.76 && (Math.abs(e - lastPlaced) > 0.0002 || placeDirty)) {
      placeCallouts(callouts.map((_, i) => range(e, 0.78 + i * 0.018, 0.84 + i * 0.018)));
      lastPlaced = e; placeDirty = false;
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    updateTire(dt);
    updateDrive(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (forced?.id === "atelier") {
    driveStage.style.cssText += ";position:fixed;inset:0;z-index:25";
    sizeCar(); startCarLoad();
  }

  let resizeTimer;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { sizeTire(); sizeCar(); }, 120); });
  window.__pp = { THREE, hero, carState, carCam, carRenderer, carScene, atelier };
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
