// Le pneu du hero : même modèle que la boutique, posé dans un vrai studio.
// Un cadre carré, fond transparent : le rendu 3D et l'image de secours ont exactement le même cadrage.
import * as THREE from "three";
import { buildTire } from "./tire.js?v=5";

function studio() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x030304);
  const box = (x, y, z, w, h, k, c = [1, 0.98, 0.95]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k * c[0], k * c[1], k * c[2]), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  box(0, 16, 5, 30, 7, 7);              // grande boîte au-dessus : le reflet satiné du haut du flanc
  box(-17, 2, 7, 3.5, 26, 11);          // bande à gauche : le liseré sur la bande de roulement
  box(15, 5, -8, 2.5, 24, 13);          // contre-jour à droite : détache le pneu du noir
  box(0, -14, 7, 18, 2, 1.1);           // débouché très faible sous le pneu
  box(-11, 7, 17, 15, 15, 1.5);         // grande source douce de face : fait lire le relief du flanc
  box(-9, -9, -11, 12, 1.6, 7, [0.48, 0.24, 1]); // une seule touche violette, en bas, derrière
  return s;
}

export const HERO_POSE = { x: 0.1, y: -0.68, z: 0 };
export const HERO_SPIN = 0.5;

export async function createHeroTire(canvas, { quality = 1, textureSize = 4096, dpr = 2, keep = false } = {}) {
  await document.fonts.load('800 100px "Archivo"').catch(() => {});
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: keep });
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.015).texture;
  const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 40);
  cam.position.set(0, 0, 6.5);

  const graze = new THREE.DirectionalLight(0xfff1e2, 1.6); graze.position.set(-5, 3.2, 1.2); scene.add(graze); // lumière rasante : fait sortir les sculptures
  const back = new THREE.SpotLight(0xdcd6ff, 70, 14, 0.8, 0.7); back.position.set(3.2, 2.8, -3.4); scene.add(back, back.target);

  const tire = buildTire({ quality, textureSize, paint: "#ffd21f" });
  const pivot = new THREE.Group(); pivot.add(tire); scene.add(pivot);
  pivot.rotation.set(HERO_POSE.x, HERO_POSE.y, HERO_POSE.z);

  const size = (px) => { renderer.setSize(px, px, false); };
  const render = (spin = 0, px = 0, py = 0) => {
    tire.rotation.z = spin;
    pivot.rotation.set(HERO_POSE.x + py, HERO_POSE.y + px, HERO_POSE.z);
    renderer.render(scene, cam);
  };
  return { renderer, scene, cam, tire, pivot, size, render };
}
