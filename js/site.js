// Point Pneus Guerido — version 2. Défilement, pneu 3D traversé, voiture qui devient un plan.
const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const range = (p, a, b) => clamp01((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mobile = matchMedia("(max-width: 760px)").matches || matchMedia("(pointer: coarse)").matches;
const motion = root.classList.contains("motion");

/* ---------- Ce qui marche partout (même sans 3D) ---------- */
$("year").textContent = String(new Date().getFullYear());

function parisNow() {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: get("weekday").replace(".", ""), h: Number(get("hour")), m: Number(get("minute")) };
}
function updateClock() {
  const { day, h, m } = parisNow();
  $("clock").textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const mins = h * 60 + m;
  const weekday = !["sam", "dim"].includes(day.toLowerCase());
  const open = weekday && ((mins >= 480 && mins < 720) || (mins >= 840 && mins < 1110));
  $("open-status").innerHTML = open ? '<span class="dot on"></span>Ouvert en ce moment' : '<span class="dot"></span>Fermé en ce moment';
}
updateClock();
setInterval(updateClock, 15000);

// Accordéon : un seul ouvert, la photo suit.
const acc = $("acc"), accImg = $("acc-img");
acc.querySelectorAll("details").forEach((d) => {
  d.addEventListener("toggle", () => {
    if (!d.open) return;
    acc.querySelectorAll("details").forEach((o) => { if (o !== d) o.open = false; });
    if (accImg.getAttribute("src") === d.dataset.img) return;
    accImg.classList.add("swap");
    const next = new Image();
    next.src = d.dataset.img;
    next.decode().catch(() => {}).finally(() => {
      accImg.src = d.dataset.img; accImg.alt = d.dataset.alt;
      requestAnimationFrame(() => accImg.classList.remove("swap"));
    });
  });
});

// Apparitions au défilement
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
}, { rootMargin: "0px 0px -12% 0px" });
document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

// En-tête clair ou sombre selon la section dessous
const hdr = $("hdr");
const toned = [...document.querySelectorAll("[data-tone]")];
let introLight = false;
function updateHeader() {
  let tone = "dark";
  for (const s of toned) {
    const r = s.getBoundingClientRect();
    if (r.top <= 32 && r.bottom > 32) { tone = s.dataset.tone; if (s.id === "intro" && introLight) tone = "light"; break; }
  }
  hdr.classList.toggle("on-light", tone === "light");
}

if (!motion) {
  root.classList.add("loaded");
  addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();
} else {
  startMotion().catch((err) => {
    console.error(err);
    root.classList.remove("motion"); root.classList.add("static", "loaded");
  });
}

