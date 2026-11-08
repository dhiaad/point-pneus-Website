// Voiture vue de dessus, qui se transforme en plan technique.
// Modèle : « Car Concept », Eric Chadwick, Darmstadt Graphics Group, CC BY 4.0 (crédit en pied de page).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const HIDDEN = /SteeringEmblem/i;          // logos de l'éditeur du modèle : retirés
const PLATE = /License Plate/i;

function plateTexture() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 224;
  const g = c.getContext("2d");
  g.fillStyle = "#f4f2ec"; g.fillRect(0, 0, 1024, 224);
  g.fillStyle = "#6d28d9"; g.fillRect(0, 0, 96, 224); g.fillRect(928, 0, 96, 224);
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

export async function loadCar(url, { variant = "Torched Graphite", onProgress } = {}) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url, (e) => onProgress?.(e.total ? e.loaded / e.total : 0));
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

// Plan technique : arêtes vives de chaque pièce, en traits fins.
// Les pièces qui correspondent à `glow` (les feux) sont tracées dans une couleur lumineuse, en additif.
export function buildBlueprint(model, { color = 0x2b2622, opacity = 0.8, threshold = 28, glow = null, glowColor = 0xb794ff } = {}) {
  const lines = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const glowMat = new THREE.LineBasicMaterial({ color: glowColor, transparent: true, opacity: 1, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  model.updateMatrixWorld(true);
  const meshes = [];
  model.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
  let i = 0;
  return new Promise((resolve) => {
    const step = () => {
      const until = performance.now() + 12;
      while (i < meshes.length && performance.now() < until) {
        const m = meshes[i++];
        const lit = glow && (glow.test(m.name) || glow.test(m.parent?.name || ""));
        const edges = new THREE.EdgesGeometry(m.geometry, lit ? 12 : threshold);
        const seg = new THREE.LineSegments(edges, lit ? glowMat : mat);
        if (lit) seg.renderOrder = 2;
        seg.matrixAutoUpdate = false;
        seg.matrix.copy(m.matrixWorld);
        lines.add(seg);
      }
      if (i < meshes.length) setTimeout(step, 0); else resolve({ lines, material: mat, glowMaterial: glowMat });
    };
    step();
  });
}
