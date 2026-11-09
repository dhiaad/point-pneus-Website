// Qamar (« lune » en arabe) : le gérant écrit aux développeurs du site et suit ses demandes.
import { shrinkImage, readAsDataURL } from "./image-file.js?v=1";

const { api, isDemo } = window.BookingAPI;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KINDS = { demande: "Demande", amelioration: "Amélioration", probleme: "Problème" };
const PRIORITIES = { basse: "Basse", normale: "Normale", haute: "Haute", urgente: "Urgente" };
const STATUS = { recue: "Reçue", en_cours: "En cours", terminee: "Terminée" };
const dateFr = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });
const MAX_FILE = 8 * 1024 * 1024, MAX_PDF = 1024 * 1024;

// La phase de la lune dit où en est la demande : fine au départ, pleine quand c'est terminé.
const PHASE = {
  recue: '<circle cx="9" cy="9" r="7" class="m-b"/><path d="M9 2a7 7 0 0 1 0 14a10 10 0 0 0 0-14Z" class="m-f"/>',
  en_cours: '<circle cx="9" cy="9" r="7" class="m-b"/><path d="M9 2a7 7 0 0 1 0 14Z" class="m-f"/>',
  terminee: '<circle cx="9" cy="9" r="7" class="m-f"/>',
};

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

