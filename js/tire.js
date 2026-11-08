// Pneu 205/55 R16 modélisé en vraie 3D : rainures en relief, flanc gravé, « POINT PNEUS » peint en blanc cassé.
// Unité : rayon extérieur = 1 (316 mm pour un 205/55 R16).
import * as THREE from "three";

const TAU = Math.PI * 2;
const TREAD_Z = 0.262;      // demi-largeur de la bande de roulement
const DEPTH = 0.026;        // profondeur des rainures (8 mm)
const PITCH = 64;           // nombre de motifs sur la circonférence
const BORE = 0.643;         // rayon du talon (jante 16 pouces)

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const cubic = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};
const band = (x, c, hw) => 1 - smooth(hw * 0.7, hw, Math.abs(x - c));

// Sculptures de la boutique : hiver, 4 saisons, sport, compétition, drift (le motif « touring » reste celui de l'accueil).
const slot = (ph, w) => { const f = ph - Math.floor(ph); return 1 - smooth(w * 0.7, w, Math.abs(f - 0.5)); };
const PATTERNS = {
  winter(theta, zn) {
    const a = Math.abs(zn), side = zn >= 0 ? 1 : -1, u = theta * PITCH / TAU;
    let g = Math.max(band(a, 0.2, 0.05), band(a, 0.58, 0.05));
    g = Math.max(g, slot(u + side * 0.35 * a, 0.09) * smooth(0.05, 0.12, a));           // blocs en chevrons
    g = Math.max(g, slot(u * 3 + side * 0.8 * a + 0.25, 0.035) * 0.75 * (1 - smooth(0.9, 0.98, a))); // lamelles fines
    return g;
  },
  allseason(theta, zn) {
    const a = Math.abs(zn), u = theta * PITCH / TAU;
    return Math.max(slot(u + 0.9 * a, 0.08) * smooth(0.06, 0.12, a), slot(u * 2 + 1.6 * a, 0.03) * 0.6 * smooth(0.2, 0.3, a));
  },
  sport(theta, zn) {
    const u = theta * PITCH / TAU;
    let g = Math.max(band(zn, 0.32, 0.065), band(zn, -0.06, 0.06), band(zn, -0.46, 0.055));
    if (zn > 0.62) g = Math.max(g, slot(u + 0.3 * zn, 0.07) * smooth(0.66, 0.74, zn));
    if (zn < -0.62) g = Math.max(g, slot(u * 0.5, 0.05) * smooth(0.7, 0.8, -zn));
    return g;
  },
  slick(theta, zn) {
    const u = theta * PITCH / TAU, a = Math.abs(zn);
    let g = Math.max(band(zn, 0.42, 0.035), band(zn, -0.42, 0.035));
    if (a > 0.8) g = Math.max(g, slot(u * 0.5, 0.05) * smooth(0.82, 0.9, a) * 0.8);
    return g;
  },
  drift(theta, zn) {
    const u = theta * PITCH / TAU, a = Math.abs(zn);
    let g = band(zn, 0, 0.04);
    if (a > 0.18 && a < 0.8) g = Math.max(g, slot(u * 0.5 + 0.7 * zn, 0.06) * smooth(0.18, 0.26, a) * (1 - smooth(0.72, 0.8, a)));
    return g;
  },
};

// Sculpture de la bande de roulement : 4 rainures longitudinales, épaules en lamelles, motif directionnel en V.
function treadDepth(theta, zn, pattern) {
  if (pattern && PATTERNS[pattern]) return PATTERNS[pattern](theta, zn);
  const a = Math.abs(zn);
  const side = zn >= 0 ? 1 : -1;
  let g = Math.max(band(a, 0.22, 0.06), band(a, 0.63, 0.055));
  if (a > 0.66) {
    const ph = theta * PITCH / TAU + side * 0.25 + 0.42 * Math.pow(a - 0.66, 1.3);
    const f = ph - Math.floor(ph);
    g = Math.max(g, (1 - smooth(0.075, 0.105, Math.abs(f - 0.5))) * smooth(0.66, 0.73, a));
  }
  if (a > 0.27 && a < 0.6) {
    const ph = theta * PITCH / TAU + side * 0.5 * (a - 0.27) / 0.33 + 0.5;
    const f = ph - Math.floor(ph);
    g = Math.max(g, (1 - smooth(0.05, 0.08, Math.abs(f - 0.5))) * smooth(0.33, 0.42, a) * 0.9);
  }
  return g;
}

