// Boutique pneus : le défilé 3D, la collection, le panier (réservation, paiement au garage).
import { initUI, makeSheet, openSheet, parseSize } from "./ui.js";
import { CATEGORIES, PRODUCTS, catOf, priceLabel } from "./catalogue.js";

initUI();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = document.documentElement;
const mobile = matchMedia("(max-width: 760px)").matches;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const reduce = root.classList.contains("reduce");
$("year").textContent = String(new Date().getFullYear());

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
};
const byId = new Map(PRODUCTS.map((p) => [p.id, p]));
const TIRE_SVG = '<svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="90" fill="#141317" stroke="#2c2a31" stroke-width="6"/><circle cx="100" cy="100" r="90" fill="none" stroke="#1d1b21" stroke-width="12" stroke-dasharray="4 6"/><circle cx="100" cy="100" r="56" fill="#0b0a0d" stroke="#2c2a31" stroke-width="3"/></svg>';
const thumbs = new Map();
const imgFor = (p) => (thumbs.has(p.id) ? `<img src="${thumbs.get(p.id)}" alt="" width="400" height="300">` : TIRE_SVG);

/* ---------------- Taille recherchée ---------------- */
let prefSize = null;
{
  const q = parseSize(new URLSearchParams(location.search).get("taille") || "");
  const saved = (() => { try { return sessionStorage.getItem("pp-size"); } catch (e) { return null; } })();
  prefSize = q ? q.short : saved;
  if (prefSize) { $("size-in").value = prefSize; showSizeMsg(); }
}
function showSizeMsg() {
  const m = $("size-msg");
  m.classList.add("ok");
  m.innerHTML = `Taille enregistrée : <b>${esc(prefSize)}</b>. Elle sera notée dans votre panier, le garage confirme le prix exact.`;
}
$("size-box").addEventListener("submit", (e) => {
  e.preventDefault();
  const s = parseSize($("size-in").value);
  if (!s) { $("size-msg").classList.remove("ok"); $("size-msg").innerHTML = 'Format attendu : 205/55 R16. <button class="link-arrow" type="button" data-open="reader">Lire son pneu</button>'; return; }
  prefSize = s.short;
  try { sessionStorage.setItem("pp-size", prefSize); } catch (x) { /* rien */ }
  $("size-in").value = prefSize;
  showSizeMsg();
  const cart = store.get("pp-cart", []);
  cart.forEach((it) => { if (!it.sizeEdited) it.size = prefSize; });
  store.set("pp-cart", cart); updateCount();
});

/* ---------------- Filtres ---------------- */
let filter = "all", list = PRODUCTS.slice(), index = 0;
const FILTERS = [{ id: "all", label: "Tout", accent: "#f4f1eb" }, ...CATEGORIES];
function renderFilters() {
  const html = FILTERS.map((c) => `<button class="chip" type="button" data-f="${c.id}" aria-pressed="${c.id === filter}" style="--c:${c.accent}"><i></i>${esc(c.label)}</button>`).join("");
  $("rw-filters").innerHTML = html;
  $("coll-filters").innerHTML = html;
}
function setFilter(f) {
  filter = f;
  list = f === "all" ? PRODUCTS.slice() : PRODUCTS.filter((p) => p.cat === f);
  renderFilters(); renderList(); renderGrid();
  show(0, 1, true);
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) setFilter(b.dataset.f); });

/* ---------------- Le défilé ---------------- */
const runway = $("runway"), info = $("rw-info");
function renderList() {
  $("rw-list").innerHTML = list.map((p, i) => `<li><button type="button" data-i="${i}" class="${i === index ? "on" : ""}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="nm">${esc(p.brand)} ${esc(p.model)}</span><span class="pr">${priceLabel(p.price)}</span></button></li>`).join("");
}
$("rw-list").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { const i = Number(b.dataset.i); show(i, i >= index ? 1 : -1); restartTimer(); } });

