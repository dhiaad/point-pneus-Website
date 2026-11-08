// Voiture vue de dessus, qui se transforme en plan technique.
// Modèle : « Car Concept », Eric Chadwick, Darmstadt Graphics Group, CC BY 4.0 (crédit en pied de page).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

const HIDDEN = /SteeringEmblem/i;          // logos de l'éditeur du modèle : retirés
const PLATE = /License Plate/i;

function plateTexture() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 224;
  const g = c.getContext("2d");
  g.fillStyle = "#f4f2ec"; g.fillRect(0, 0, 1024, 224);
  g.fillStyle = "#7a3cff"; g.fillRect(0, 0, 96, 224); g.fillRect(928, 0, 96, 224);
  g.fillStyle = "#111"; g.font = "800 150px Archivo, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  if ("fontStretch" in g) g.fontStretch = "semi-expanded";
  g.fillText("PP-066-CB", 512, 120);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  return t;
}

// Applique une variante de peinture (KHR_materials_variants).
async function applyVariant(gltf, name) {
  const ext = gltf.parser.json.extensions?.KHR_materials_variants;
  if (!ext) return;
  const index = ext.variants.findIndex((v) => v.name === name);
  if (index < 0) return;
  const jobs = [];
  gltf.scene.traverse((o) => {
    const mappings = o.userData?.gltfExtensions?.KHR_materials_variants?.mappings;
    if (!o.isMesh || !mappings) return;
    const m = mappings.find((mp) => mp.variants.includes(index));
    if (m) jobs.push(gltf.parser.getDependency("material", m.material).then((mat) => { o.material = mat; }));
  });
  await Promise.all(jobs);
}

export async function loadCar(source, { variant = "Torched Graphite", onProgress } = {}) {
  const loader = new GLTFLoader();
  const gltf = typeof source === "string" ? await loader.loadAsync(source, (e) => onProgress?.(e.total ? e.loaded / e.total : 0)) : await loader.parseAsync(source, "");
  await applyVariant(gltf, variant);

  const model = gltf.scene;
  const plate = plateTexture();
  model.traverse((o) => {
    // Roues avant braquées dans le modèle d'origine : on les remet droites.
    if (/^WheelFront[LR]$/.test(o.name)) o.rotation.set(-1.1, 0, 0);
    if (!o.isMesh) return;
    if (HIDDEN.test(o.name) || HIDDEN.test(o.parent?.name || "")) o.visible = false;
    if (PLATE.test(o.name) || PLATE.test(o.parent?.name || "")) {
      o.material = o.material.clone(); o.material.map = plate; o.material.emissiveMap = null; o.material.needsUpdate = true;
    }
  });

  // Centre la voiture, roues au sol (y = 0), avant vers -Z.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  const long = size.x > size.z ? "x" : "z";

  const car = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(model);
  // Dans le modèle, l'avant regarde vers +Z : demi-tour pour que le capot pointe vers -Z.
  pivot.rotation.y = long === "x" ? Math.PI / 2 : Math.PI;
  car.add(pivot);
  car.updateMatrixWorld(true);

  const length = Math.max(size.x, size.z), width = Math.min(size.x, size.z);
  return { car, model, gltf, length, width, height: size.y };
}

// Plan technique : arêtes vives de chaque pièce, fusionnées en très peu d'appels de dessin.
// `tiers` donne la hiérarchie du dessin : [{ test, opacity, width }]. Une largeur en pixels donne un vrai trait épais.
// `lights` : [{ test: /Headlight/i, color: 0xffffff }] — pièces tracées dans une couleur lumineuse, en additif.
export function buildBlueprint(model, { color = 0x2b2622, opacity = 0.8, width = 0, threshold = 28, lights = [], tiers = [], skip = null } = {}) {
  const lines = new THREE.Group();
  const makeMat = (o, w) => (w
    ? new LineMaterial({ color: o.color, linewidth: w, transparent: true, opacity: o.opacity, depthWrite: false, depthTest: o.depthTest ?? true, blending: o.blending ?? THREE.NormalBlending, toneMapped: false })
    : new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: o.opacity, depthWrite: false, depthTest: o.depthTest ?? true, blending: o.blending ?? THREE.NormalBlending, toneMapped: false }));
  const material = makeMat({ color, opacity }, width);
  const lightMaterials = lights.map((l) => makeMat({ color: l.color, opacity: 1, depthTest: false, blending: THREE.AdditiveBlending }, l.width || 0));
  const tierMaterials = tiers.map((t) => makeMat({ color: t.color ?? color, opacity: t.opacity }, t.width || 0));
  const all = [material, ...lightMaterials, ...tierMaterials];
  const buckets = all.map(() => []);
  const nameOf = (m) => (/^mesh_/.test(m.name) ? m.parent?.name || "" : m.name);
  model.updateMatrixWorld(true);
  const meshes = [];
  model.traverse((o) => { if (o.isMesh && o.visible && !(skip && skip.test(nameOf(o)))) meshes.push(o); });
  let i = 0;
  return new Promise((resolve) => {
    const step = () => {
      const until = performance.now() + 10;
      while (i < meshes.length && performance.now() < until) {
        const m = meshes[i++], name = nameOf(m);
        const k = lights.findIndex((l) => l.test.test(name));
        const t = k >= 0 ? -1 : tiers.findIndex((x) => x.test.test(name));
        const edges = new THREE.EdgesGeometry(m.geometry, k >= 0 ? 12 : t >= 0 ? tiers[t].threshold ?? threshold : threshold);
        edges.applyMatrix4(m.matrixWorld);
        buckets[k >= 0 ? k + 1 : t >= 0 ? t + 1 + lights.length : 0].push(edges);
      }
      if (i < meshes.length) { setTimeout(step, 0); return; }
      buckets.forEach((list, b) => {
        if (!list.length) return;
        const merged = mergeGeometries(list, false);
        list.forEach((g) => g.dispose());
        const mat = all[b];
        let seg;
        if (mat.isLineMaterial) {
          const g = new LineSegmentsGeometry().setPositions(merged.attributes.position.array);
          merged.dispose();
          seg = new LineSegments2(g, mat);
        } else seg = new THREE.LineSegments(merged, mat);
        if (b > 0 && b <= lights.length) seg.renderOrder = 2;
        seg.frustumCulled = false;
        lines.add(seg);
      });
      resolve({ lines, materials: all });
    };
    step();
  });
}