/* ---------------- La lune ---------------- */
function paintMoon(c) {
  const S = 680, R = S / 2 - 3, g = c.getContext("2d"), rnd = rng(1407);
  c.width = c.height = S;
  const at = (u) => S / 2 + u * R;
  g.save();
  g.beginPath(); g.arc(S / 2, S / 2, R, 0, Math.PI * 2); g.clip();
  const base = g.createRadialGradient(S * 0.46, S * 0.44, 0, S / 2, S / 2, R);
  base.addColorStop(0, "#fffbee"); base.addColorStop(0.7, "#f3ecdb"); base.addColorStop(1, "#ddd5c4");
  g.fillStyle = base; g.fillRect(0, 0, S, S);

  const blob = (x, y, r, color, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${color},${a})`); gr.addColorStop(0.62, `rgba(${color},${a * 0.72})`); gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  // Les mers de la face visible, à leur place : Pluies, Sérénité, Tranquillité, Crises, Fécondité, Nectar, Tempêtes, Humeurs, Nuées.
  const MARIA = [[-0.3, -0.42, 0.33], [0.2, -0.42, 0.19], [0.34, -0.17, 0.23], [0.72, -0.3, 0.12], [0.62, 0.03, 0.15], [0.42, 0.25, 0.09], [-0.62, -0.16, 0.32], [-0.68, 0.16, 0.22], [-0.5, 0.43, 0.12], [-0.18, 0.44, 0.2], [-0.3, 0.16, 0.15], [0, -0.1, 0.1]];
  const seas = document.createElement("canvas"); seas.width = seas.height = S;
  const sg = seas.getContext("2d");
  sg.fillStyle = "#6f6a78";
  for (const [x, y, r] of MARIA) {
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 0.7) * r;
      sg.beginPath(); sg.arc(at(x + Math.cos(a) * d), at(y + Math.sin(a) * d), (0.02 + rnd() * r * 0.26) * R, 0, Math.PI * 2); sg.fill();
    }
  }
  // Deux passages en tout petit puis en grand : les bords des mers deviennent flous sans filtre, sur tous les navigateurs.
  const shrink = (src, size) => { const c2 = document.createElement("canvas"); c2.width = c2.height = size; const x = c2.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, size, size); return c2; };
  const soft = shrink(shrink(shrink(shrink(seas, Math.round(S / 22)), Math.round(S / 10)), Math.round(S / 4)), Math.round(S / 2));
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.globalAlpha = 0.62; g.drawImage(soft, 0, 0, S, S);
  g.globalAlpha = 1;
  // Grain des hauts plateaux
  for (let i = 0; i < 2600; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R, r = 0.5 + rnd() * 1.5;
    g.fillStyle = rnd() > 0.5 ? `rgba(255,252,240,${0.05 + rnd() * 0.16})` : `rgba(118,112,120,${0.04 + rnd() * 0.1})`;
    g.beginPath(); g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
  }
  // Cratères, éclairés de face par le soleil
  const crater = (x, y, r) => {
    blob(x, y, r * 1.5, "255,251,236", 0.2);
    g.strokeStyle = "rgba(110,104,116,.2)"; g.lineWidth = Math.max(0.7, r * 0.16);
    g.beginPath(); g.arc(x, y, r, 0.6, 3.5); g.stroke();
    g.strokeStyle = "rgba(255,252,240,.62)";
    g.beginPath(); g.arc(x, y, r, 3.7, 6.7); g.stroke();
  };
  for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.96; crater(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1.6 + rnd() * rnd() * 11); }
  // Tycho, Copernic et Kepler : leurs rayons clairs
  const rays = (u, v, len, n, a0) => {
    const x = at(u), y = at(v);
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3, l = len * (0.45 + rnd() * 0.75);
      const gr = g.createLinearGradient(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
      gr.addColorStop(0, `rgba(255,252,240,${a0})`); gr.addColorStop(1, "rgba(255,252,240,0)");
      g.strokeStyle = gr; g.lineWidth = 1.5 + rnd() * 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    crater(x, y, Math.max(5, len * 0.045));
    blob(x, y, len * 0.13, "255,252,240", 0.8);
  };
  rays(-0.12, 0.7, R * 0.95, 15, 0.42);
  rays(-0.33, -0.08, R * 0.34, 12, 0.34);
  rays(-0.6, -0.1, R * 0.2, 10, 0.3);
  // Le bord s'assombrit à peine
  const limb = g.createRadialGradient(S / 2, S / 2, R * 0.72, S / 2, S / 2, R);
  limb.addColorStop(0, "rgba(74,66,92,0)"); limb.addColorStop(1, "rgba(74,66,92,.36)");
  g.fillStyle = limb; g.fillRect(0, 0, S, S);
  g.restore();
}

/* ---------------- Étoiles et nuages ---------------- */
function paintStars(c) {
  const W = 1800, H = 760, g = c.getContext("2d"), rnd = rng(3301);
  c.width = W; c.height = H;
  for (let i = 0; i < 620; i++) {
    const r = rnd() < 0.08 ? 1.3 : 0.4 + rnd() * 0.65, y = rnd() * H;
    g.fillStyle = `rgba(${rnd() > 0.7 ? "214,204,255" : "255,250,240"},${(0.2 + rnd() * 0.7) * (1 - (y / H) * 0.6)})`;
    g.beginPath(); g.arc(rnd() * W, y, r, 0, Math.PI * 2); g.fill();
  }
}
function paintClouds(c, { count, seed, alpha, color }) {
  const W = 1500, H = 400, g = c.getContext("2d"), rnd = rng(seed);
  c.width = W; c.height = H;
  const puff = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${color},${a})`); gr.addColorStop(0.55, `rgba(${color},${a * 0.45})`); gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  for (let k = 0; k < count; k++) {
    const cx = (W / count) * (k + rnd() * 0.7), cy = H * (0.3 + rnd() * 0.42), span = 190 + rnd() * 250;
    for (let i = 0; i < 74; i++) {
      const u = rnd() + rnd() - 1, core = 1 - Math.abs(u);
      const x = cx + u * span, y = cy + (rnd() - 0.56) * 76 * (0.3 + core), r = (20 + rnd() * 62) * (0.45 + core * 0.8);
      const a = alpha * (0.55 + (y < cy ? 0.45 : 0));
      for (const dx of [-W, 0, W]) puff(x + dx, y, r, a);
    }
  }
}
function cloudLayer(el, opts) {
  const [a, b] = el.querySelectorAll("canvas");
  paintClouds(a, opts);
  b.width = a.width; b.height = a.height;
  b.getContext("2d").drawImage(a, 0, 0);
}