/* ---------- Animation 3D ---------- */
async function startMotion() {
  const THREE = await import("three");
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const { buildTire } = await import("./tire.js");

  // Compteur du chargement
  let shown = 0, target = 0;
  const countEl = $("loader-count");
  const tick = () => { shown += (target - shown) * 0.18; countEl.textContent = String(Math.round(shown)); if (!root.classList.contains("loaded")) requestAnimationFrame(tick); };
  tick();

  // Défilement fluide
  const lenis = window.Lenis ? new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true }) : null;
  lenis?.stop();
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const el = id.length > 1 ? document.querySelector(id) : document.body;
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { duration: 1.6 }); else el.scrollIntoView({ behavior: "smooth" });
    });
  });

  const makeRenderer = (canvas) => {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    return r;
  };

  /* ----- Scène 1 : le pneu ----- */
  const intro = $("intro"), introStage = intro.querySelector(".intro-stage"), lightLayer = $("intro-light");
  const tireRenderer = makeRenderer($("gl-tire"));
  const tireScene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(tireRenderer);
  tireScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const tireCam = new THREE.PerspectiveCamera(30, 1, 0.01, 60);
  const rim = new THREE.SpotLight(0xffe6c8, 90, 14, 0.6, 0.6);
  rim.position.set(2.8, 2.6, -2.6);
  const keyLight = new THREE.DirectionalLight(0xfff3e4, 0.5);
  keyLight.position.set(-3, 3, 4);
  tireScene.add(rim, rim.target, keyLight);

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
  if (!mobile) addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  const sizeTire = () => {
    const w = introStage.clientWidth, h = introStage.clientHeight;
    tireRenderer.setSize(w, h, false);
    tireCam.aspect = w / h; tireCam.updateProjectionMatrix();
    const halfMin = Math.tan(THREE.MathUtils.degToRad(tireCam.fov / 2)) * Math.min(1, tireCam.aspect);
    d0 = (tireCam.aspect < 1 ? 1.22 : 1.56) / halfMin;
  };
  sizeTire();

  const sectionProgress = (el) => {
    const r = el.getBoundingClientRect();
    if (forced) return forced.id === el.id ? { p: forced.p, visible: true } : { p: 0, visible: false };
    const total = r.height - innerHeight;
    return { p: total > 0 ? clamp01(-r.top / total) : 0, visible: r.bottom > 0 && r.top < innerHeight };
  };
  // Aperçu figé d'un moment de l'animation : ?vue=tarifs:0.6 (section:avancement), pour les captures.
  const vueParam = new URLSearchParams(location.search).get("vue");
  const forced = vueParam ? { id: vueParam.split(":")[0], p: Number(vueParam.split(":")[1] || 0) } : null;

  const ring = Array.from({ length: 16 }, (_, i) => new THREE.Vector3(Math.cos((i / 16) * Math.PI * 2) * BORE * 0.99, Math.sin((i / 16) * Math.PI * 2) * BORE * 0.99, 0));
  const tmp = new THREE.Vector3();
  let spin = 0, lastScroll = scrollY;

  function updateTire(dt) {
    const { p, visible } = sectionProgress(intro);
    if (!visible) return false;
    const turn = easeInOut(range(p, 0, 0.5));
    pointer.sx += (pointer.x - pointer.sx) * 0.05; pointer.sy += (pointer.y - pointer.sy) * 0.05;
    const v = scrollY - lastScroll; lastScroll = scrollY;
    spin += dt * 0.12 + v * 0.0009;
    tire.rotation.set(lerp(0.14, 0, turn) + pointer.sy * 0.08 * (1 - turn), lerp(-0.62, 0, turn) + pointer.sx * 0.12 * (1 - turn), 0);
    tire.rotateZ(spin);
    const t = range(p, 0.08, 0.92);
    const z = -0.5 + (d0 + 0.5) * Math.pow(1 - t, 1.7);
    tireCam.position.set(0, 0, z);
    tireCam.lookAt(0, 0, z - 1);
    tire.visible = z > 0.06;

    // Le décor clair n'est visible qu'à travers le pneu.
    const w = introStage.clientWidth, h = introStage.clientHeight;
    if (!tire.visible) {
      lightLayer.style.clipPath = "none";
    } else {
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
    lightLayer.style.setProperty("--mark-scale", lerp(0.5, 1.25, easeOut(range(p, 0.1, 0.95))).toFixed(3));
    introLight = z < 0.25;
    if (tire.visible) tireRenderer.render(tireScene, tireCam);
    else tireRenderer.clear();
    return true;
  }

  updateTire(0);
  target = 100;
  await new Promise((r) => setTimeout(r, 450));
  countEl.textContent = "100";
  root.classList.add("loaded");
  lenis?.start();

  /* ----- Scène 2 : la voiture ----- */
  const drive = $("tarifs"), driveStage = $("drive-stage"), scan = $("scan");
  const carRenderer = makeRenderer($("gl-car"));
  carRenderer.localClippingEnabled = true;
  const carScene = new THREE.Scene();
  carScene.environment = new THREE.PMREMGenerator(carRenderer).fromScene(studioEnvironment(THREE), 0.02).texture;
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.2);
  sun.position.set(-4, 10, 3);
  carScene.add(sun);
  const carCam = new THREE.PerspectiveCamera(16, 1, 0.5, 200);
  carCam.up.set(0, 0, -1);
  const carState = { ready: false, car: null, length: 4.4, width: 2.3, lines: null, pbr: [], shadow: null };
  const clipCar = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const clipPlan = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  let halfH = 3;

  const sizeCar = () => {
    const w = driveStage.clientWidth, h = driveStage.clientHeight;
    carRenderer.setSize(w, h, false);
    carCam.aspect = w / h; carCam.updateProjectionMatrix();
    const fill = carCam.aspect < 1 ? 0.5 : 0.72;
    const byLength = carState.length / fill / 2;
    const byWidth = carState.width / (carCam.aspect < 1 ? 0.7 : 0.5) / 2 / carCam.aspect;
    halfH = Math.max(byLength, byWidth);
    const d = halfH / Math.tan(THREE.MathUtils.degToRad(carCam.fov / 2));
    carCam.position.set(0, d, 0);
    carCam.lookAt(0, 0, 0);
  };
  sizeCar();

  const loadCarScene = async () => {
    const { loadCar, buildBlueprint } = await import("./car.js");
    const res = await loadCar("assets/3d/car-concept.glb", { variant: "Pearly Swirly" });
    res.model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (/Paint/i.test(m.name)) {
          m.color.set(0x34363a); m.metalness = 0.6; m.roughness = 0.36;
          if ("clearcoat" in m) { m.clearcoat = 1; m.clearcoatRoughness = 0.05; }
          if ("iridescence" in m) m.iridescence = 0;
        }
        m.clippingPlanes = [clipCar];
        m.needsUpdate = true;
      });
    });
    const bp = await buildBlueprint(res.model, { color: 0x2b2622, opacity: 0.62, threshold: 34 });
    bp.material.clippingPlanes = [clipPlan];
    res.car.add(bp.lines);

    // Ombre de contact douce
    const sc = document.createElement("canvas"); sc.width = 256; sc.height = 512;
    const g = sc.getContext("2d");
    g.filter = "blur(22px)"; g.fillStyle = "rgba(0,0,0,0.85)";
    g.beginPath(); g.roundRect?.(46, 40, 164, 432, 70); if (!g.roundRect) g.rect(46, 40, 164, 432); g.fill();
    const shadowTex = new THREE.CanvasTexture(sc);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(res.width * 1.25, res.length * 1.16),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false, clippingPlanes: [clipCar] }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.004;
    res.car.add(shadow);

    carScene.add(res.car);
    Object.assign(carState, { ready: true, car: res.car, length: res.length, width: Math.min(res.width, 2.35), lines: bp.lines, shadow });
    sizeCar();
  };
  const startCarLoad = (() => { let started = false; return () => { if (started) return; started = true; loadCarScene().catch((e) => console.error("voiture", e)); }; })();
  setTimeout(startCarLoad, mobile ? 2500 : 900);

  function updateDrive() {
    const { p, visible } = sectionProgress(drive);
    if (!visible) return false;
    if (sectionProgress(intro).p > 0.5) startCarLoad();
    const s = driveStage.style;
    s.setProperty("--title-op", (1 - range(p, 0.3, 0.4)).toFixed(3));
    s.setProperty("--title-spread", easeIn(range(p, 0.26, 0.42)).toFixed(3));
    const specsIn = range(p, 0.36, 0.46);
    s.setProperty("--specs-op", (mobile ? specsIn * (1 - range(p, 0.6, 0.66)) : specsIn).toFixed(3));
    s.setProperty("--decode-op", range(p, mobile ? 0.68 : 0.72, mobile ? 0.76 : 0.84).toFixed(3));
    if (!carState.ready) { carRenderer.clear(); return true; }

    const L = carState.length;
    const centerZ = mobile ? -halfH * 0.3 : 0;
    const enter = easeOut(range(p, 0, 0.32));
    const startZ = halfH + L * 0.62;
    carState.car.position.z = lerp(startZ, centerZ, enter);
    const wipe = easeInOut(range(p, 0.5, 0.82));
    const zc = carState.car.position.z + lerp(-L / 2 - 0.2, L / 2 + 0.2, wipe);
    clipCar.constant = -zc;
    clipPlan.constant = zc;
    carState.lines.visible = wipe > 0;
    const scanOn = wipe > 0 && wipe < 1;
    if (scanOn) {
      tmp.set(0, 0, zc).project(carCam);
      s.setProperty("--scan-y", `${((1 - tmp.y) / 2 * driveStage.clientHeight).toFixed(1)}px`);
    }
    s.setProperty("--scan-op", scanOn ? Math.sin(Math.PI * wipe).toFixed(3) : "0");
    carRenderer.render(carScene, carCam);
    return true;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    lenis?.raf(now);
    updateTire(dt);
    updateDrive();
    updateHeader();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (forced) {
    $("loader").style.display = "none";
    const stage = document.getElementById(forced.id)?.querySelector(".intro-stage, .drive-stage");
    if (stage) { stage.style.cssText += ";position:fixed;inset:0;z-index:25"; sizeTire(); sizeCar(); }
    else {
      // Section ordinaire : on masque ce qui la précède pour qu'elle soit en haut de l'écran.
      const target = document.getElementById(forced.id);
      for (const el of document.querySelectorAll("main > section")) { if (el === target) break; el.style.display = "none"; }
      if (target?.tagName === "FOOTER") document.querySelector("main").style.display = "none";
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("in"));
    }
    if (forced.id === "tarifs") startCarLoad();
  }

  let resizeTimer;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { sizeTire(); sizeCar(); }, 120); });
  window.__pp = { THREE, tire, tireCam, carState, carCam, lenis };
}

// Éclairage « studio auto » : longues boîtes à lumière sur les côtés, reflets propres sur la carrosserie.
function studioEnvironment(THREE) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 vP; void main(){ float y = vP.y; vec3 top = vec3(.30,.29,.27); vec3 hor = vec3(.86,.83,.78); vec3 bot = vec3(.10,.09,.08); vec3 c = y > 0. ? mix(hor, top, smoothstep(0., .9, y)) : mix(hor, bot, smoothstep(0., .35, -y)); gl_FragColor = vec4(c, 1.); }",
  }));
  s.add(dome);
  const strip = (x, y, z, w, h, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.96), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  strip(-14, 18, 0, 3, 40, 6);
  strip(14, 18, 0, 3, 40, 6);
  strip(0, 26, -16, 30, 3, 3);
  strip(0, 30, 0, 3, 36, 2.6);
  return s;
}