// Un filet de lumière posé sur la courbe de la caisse, avec un halo qui s'éteint sur les bords.
function lightRibbon(group, { y, z, half, bow, side, width, color, clip }) {
  const curve = (x) => z - bow * (x / half) * (x / half);
  const xIn = half * 0.42, xOut = half, N = 24, pos = [], col = [], index = [];
  for (let i = 0; i <= N; i++) {
    const x = side * (xIn + (xOut - xIn) * (i / N)), top = curve(x);
    const end = Math.min(1, Math.sin(Math.PI * (i / N)) * 5);
    pos.push(x, y, top - width, x, y, top, x, y, top + width);
    col.push(0, 0, 0, color[0] * end, color[1] * end, color[2] * end, 0, 0, 0);
    if (i < N) { const a = i * 3; index.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, clippingPlanes: clip || null }));
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  group.add(mesh);
}

// Les phares du plan : deux filets de lumière blanche.
export function createHeadBars({ y, z, half, clip }) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    lightRibbon(group, { y, z, half, bow: -0.16, side, width: 0.075, color: [0.4, 0.4, 0.4], clip });
    lightRibbon(group, { y, z, half, bow: -0.16, side, width: 0.016, color: [1, 1, 1], clip });
  }
  return group;
}

// L'arrière du plan : deux feux violets, et des traînées de lumière qui filent derrière la voiture.
export function createTailTrails({ y, z, half, bow = 0.09, length = 2.8, color = 0x7a3cff }) {
  const group = new THREE.Group();
  const curve = (x) => z - bow * (x / half) * (x / half);
  const xIn = half * 0.42, xOut = half;
  const brand = new THREE.Color(color), hot = new THREE.Color(0xb596ff);
  const uniforms = { uTime: { value: 0 }, uGrow: { value: 0 }, uLength: { value: length }, uColor: { value: brand }, uHot: { value: hot }, uFloor: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: `uniform float uGrow, uLength; varying vec2 vUv;
      void main() { vUv = uv; vec3 p = position; p.z += uLength * uGrow * uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uTime, uGrow, uFloor; uniform vec3 uColor, uHot; varying vec2 vUv;
      float lane(float u, float n, float seed) {
        float i = floor(u * n), f = fract(u * n);
        float s = fract(sin(i * 91.7 + seed) * 437.5);
        float mask = smoothstep(0.0, 0.3, f) * smoothstep(1.0, 0.7, f);
        float ph = fract(vUv.y * (0.9 + s * 0.7) - uTime * (0.34 + s * 0.26) + s * 7.0);
        return mask * smoothstep(0.0, 0.03, ph) * smoothstep(0.5, 0.05, ph);
      }
      void main() {
        float u = vUv.x, v = vUv.y;
        float rim = pow(abs(u * 2.0 - 1.0), 7.0);
        float fade = pow(1.0 - v, 1.5);
        float streak = lane(u, 7.0, 1.3) * 0.9 + lane(u, 13.0, 4.1) * 0.5;
        vec3 c = mix(uColor, uHot, clamp(streak * 0.55 + rim * 0.3, 0.0, 1.0));
        // La traînée s'éteint avant le bas de l'écran : plus de coupure nette sur la section suivante.
        float a = (0.46 + rim * 0.34 + streak * 0.42) * fade * min(1.0, uGrow * 1.6) * smoothstep(0.0, uFloor, gl_FragCoord.y);
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });

  const COLS = 10;
  for (const side of [-1, 1]) {
    const n = (COLS + 1) * 2, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), index = [];
    for (let i = 0; i <= COLS; i++) {
      const u = i / COLS, x = side * (xIn + (xOut - xIn) * u), top = curve(x);
      pos.set([x, y, top, x, y, top], i * 6);
      uv.set([u, 0, u, 1], i * 4);
      if (i < COLS) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false; mesh.renderOrder = 4;
    group.add(mesh);
    const lin = [brand.r, brand.g, brand.b];
    lightRibbon(group, { y, z, half, bow, side, width: 0.11, color: lin });
    lightRibbon(group, { y, z, half, bow, side, width: 0.024, color: [0.92, 0.84, 1] });
  }

  group.visible = false;
  return {
    group,
    get on() { return uniforms.uGrow.value > 0; },
    set(grow) { uniforms.uGrow.value = grow; group.visible = grow > 0; },
    tick(dt, canvasHeight) { uniforms.uTime.value += dt; if (canvasHeight) uniforms.uFloor.value = canvasHeight * 0.17; },
  };
}