let swapTimer;
function show(i, dir = 1, instant = false) {
  if (!list.length) return;
  index = (i + list.length) % list.length;
  const p = list[index], c = catOf(p);
  runway.style.setProperty("--accent", c.accent);
  $("rw-count").textContent = `${String(index + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`;
  $("rw-list").querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === index));
  $("rw-list").querySelector(".on")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const ghost = $("rw-ghost");
  const apply = () => {
    $("rw-cat").textContent = `Collection ${c.label}`;
    $("rw-brand").textContent = p.brand;
    $("rw-model").textContent = p.model;
    $("rw-size").textContent = p.size;
    $("rw-desc").textContent = p.desc;
    $("rw-tags").innerHTML = ["Montage inclus", ...p.tags].map((t) => `<li>${esc(t)}</li>`).join("");
    $("rw-price").textContent = priceLabel(p.price);
    $("rw-unit").textContent = `${p.unit || "le pneu"} · prix indicatif`;
    const s = parseSize(prefSize || p.size);
    $("rw-rdv").href = `reserver.html?prestation=pneus${s ? `&taille=${encodeURIComponent(s.short)}` : ""}&saison=${encodeURIComponent(c.season)}&qte=${qty()}`;
    $("rw-qty").hidden = Boolean(p.unit);
    ghost.textContent = c.label;
    info.classList.remove("out"); ghost.classList.remove("swap");
  };
  clearTimeout(swapTimer); clearTimeout(warmTimer);
  if (instant) { apply(); stage?.present(p, dir); }
  else {
    // le texte sort d'abord, le pneu se construit, puis le texte revient pendant que le pneu roule au centre
    info.classList.add("out"); ghost.classList.add("swap");
    swapTimer = setTimeout(() => { stage?.present(p, dir); swapTimer = setTimeout(apply, 420); }, 90);
  }
  // on prépare le pneu suivant pendant que celui-ci est à l'arrêt
  warmTimer = setTimeout(() => stage?.warm(list[(index + 1) % list.length]), 2200);
}
let warmTimer;
const qty = () => Number(document.querySelector('input[name="rw-qty"]:checked')?.value || 4);
$("rw-prev").addEventListener("click", () => { show(index - 1, -1); restartTimer(); });
$("rw-next").addEventListener("click", () => { show(index + 1, 1); restartTimer(); });
$("rw-add").addEventListener("click", () => addToCart(list[index], list[index].unit ? 1 : qty()));
document.querySelectorAll('input[name="rw-qty"]').forEach((r) => r.addEventListener("change", () => show(index, 0, true)));
addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]") || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const r = runway.getBoundingClientRect();
  if (r.bottom < innerHeight * 0.4) return;
  if (e.key === "ArrowRight") { show(index + 1, 1); restartTimer(); }
  if (e.key === "ArrowLeft") { show(index - 1, -1); restartTimer(); }
});

// Défilement automatique, avec barre de progression
const DURATION = 6500;
let playing = !reduce, t0 = performance.now(), hold = false;
const bar = $("rw-progress");
function restartTimer() { t0 = performance.now(); }
function setPlaying(v) {
  playing = v; runway.classList.toggle("paused", !v);
  $("rw-play").setAttribute("aria-label", v ? "Mettre le défilé en pause" : "Reprendre le défilé");
  restartTimer();
}
$("rw-play").addEventListener("click", () => setPlaying(!playing));
info.addEventListener("pointerenter", () => { hold = true; });
info.addEventListener("pointerleave", () => { hold = false; restartTimer(); });
info.addEventListener("focusin", () => { hold = true; });
info.addEventListener("focusout", () => { hold = false; });
setPlaying(playing);
(function loop(now) {
  const visible = runway.getBoundingClientRect().bottom > innerHeight * 0.3 && !document.hidden && !document.querySelector("dialog[open]");
  if (!playing || hold || !visible) { t0 = now - Math.min(now - t0, DURATION * 0.98) ; if (!playing) bar.style.transform = "scaleX(0)"; }
  else {
    const k = (now - t0) / DURATION;
    bar.style.transform = `scaleX(${Math.min(1, k).toFixed(4)})`;
    if (k >= 1) { show(index + 1, 1); t0 = now; }
  }
  requestAnimationFrame(loop);
})(performance.now());