// --- Profils (r, z), côté avant (z > 0) -------------------------------------------------
function treadHalf(n) {
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const zn = i / n;
    rows.push({ r: 1 - 0.012 * zn * zn, z: TREAD_Z * zn, zn, w: 1 });
  }
  return rows;
}
function shoulderHalf(n) {
  const P = [[0.988, 0.262], [0.990, 0.302], [0.962, 0.324], [0.925, 0.327]];
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const [r, z] = cubic(...P, t);
    rows.push({ r, z, zn: 1 + t * 0.55, w: 1 - smooth(0.3, 0.95, t) });
  }
  return rows;
}
function casingFront(q) {
  const segs = [
    { P: [[0.925, 0.327], [0.86, 0.339], [0.77, 0.334], [0.716, 0.305]], n: Math.round(70 * q) },
    { P: [[0.716, 0.305], [0.707, 0.323], [0.688, 0.323], [0.674, 0.293]], n: Math.round(16 * q) },
    { P: [[0.674, 0.293], [0.660, 0.273], [0.646, 0.252], [BORE, 0.214]], n: Math.round(16 * q) },
    { P: [[BORE, 0.214], [BORE, 0.15], [BORE, 0.07], [BORE, 0]], n: 4 },
  ];
  const rows = [];
  segs.forEach((s, k) => {
    for (let i = k === 0 ? 0 : 1; i <= s.n; i++) {
      const [r, z] = cubic(...s.P, i / s.n);
      rows.push({ r, z });
    }
  });
  let s = 0;
  rows.forEach((row, i) => { if (i) s += Math.hypot(row.r - rows[i - 1].r, row.z - rows[i - 1].z); row.s = s; });
  rows.forEach((row) => { row.v = 1 - row.s / s; });
  return { rows, length: s };
}

function profileNormals(rows, closedCenter) {
  return rows.map((row, i) => {
    const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)];
    let nr = b.z - a.z, nz = -(b.r - a.r);
    const len = Math.hypot(nr, nz) || 1; nr /= len; nz /= len;
    if (nr * (row.r - closedCenter) + nz * row.z < 0) { nr = -nr; nz = -nz; }
    return [nr, nz];
  });
}