/* ---------------- Montagnes ---------------- */
function ridge(points, k, seed) {
  const rnd = rng(seed);
  let pts = points;
  for (let n = 0; n < 6; n++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay);
      next.push(pts[i], [(ax + bx) / 2 + (rnd() - 0.5) * len * 0.12, (ay + by) / 2 + (rnd() - 0.5) * len * k]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
}
function paintLand() {
  const FAR = [[0, 172], [220, 112], [420, 176], [640, 82], [860, 166], [1080, 62], [1280, 152], [1460, 98], [1600, 162]];
  const MID = [[0, 262], [180, 202], [380, 262], [560, 178], [760, 258], [960, 170], [1140, 252], [1340, 190], [1600, 262]];
  const NEAR = [[0, 372], [150, 342], [320, 382], [500, 340], [610, 318], [664, 301], [742, 301], [800, 332], [980, 366], [1180, 334], [1360, 374], [1600, 340]];
  [["q-far", FAR, 0.22, 11], ["q-mid", MID, 0.24, 29], ["q-near", NEAR, 0.16, 53]].forEach(([id, pts, k, seed]) => {
    const line = ridge(pts, k, seed);
    $(id).setAttribute("d", `${line}L1600 420L0 420Z`);
    const rim = $(`${id}-rim`);
    if (rim) rim.setAttribute("d", line);
  });
}

function buildScene() {
  paintStars($("q-stars"));
  paintMoon($("q-moon"));
  cloudLayer($("q-cl-back"), { count: 4, seed: 91, alpha: 0.08, color: "132,122,178" });
  cloudLayer($("q-cl-front"), { count: 3, seed: 517, alpha: 0.11, color: "176,166,214" });
  paintLand();
  const rnd = rng(77);
  $("q-twinkle").innerHTML = Array.from({ length: 16 }, () => `<i style="left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 55).toFixed(1)}%;animation-delay:${(-rnd() * 7).toFixed(1)}s;animation-duration:${(4 + rnd() * 5).toFixed(1)}s"></i>`).join("");
}

/* ---------------- Formulaire ---------------- */
let attachment = null, built = false, freshId = null;
function showAttachment() {
  const box = $("q-file-view");
  box.hidden = !attachment;
  $("q-drop").hidden = Boolean(attachment);
  if (!attachment) return;
  box.querySelector("[data-name]").textContent = attachment.name;
  const img = box.querySelector("img");
  img.hidden = !attachment.type.startsWith("image/");
  if (!img.hidden) img.src = attachment.data;
}
async function takeFile(file) {
  const err = $("q-err");
  err.hidden = true;
  if (!file) return;
  const isImg = file.type.startsWith("image/"), isPdf = file.type === "application/pdf";
  const fail = (m) => { err.textContent = m; err.hidden = false; };
  if (!isImg && !isPdf) return fail("Joignez une image ou un PDF.");
  if (file.size > MAX_FILE) return fail("Ce fichier dépasse 8 Mo.");
  if (isPdf && file.size > MAX_PDF) return fail("Ce PDF dépasse 1 Mo. Une capture d'écran fera l'affaire.");
  try {
    attachment = isImg ? { name: file.name, type: "image/webp", data: await shrinkImage(file, { max: 1400, quality: 0.8 }) }
      : { name: file.name, type: file.type, data: await readAsDataURL(file) };
    showAttachment();
  } catch (x) { fail("Ce fichier n'a pas pu être lu."); }
}
async function submit(e) {
  e.preventDefault();
  const f = e.target, err = $("q-err"), desc = f.elements.description.value.trim();
  err.hidden = true;
  $("q-ok").hidden = true;
  if (desc.length < 8) { err.textContent = "Décrivez ce que vous voulez en quelques mots."; err.hidden = false; f.elements.description.focus(); return; }
  const btn = $("q-send");
  btn.disabled = true; btn.textContent = "Envoi…";
  try {
    const row = await api.qamarCreate({ kind: f.elements.kind.value, priority: f.elements.priority.value, page: f.elements.page.value, description: desc, attachment });
    freshId = row?.id ?? null;
    f.reset(); attachment = null; showAttachment();
    $("q-ok").textContent = isDemo ? "Demande ajoutée au suivi, dans ce navigateur." : "Demande envoyée aux développeurs.";
    $("q-ok").hidden = false;
    await refresh();
  } catch (x) {
    err.textContent = x?.code === "storage_full" ? "Plus de place dans ce navigateur : retirez le fichier joint." : "La demande n'est pas partie. Réessayez.";
    err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = "Envoyer la demande";
  }
}

/* ---------------- Suivi ---------------- */
function itemHtml(r) {
  const long = r.description.length > 150;
  const a = r.attachment;
  const file = !a ? "" : a.type?.startsWith("image/")
    ? `<button class="q-thumb" type="button" data-zoom aria-label="Agrandir ${esc(a.name)}"><img src="${esc(a.data)}" alt="" loading="lazy"></button>`
    : `<a class="q-pdf" href="${esc(a.data)}" download="${esc(a.name)}">${esc(a.name)}</a>`;
  return `<li class="q-item${r.id === freshId ? " fresh" : ""}">
    <div class="q-item-top"><span class="q-st st-${esc(r.status)}"><svg viewBox="0 0 18 18" aria-hidden="true">${PHASE[r.status] || PHASE.recue}</svg>${esc(STATUS[r.status] || r.status)}</span><time datetime="${esc(r.created_at)}">${esc(dateFr.format(new Date(r.created_at)))}</time></div>
    <p class="q-item-t">${esc(KINDS[r.kind] || r.kind)} · ${esc(r.page)}</p>
    <p class="q-item-d${long ? " clamp" : ""}">${esc(r.description)}</p>
    ${long ? '<button class="q-more" type="button" data-more aria-expanded="false">Lire la suite</button>' : ""}
    <div class="q-item-foot"><span class="q-pri p-${esc(r.priority)}">Priorité ${esc((PRIORITIES[r.priority] || r.priority).toLowerCase())}</span>${file}</div>
  </li>`;
}
async function refresh() {
  const list = await api.qamarList().catch(() => null);
  if (!list) { $("q-list").innerHTML = '<li class="q-empty">Le suivi ne se charge pas. Réessayez dans un instant.</li>'; return; }
  const open = list.filter((r) => r.status !== "terminee").length;
  $("q-count").textContent = list.length ? `${open} en cours sur ${list.length}` : "";
  $("q-list").innerHTML = list.length ? list.map(itemHtml).join("") : '<li class="q-empty">Aucune demande pour l\'instant. La première apparaîtra ici dès son envoi.</li>';
}

function build() {
  built = true;
  buildScene();
  $("q-demo").hidden = !isDemo;
  $("q-form").addEventListener("submit", submit);
  $("q-file").addEventListener("change", (e) => { takeFile(e.target.files[0]); e.target.value = ""; });
  $("q-file-rm").addEventListener("click", () => { attachment = null; showAttachment(); });
  const drop = $("q-drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => takeFile(e.dataTransfer.files[0]));
  $("q-list").addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) {
      const d = more.previousElementSibling, open = d.classList.toggle("clamp");
      more.textContent = open ? "Lire la suite" : "Réduire";
      more.setAttribute("aria-expanded", String(!open));
      return;
    }
    const zoom = e.target.closest("[data-zoom]");
    if (zoom) zoom.classList.toggle("big");
  });
}

export function openQamar() {
  if (!built) build();
  refresh();
}