/* ---------------- La collection ---------------- */
function renderGrid() {
  $("coll-grid").innerHTML = list.map((p, i) => {
    const c = catOf(p);
    return `<article class="pc" style="--accent:${c.accent};animation-delay:${Math.min(i, 8) * 40}ms" data-id="${p.id}">
      <button class="pc-img" type="button" data-show="${i}" aria-label="Voir ${esc(p.brand)} ${esc(p.model)} sur le podium">${imgFor(p)}<span class="pc-cat"><i></i>${esc(c.label)}</span></button>
      <div class="pc-body">
        <p class="pc-brand">${esc(p.brand)}</p>
        <h3 class="pc-model">${esc(p.model)}</h3>
        <p class="pc-size">${esc(p.size)}</p>
        <div class="pc-foot"><p class="pc-price">${priceLabel(p.price)}<small>${esc(p.unit || "le pneu, posé")}</small></p>
        <button class="pc-add" type="button" data-add="${p.id}" aria-label="Ajouter ${esc(p.brand)} ${esc(p.model)} au panier">+</button></div>
      </div></article>`;
  }).join("");
  if (fine) tiltCards();
}
function tiltCards() {
  document.querySelectorAll(".pc").forEach((c) => {
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(2)}deg`);
      c.style.setProperty("--rx", `${((0.5 - (e.clientY - r.top) / r.height) * 6).toFixed(2)}deg`);
    });
    c.addEventListener("pointerleave", () => { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
  });
}
$("coll-grid").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    const p = byId.get(add.dataset.add);
    addToCart(p, p.unit ? 1 : 4);
    add.classList.add("added"); add.textContent = "✓";
    setTimeout(() => { add.classList.remove("added"); add.textContent = "+"; }, 1400);
    return;
  }
  const sh = e.target.closest("[data-show]");
  if (sh) { show(Number(sh.dataset.show), 1); restartTimer(); runway.scrollIntoView({ behavior: "smooth" }); }
});

/* ---------------- Panier ---------------- */
function updateCount() {
  const n = store.get("pp-cart", []).reduce((t, it) => t + it.qty, 0);
  const el = $("cart-count");
  el.hidden = !n; el.textContent = String(n);
}
let toastTimer;
function toast(html) {
  const t = $("toast");
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
}
$("toast").addEventListener("click", (e) => { if (e.target.closest("[data-cart]")) { $("toast").classList.remove("show"); openCart(); } });
function addToCart(p, n) {
  const cart = store.get("pp-cart", []);
  const it = cart.find((x) => x.id === p.id);
  if (it) it.qty = Math.min(8, it.qty + n);
  else cart.push({ id: p.id, qty: n, size: p.unit ? p.size : prefSize || p.size });
  store.set("pp-cart", cart);
  updateCount();
  toast(`<span>Ajouté : ${n} × ${esc(p.model)}</span><button type="button" data-cart>Voir le panier</button>`);
}
updateCount();

let mode = "pose", ordered = null;
function cartSheet() { return makeSheet("cart-sheet", "Votre panier", "Boutique pneus"); }
function openCart() { ordered = null; renderCart(); openSheet(cartSheet()); }
$("cart-open").addEventListener("click", openCart);

function renderCart(error = "") {
  const body = cartSheet().querySelector(".sheet-body");
  if (ordered) { body.innerHTML = ordered; return; }
  const cart = store.get("pp-cart", []).filter((it) => byId.has(it.id));
  if (!cart.length) {
    body.innerHTML = `<div class="cart-empty"><p>Votre panier est vide.</p><button class="btn btn-light btn-arrow" type="button" data-close>Voir la collection</button></div>`;
    return;
  }
  const total = cart.reduce((t, it) => t + byId.get(it.id).price * it.qty, 0);
  const saved = store.get("pp-customer", {});
  body.innerHTML = `
    <div class="ci-list">${cart.map((it, k) => {
      const p = byId.get(it.id), c = catOf(p);
      return `<div class="ci" style="--accent:${c.accent}">
        <span class="ci-img">${imgFor(p)}</span>
        <div class="ci-main"><strong>${esc(p.brand)} ${esc(p.model)}</strong><span>${esc(c.label)} · ${priceLabel(p.price)} ${esc(p.unit || "le pneu")}</span>
          ${p.unit ? "" : `<label class="ci-size"><span>Taille</span><input value="${esc(it.size)}" data-size="${k}" aria-label="Taille pour ${esc(p.model)}"></label>`}</div>
        <div class="ci-side"><span class="ci-price">${priceLabel(p.price * it.qty)}</span>
          <span class="step"><button type="button" data-q="${k}" data-d="-1" aria-label="Un de moins">−</button><output>${it.qty}</output><button type="button" data-q="${k}" data-d="1" aria-label="Un de plus">+</button></span>
          <button class="ci-x" type="button" data-rm="${k}">Retirer</button></div>
      </div>`;
    }).join("")}</div>
    <div class="cart-opt"><fieldset><legend>Comment on procède ?</legend>
      <label class="opt"><input type="radio" name="mode" value="pose"${mode === "pose" ? " checked" : ""}><span><strong>Pose au garage, avec rendez-vous</strong><span>Montage, équilibrage et valves inclus. Vous choisissez le créneau juste après.</span></span><b>Inclus</b></label>
      <label class="opt"><input type="radio" name="mode" value="retrait"${mode === "retrait" ? " checked" : ""}><span><strong>Retrait au comptoir</strong><span>On vous prévient dès que vos pneus sont prêts.</span></span><b></b></label>
    </fieldset></div>
    <div class="cart-sum"><p><span>Pneus</span><span>${priceLabel(total)}</span></p><p><span>Montage, équilibrage, valves</span><span>${mode === "pose" ? "Inclus" : "–"}</span></p>
      <p class="tot"><span>Total indicatif</span><span>${priceLabel(total)}</span></p><small>Rien à payer en ligne. Le garage confirme le prix dans votre taille, puis vous payez sur place, en 3 ou 4 fois sans frais si vous voulez.</small></div>
    <form class="cart-form" id="cart-form" novalidate>
      <div class="field-row">
        <label class="field">Nom<input name="name" autocomplete="name" required value="${esc(saved.name || "")}"></label>
        <label class="field">Téléphone<input name="phone" type="tel" autocomplete="tel" required value="${esc(saved.phone || "")}"></label>
      </div>
      <label class="field">Plaque ou message <small>(facultatif)</small><textarea name="note" placeholder="AB-123-CD, ou une précision pour le garage"></textarea></label>
      ${error ? `<p class="form-err">${esc(error)}</p>` : ""}
      <button class="btn btn-light btn-arrow" type="submit">Réserver mes pneus</button>
      ${window.BookingAPI?.isDemo ? '<p class="demo-note">Démo : la commande reste dans ce navigateur. Elle apparaît dans l\'espace gérant.</p>' : ""}
    </form>`;
}

document.addEventListener("click", (e) => {
  const sheet = e.target.closest("#cart-sheet");
  if (!sheet) return;
  const cart = store.get("pp-cart", []);
  const q = e.target.closest("[data-q]"), rm = e.target.closest("[data-rm]");
  if (q) { const it = cart[Number(q.dataset.q)]; it.qty = Math.max(1, Math.min(8, it.qty + Number(q.dataset.d))); }
  else if (rm) cart.splice(Number(rm.dataset.rm), 1);
  else return;
  store.set("pp-cart", cart); updateCount(); renderCart();
});
document.addEventListener("change", (e) => {
  if (e.target.name === "mode" && e.target.closest("#cart-sheet")) { mode = e.target.value; renderCart(); }
  const sz = e.target.closest("[data-size]");
  if (sz) { const cart = store.get("pp-cart", []); const it = cart[Number(sz.dataset.size)]; const s = parseSize(sz.value); it.size = s ? s.label : sz.value.trim(); it.sizeEdited = true; store.set("pp-cart", cart); }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "cart-form") return;
  e.preventDefault();
  const f = e.target, name = f.name.value.trim(), phone = f.phone.value.trim(), note = f.note.value.trim();
  if (name.length < 2) return renderCartKeep(f, "Indiquez votre nom.");
  if (phone.replace(/\D/g, "").length < 10) return renderCartKeep(f, "Indiquez un numéro de téléphone complet, pour qu'on puisse vous rappeler.");
  store.set("pp-customer", { name, phone });
  const cart = store.get("pp-cart", []).filter((it) => byId.has(it.id));
  const total = cart.reduce((t, it) => t + byId.get(it.id).price * it.qty, 0);
  const btn = f.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = "Envoi…";
  const details = {
    type: "Commande boutique",
    articles: cart.map((it) => { const p = byId.get(it.id); return `${it.qty} × ${p.brand} ${p.model} (${it.size})`; }).join(" ; "),
    pose: mode === "pose" ? "Pose au garage avec rendez-vous" : "Retrait au comptoir",
    total: `${total} € (indicatif)`,
  };
  if (note) details.message = note;
  try {
    await window.BookingAPI.api.createQuote({ kind: "pneus", details, name, phone });
  } catch (x) {
    return renderCartKeep(f, "La commande n'a pas pu partir. Réessayez, ou appelez le 04 68 50 50 68.");
  }
  const first = byId.get(cart[0].id), c = catOf(first), s = parseSize(cart[0].size);
  const n = cart[0].qty >= 4 ? 4 : cart[0].qty >= 2 ? 2 : 1;
  const rdv = `reserver.html?prestation=pneus${s ? `&taille=${encodeURIComponent(s.short)}` : ""}&saison=${encodeURIComponent(c.season)}&qte=${n}`;
  ordered = `<div class="cart-done"><p class="eyebrow tag">C'est noté</p><p class="big">Merci ${esc(name.split(/\s+/)[0])}, vos pneus sont réservés.</p>
    <p>Le garage vous rappelle au ${esc(phone)} pour confirmer le prix exact et la disponibilité. Rien n'a été payé.</p>
    <div class="sheet-actions">${mode === "pose" ? `<a class="btn btn-light btn-arrow" href="${rdv}">Choisir mon créneau de pose</a>` : ""}<button class="btn btn-ghost" type="button" data-close>Continuer</button></div></div>`;
  store.set("pp-cart", []); updateCount(); renderCart();
});
function renderCartKeep(f, msg) {
  const keep = { name: f.name.value, phone: f.phone.value, note: f.note.value };
  store.set("pp-customer", { name: keep.name, phone: keep.phone });
  renderCart(msg);
  const nf = $("cart-form"); if (nf) nf.note.value = keep.note;
}

/* ---------------- Le podium 3D ---------------- */
let stage = null;
renderFilters(); renderList(); renderGrid(); show(0, 1, true);
if (root.classList.contains("gl")) {
  initStage().then((s) => { stage = s; stage.present(list[index], 0); }).catch((e) => { console.error(e); root.classList.replace("gl", "nogl"); });
}

async function initStage() {
  const THREE = await import("three");
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const { buildTire } = await import("./tire.js?v=3");
  await document.fonts.load('800 100px "Archivo"').catch(() => {});

  const canvas = $("gl-shop");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.6 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const key = new THREE.DirectionalLight(0xfff3e4, 0.7); key.position.set(-3, 4, 5);
  const rimL = new THREE.SpotLight(0xffffff, 120, 16, 0.7, 0.6); rimL.position.set(3.4, 2.4, -3);
  const top = new THREE.SpotLight(0xffffff, 60, 16, 0.5, 0.8); top.position.set(0, 6, 1.5);
  scene.add(key, rimL, rimL.target, top, top.target);

  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max(1.2 / (half * 0.8), 1.25 / (half * cam.aspect * 0.8));
    cam.position.set(0, 0.35, mobile ? d * 0.92 : d);
    cam.lookAt(0, mobile ? 0 : -0.05, 0);
  };
  size();
  addEventListener("resize", size);

  const cache = new Map();
  const keyOf = (p) => p.id;
  const build = (p, q = mobile ? 0.45 : 0.72, tex = mobile ? 1024 : 2048) => {
    const c = catOf(p);
    return buildTire({ quality: q, textureSize: tex, pattern: c.pattern, paint: c.paint, brand: p.brand.toUpperCase(), label: p.size.toUpperCase(), line: p.model.toUpperCase() });
  };
  const get = (p) => {
    if (cache.has(keyOf(p))) { const g = cache.get(keyOf(p)); cache.delete(keyOf(p)); cache.set(keyOf(p), g); return g; }
    const g = build(p);
    cache.set(keyOf(p), g);
    while (cache.size > 4) {
      const [k, old] = cache.entries().next().value;
      if (old === cur?.tire || old === prev?.tire) break;
      cache.delete(k); old.userData.dispose?.();
    }
    return g;
  };

  const YAW = -0.62, DIR = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  const mk = (tire) => { const outer = new THREE.Group(), inner = new THREE.Group(); inner.add(tire); outer.add(inner); outer.rotation.y = YAW; return { outer, inner, tire, s: 0 }; };
  let cur = null, prev = null, anim = null;
  const place = (o, s) => { o.s = s; o.outer.position.copy(DIR).multiplyScalar(s); o.inner.rotation.z = -s; };
  const pointer = { x: 0, sx: 0 };
  if (fine) addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; }, { passive: true });

  function present(p, dir) {
    const accent = new THREE.Color(catOf(p).accent);
    rimL.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.35);
    const tire = get(p);
    if (cur && cur.tire === tire) return;
    if (prev) scene.remove(prev.outer);
    prev = cur;
    cur = mk(tire);
    scene.add(cur.outer);
    if (!dir || reduce || !prev) { if (prev) { scene.remove(prev.outer); prev = null; } place(cur, 0); anim = null; return; }
    anim = { t: 0, dir };
    place(cur, dir * 5.2);
  }

  // Miniatures de la collection, rendues une fois avec le même pneu 3D
  const thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbR.setSize(400, 300, false); thumbR.setPixelRatio(1);
  thumbR.toneMapping = THREE.ACESFilmicToneMapping; thumbR.outputColorSpace = THREE.SRGBColorSpace;
  const tScene = new THREE.Scene();
  tScene.environment = new THREE.PMREMGenerator(thumbR).fromScene(new RoomEnvironment(), 0.04).texture;
  const tKey = key.clone(), tRim = rimL.clone(), tFill = new THREE.DirectionalLight(0xffffff, 0.9);
  tKey.intensity = 1.5; tFill.position.set(2, 1, 6);
  tScene.add(tKey, tRim, tRim.target, tFill);
  const tCam = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 50);
  tCam.position.set(0, 0.35, 4.9); tCam.lookAt(0, 0, 0);
  const queue = PRODUCTS.slice();
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 60));
  const nextThumb = () => {
    const p = queue.shift();
    if (!p) { thumbR.dispose(); return; }
    const g = build(p, 0.3, 512);
    const o = mk(g); o.inner.rotation.z = 0.5; o.outer.rotation.y = -0.42;
    tRim.color.set(catOf(p).accent);
    tScene.add(o.outer);
    thumbR.render(tScene, tCam);
    thumbs.set(p.id, thumbR.domElement.toDataURL("image/webp", 0.86));
    tScene.remove(o.outer); g.userData.dispose?.();
    document.querySelectorAll(`.pc[data-id="${p.id}"] .pc-img > svg, .pc[data-id="${p.id}"] .pc-img > img`).forEach((el) => { el.outerHTML = imgFor(p); });
    idle(nextThumb);
  };
  setTimeout(() => idle(nextThumb), 1200);

  let last = performance.now(), spin = 0;
  (function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const inView = canvas.getBoundingClientRect().bottom > 0 && !document.hidden;
    if (inView && cur) {
      pointer.sx += (pointer.x - pointer.sx) * 0.05;
      if (anim) {
        anim.t = Math.min(1, anim.t + dt / 1.15);
        const e = anim.t < 0.5 ? 4 * anim.t ** 3 : 1 - Math.pow(-2 * anim.t + 2, 3) / 2;
        place(cur, anim.dir * 5.2 * (1 - e));
        if (prev) place(prev, -anim.dir * 5.2 * e);
        if (anim.t >= 1) { if (prev) scene.remove(prev.outer); prev = null; anim = null; }
      } else {
        spin += dt * 0.35;
        cur.inner.rotation.z = -cur.s - spin;
      }
      const sway = Math.sin(now / 2400) * 0.12 + pointer.sx * 0.5;
      cur.outer.rotation.y = YAW + sway;
      if (prev) prev.outer.rotation.y = YAW + sway;
      renderer.render(scene, cam);
    }
    requestAnimationFrame(frame);
  })(last);

  return { present, warm: (p) => { if (p && !anim) get(p); } };
}