// Grille de révolution : rows × (cols + 1), couture dupliquée puis normales moyennées.
function revolve(rows, cols, { displace, uv, colorOf, flipU = false }) {
  const R = rows.length, C = cols + 1;
  const pos = new Float32Array(R * C * 3), uvs = new Float32Array(R * C * 2);
  const col = colorOf ? new Float32Array(R * C * 3) : null;
  const normals2 = profileNormals(rows, 0.82);
  for (let i = 0; i < R; i++) {
    const row = rows[i], [nr, nz] = normals2[i];
    for (let j = 0; j < C; j++) {
      const theta = (j / cols) * TAU;
      const d = displace ? displace(theta, row) : 0;
      const r = row.r + nr * d, z = row.z + nz * d;
      const k = i * C + j;
      pos[k * 3] = r * Math.cos(theta); pos[k * 3 + 1] = r * Math.sin(theta); pos[k * 3 + 2] = z;
      const u = 1 - j / cols;
      uvs[k * 2] = flipU ? 1 - u : u; uvs[k * 2 + 1] = uv(row, i);
      if (col) { const c = colorOf(d); col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = c; }
    }
  }
  const index = new Uint32Array((R - 1) * cols * 6);
  let p = 0;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < cols; j++) {
    const a = i * C + j, b = a + 1, c = a + C, d = c + 1;
    index[p++] = a; index[p++] = c; index[p++] = b;
    index[p++] = b; index[p++] = c; index[p++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  // Normales sortantes, et couture invisible.
  let n = g.attributes.normal.array;
  const probe = Math.floor(R / 3);
  const [pr, pz] = normals2[probe];
  const k0 = probe * C + 1; // theta ≈ 0 : la normale radiale est sur x
  if (n[k0 * 3] * pr + n[k0 * 3 + 2] * pz < 0) {
    for (let k = 0; k < index.length; k += 3) { const t = index[k + 1]; index[k + 1] = index[k + 2]; index[k + 2] = t; }
    g.index.needsUpdate = true; g.computeVertexNormals();
    n = g.attributes.normal.array;
  }
  for (let i = 0; i < R; i++) {
    const a = i * C, b = i * C + cols;
    for (let k = 0; k < 3; k++) { const m = (n[a * 3 + k] + n[b * 3 + k]) / 2; n[a * 3 + k] = n[b * 3 + k] = m; }
  }
  g.attributes.normal.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// --- Textures du flanc --------------------------------------------------------------------
function sidewallTextures(casing, size, { paint: brandPaint = "#ece8df", dot = "#8a4dff", label = "205/55 R16 91V", line = "GUERIDO  ·  CABESTANY", brand = "POINT PNEUS" } = {}) {
  const W = size, H = size / 2;
  const make = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const bump = make(), color = make(), rough = make();
  const b = bump.getContext("2d"), c = color.getContext("2d"), r = rough.getContext("2d");
  const rows = casing.rows, L = casing.length;
  const yAtR = (rad) => {
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], z = rows[i];
      if ((a.r - rad) * (z.r - rad) <= 0) { const t = (rad - a.r) / (z.r - a.r || 1); return ((a.s + t * (z.s - a.s)) / L) * H; }
    }
    return H;
  };

  b.fillStyle = "rgb(128,128,128)"; b.fillRect(0, 0, W, H);
  c.fillStyle = "#141414"; c.fillRect(0, 0, W, H);
  c.fillStyle = "#0b0b0b"; c.fillRect(0, yAtR(0.69), W, H);
  r.fillStyle = "rgb(0,92,0)"; r.fillRect(0, 0, W, H);
  r.fillStyle = "rgb(0,240,0)"; r.fillRect(0, yAtR(0.69), W, H);

  // Grain du caoutchouc : légère variation, visible seulement en lumière rasante.
  const noise = b.getImageData(0, 0, W, H);
  for (let k = 0; k < noise.data.length; k += 4) {
    const v = 128 + (Math.random() - 0.5) * 6;
    noise.data[k] = noise.data[k + 1] = noise.data[k + 2] = v;
  }
  b.putImageData(noise, 0, 0);

  const ring = (rad, width, level, rough = null) => {
    const y = yAtR(rad);
    b.fillStyle = `rgb(${level},${level},${level})`; b.fillRect(0, y - width / 2, W, width);
    if (rough !== null) { r.fillStyle = `rgb(0,${rough},0)`; r.fillRect(0, y - width / 2, W, width); }
  };
  // Stries rayonnantes près de la jante (« sunburst »), comme sur un pneu moulé.
  const y1 = yAtR(0.742), y2 = yAtR(0.722);
  const serr = 900;
  for (let k = 0; k < serr; k++) {
    const x = (k / serr) * W;
    b.fillStyle = k % 2 ? "rgb(150,150,150)" : "rgb(112,112,112)";
    b.fillRect(x, y1, W / serr, y2 - y1);
  }
  r.fillStyle = "rgb(0,175,0)"; r.fillRect(0, y1, W, y2 - y1);
  ring(0.748, Math.max(2, H * 0.004), 168, 120);
  ring(0.902, Math.max(2, H * 0.004), 168, 120);
  ring(0.913, Math.max(1, H * 0.002), 150);

  const text = (str, u, rad, capH, { weight = 800, stretch = "expanded", paint = null, spacing = 0, emboss = 236 } = {}) => {
    const y = yAtR(rad);
    const pxPerUnitX = W / (TAU * rad), pxPerUnitY = H / L;
    const ratio = pxPerUnitY / pxPerUnitX;
    const fontPx = (capH * pxPerUnitX) / 0.72;
    const draw = (ctx, fill, blur) => {
      for (const dx of [0, -W, W]) {
        ctx.save();
        ctx.translate(u * W + dx, y);
        ctx.scale(1, ratio);
        ctx.font = `${weight} ${fontPx}px Archivo, Arial, sans-serif`;
        if ("fontStretch" in ctx) ctx.fontStretch = stretch;
        if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing * fontPx}px`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (blur) ctx.filter = `blur(${blur}px)`;
        ctx.fillStyle = fill;
        ctx.fillText(str, 0, 0);
        ctx.restore();
      }
    };
    draw(b, `rgb(${emboss - 40},${emboss - 40},${emboss - 40})`, Math.max(1.5, fontPx * 0.05));
    draw(b, `rgb(${emboss},${emboss},${emboss})`, Math.max(0.6, fontPx * 0.012));
    draw(r, paint ? "rgb(0,110,0)" : "rgb(0,170,0)", 0);
    if (paint) draw(c, paint, 0);
  };
  const yellow = brandPaint;
  text(brand, 0.75, 0.835, 0.074, { paint: yellow, spacing: 0.04 });
  text(brand, 0.25, 0.835, 0.074, { paint: yellow, spacing: 0.04 });
  text(line, 0.75, 0.772, 0.026, { weight: 700, spacing: 0.18 });
  text(line, 0.25, 0.772, 0.026, { weight: 700, spacing: 0.18 });
  text(label, 0.0, 0.83, 0.058, { weight: 800 });
  text(label, 0.5, 0.83, 0.058, { weight: 800 });
  text("TUBELESS   RADIAL", 0.585, 0.862, 0.024, { weight: 700, spacing: 0.12 });
  text("TUBELESS   RADIAL", 0.085, 0.862, 0.024, { weight: 700, spacing: 0.12 });
  text("M+S", 0.915, 0.84, 0.04, { weight: 800 });
  text("M+S", 0.415, 0.84, 0.04, { weight: 800 });
  text("DOT  4X2T  4526", 0.45, 0.78, 0.022, { weight: 700, spacing: 0.1 });
  text("DOT  4X2T  4526", 0.95, 0.78, 0.022, { weight: 700, spacing: 0.1 });
  text("MAX LOAD 615 KG", 0.1, 0.775, 0.02, { weight: 700, spacing: 0.12 });
  text("MAX LOAD 615 KG", 0.6, 0.775, 0.02, { weight: 700, spacing: 0.12 });
  for (let k = 0; k < 6; k++) text("▲ TWI", k / 6 + 1 / 12, 0.888, 0.016, { weight: 700, spacing: 0.08 });

  // Le point d'équilibrage : le repère peint qu'on trouve sur un vrai pneu, et le « point » de Point Pneus.
  if (dot) {
    const rad = 0.872, u = 0.355, y = yAtR(rad), px = W / (TAU * rad), py = H / L, R = 0.021 * px;
    c.save(); c.translate(u * W, y); c.scale(1, py / px); c.fillStyle = dot; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill(); c.restore();
    r.save(); r.translate(u * W, y); r.scale(1, py / px); r.fillStyle = "rgb(0,120,0)"; r.beginPath(); r.arc(0, 0, R, 0, TAU); r.fill(); r.restore();
  }

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { bump: tex(bump), color: tex(color, true), rough: tex(rough) };
}

// Lamelles fines de la bande de roulement (relief trop fin pour la géométrie).
function treadBumpTexture(size) {
  const W = size, H = size / 8;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = "rgb(128,128,128)"; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H);
  for (let k = 0; k < img.data.length; k += 4) { const v = 128 + (Math.random() - 0.5) * 10; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; }
  g.putImageData(img, 0, 0);
  // Petites lamelles dans le pain central
  g.strokeStyle = "rgb(70,70,70)"; g.lineWidth = Math.max(1.5, W / 2400);
  for (let k = 0; k < PITCH * 2; k++) {
    const x = (k / (PITCH * 2)) * W;
    g.beginPath(); g.moveTo(x, H * 0.47); g.lineTo(x + W / (PITCH * 6), H * 0.53); g.stroke();
  }
  // Évents de moulage (petits picots d'un pneu neuf)
  g.fillStyle = "rgb(200,200,200)";
  for (let k = 0; k < 900; k++) {
    g.beginPath(); g.arc(Math.random() * W, H * (0.1 + Math.random() * 0.8), Math.max(1, W / 3000), 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// La géométrie ne dépend que du dessin : un pneu du même type se construit presque instantanément.
const SHARED_GEO = new Map(), SHARED_BUMP = new Map();

export function buildTire({ quality = 1, textureSize = 4096, pattern = null, paint, dot, label, line, brand } = {}) {
  const q = quality;
  const cols = Math.round(2560 * q);
  const casingCols = Math.round(720 * q);

  const casing = casingFront(q);
  const geoKey = `${q}|${JSON.stringify(pattern)}`;
  if (!SHARED_GEO.has(geoKey)) {
    // Bande de roulement + épaules (les deux côtés)
    const half = [...treadHalf(Math.round(110 * q)), ...shoulderHalf(Math.round(28 * q))];
    const mirror = half.slice(1).map((p) => ({ ...p, z: -p.z, zn: -p.zn })).reverse();
    const bandRows = [...mirror, ...half];
    bandRows.forEach((row, i) => { row.v = i / (bandRows.length - 1); });
    const bandGeo = revolve(bandRows, cols, {
      displace: (theta, row) => -DEPTH * treadDepth(theta, row.zn, pattern) * row.w,
      uv: (row) => row.v,
      colorOf: (d) => 1 - 0.62 * (-d / DEPTH),
    });
    // Flancs
    const front = revolve(casing.rows, casingCols, { uv: (row) => row.v });
    const backRows = casing.rows.map((p) => ({ ...p, z: -p.z }));
    const back = revolve(backRows, casingCols, { uv: (row) => row.v, flipU: true });
    SHARED_GEO.set(geoKey, { bandGeo, front, back });
  }
  const { bandGeo, front, back } = SHARED_GEO.get(geoKey);

  const maps = sidewallTextures(casing, textureSize, { paint, dot, label, line, brand });
  const bumpSize = Math.min(4096, textureSize);
  if (!SHARED_BUMP.has(bumpSize)) SHARED_BUMP.set(bumpSize, treadBumpTexture(bumpSize));
  const treadBump = SHARED_BUMP.get(bumpSize);

  // Le caoutchouc est éclairé surtout par l'environnement : noir profond, reflets satinés.
  const rubber = { color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 1, side: THREE.DoubleSide };
  const sideMat = new THREE.MeshStandardMaterial({
    ...rubber, map: maps.color, roughnessMap: maps.rough, bumpMap: maps.bump, bumpScale: 2.6,
  });
  const backMat = sideMat.clone();
  const treadMat = new THREE.MeshStandardMaterial({
    ...rubber, side: THREE.FrontSide, color: 0x161616, roughness: 0.5, vertexColors: true, bumpMap: treadBump, bumpScale: 0.8,
  });

  const group = new THREE.Group();
  const bandMesh = new THREE.Mesh(bandGeo, treadMat);
  const frontMesh = new THREE.Mesh(front, sideMat);
  const backMesh = new THREE.Mesh(back, backMat);
  group.add(bandMesh, frontMesh, backMesh);
  group.userData.boreRadius = BORE;
  group.userData.dispose = () => {
    [sideMat, backMat, treadMat].forEach((m) => m.dispose());
    Object.values(maps).forEach((t) => t.dispose());
  };
  return group;
}
