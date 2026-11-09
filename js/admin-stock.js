// Espace gérant : le stock et les commandes. Les deux lisent les mêmes données :
// une commande en cours réserve des pneus, et sa remise au client les sort du stock.
import { BASE_PRODUCTS, photoOf } from "./catalogue.js?v=4";

const { api, isDemo, time: T } = window.BookingAPI;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const digits = (s) => String(s || "").replace(/\D/g, "");
const shortDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short" });
const hourTxt = (date) => { const p = T.parisParts(date); return p.min ? `${p.h} h ${T.pad(p.min)}` : `${p.h} h`; };
const LOT = "le lot de 4";
const DEFAULT_MIN = 4;

const LABEL = { nouvelle: "À rappeler", confirmee: "À préparer", prete: "Prête", livree: "Remise", annulee: "Annulée" };
const PILL = { nouvelle: "st-en_attente", confirmee: "od-prep", prete: "st-confirme", livree: "st-termine", annulee: "st-termine" };
const NEXT = { nouvelle: ["confirmee", "Client rappelé"], confirmee: ["prete", "Pneus prêts"], prete: ["livree", "Remis au client"] };
const ACTIVE = new Set(["nouvelle", "confirmee", "prete"]);
const statusOf = (o) => o.order_status || (o.status === "traite" ? "confirmee" : "nouvelle");
const linesOf = (o) => (Array.isArray(o.details?.lignes) ? o.details.lignes : []);
const nameOf = (o) => o.customer_name || o.name || "";
const phoneOf = (o) => o.customer_phone || o.phone || "";

let products = [], stock = {}, orders = [], bookings = [];

async function fetchAll() {
  const today = new Date(), from = new Date(today.getTime() - 100 * 864e5), to = new Date(today.getTime() + 60 * 864e5);
  const [p, s, o, b] = await Promise.all([
    api.products().catch(() => null),
    api.adminStock().catch(() => ({})),
    api.adminOrders().catch(() => []),
    api.adminBookings(from, to).catch(() => []),
  ]);
  products = p && p.length ? p : BASE_PRODUCTS.map((x) => ({ ...x }));
  stock = s || {}; orders = o || []; bookings = b || [];
}

// Pneus réservés par les commandes en cours, en laissant de côté une commande donnée.
function reservedBy(except = null) {
  const m = new Map();
  for (const o of orders) {
    if (o === except || !ACTIVE.has(statusOf(o))) continue;
    for (const l of linesOf(o)) m.set(l.id, (m.get(l.id) || 0) + Number(l.qty || 0));
  }
  return m;
}
const unitOf = (p, n) => (p.unit === LOT ? (n > 1 ? "lots" : "lot") : (n > 1 ? "pneus" : "pneu"));
const entry = (id) => stock[id] || { qty: null, min: DEFAULT_MIN };
function stateOf(id, reserved) {
  const { qty, min } = entry(id);
  if (qty === null || qty === undefined) return { k: "none", label: "Non suivi", cls: "st-termine" };
  const free = qty - reserved;
  if (free <= 0) return { k: "out", label: qty === 0 ? "Rupture" : "Tout réservé", cls: "sk-out" };
  if (free <= min) return { k: "low", label: "À commander", cls: "st-en_attente" };
  return { k: "ok", label: "Suffisant", cls: "st-confirme" };
}

export async function badges() { await fetchAll(); changed(); }
// Calculé sur ce qui est déjà en mémoire : ne doit pas écraser une saisie en cours d'enregistrement.
function changed() {
  const res = reservedBy();
  const low = products.filter((p) => ["out", "low"].includes(stateOf(p.id, res.get(p.id) || 0).k)).length;
  const fresh = orders.filter((o) => statusOf(o) === "nouvelle").length;
  const put = (id, n, text) => { const el = $(id); el.hidden = !n; el.innerHTML = n ? `${n}<span class="sr-only"> ${text}</span>` : ""; };
  put("tab-stock-n", low, "à commander");
  put("tab-commandes-n", fresh, "à rappeler");
}

/* ---------------- Stock ---------------- */
let skQuery = "", skView = "all", skBuilt = false;

function skSay(text, bad = false) {
  const el = $("sk-status");
  el.textContent = text;
  el.classList.toggle("bad", bad);
  clearTimeout(skSay.t);
  skSay.t = setTimeout(() => { el.textContent = ""; }, 4000);
}
function skRow(p, res) {
  const e = entry(p.id), r = res.get(p.id) || 0, s = stateOf(p.id, r), ph = photoOf(p), full = `${p.brand} ${p.model}`;
  const free = e.qty === null || e.qty === undefined ? "–" : Math.max(0, e.qty - r);
  return `<article class="sk-row" data-id="${esc(p.id)}">
    <span class="pa-img"><img src="${esc(ph.small || ph.src)}" alt="" width="64" height="48" loading="lazy" decoding="async"></span>
    <div class="pa-name"><p class="pa-b">${esc(p.brand)}</p><p class="pa-m">${esc(p.model)}${p.hidden ? ' <span class="sk-hid">masqué</span>' : ""}</p><p class="pa-s">${esc(p.size)}${p.unit === LOT ? " · au lot" : ""}</p></div>
    <div class="sk-cells">
      <div class="sk-cell"><span class="sk-l">En stock</span><div class="sk-step"><button type="button" data-step="-1" aria-label="En retirer un : ${esc(full)}">−</button><input type="text" inputmode="numeric" autocomplete="off" value="${e.qty ?? ""}" placeholder="–" data-qty aria-label="Quantité en stock : ${esc(full)}"><button type="button" data-step="1" aria-label="En ajouter un : ${esc(full)}">+</button></div></div>
      <div class="sk-cell sk-num"><span class="sk-l">Réservés</span>${r ? `<button class="d-link" type="button" data-orders aria-label="${r} réservés : voir les commandes de ${esc(full)}">${r}</button>` : "<b>0</b>"}</div>
      <div class="sk-cell sk-num"><span class="sk-l">Disponibles</span><b data-free>${free}</b></div>
      <div class="sk-cell"><span class="sk-l">Alerte à</span><input class="sk-min" type="text" inputmode="numeric" autocomplete="off" value="${e.min ?? DEFAULT_MIN}" data-min aria-label="Seuil d'alerte : ${esc(full)}"></div>
    </div>
    <span class="pill sk-pill ${s.cls}" data-state>${s.label}</span>
  </article>`;
}
function skSum(res) {
  const tracked = products.filter((p) => typeof entry(p.id).qty === "number");
  const total = tracked.reduce((a, p) => a + entry(p.id).qty, 0);
  const reserved = [...res.values()].reduce((a, n) => a + n, 0);
  const low = products.filter((p) => ["out", "low"].includes(stateOf(p.id, res.get(p.id) || 0).k)).length;
  if (!tracked.length) { $("sk-sum").textContent = "Indiquez une quantité pour commencer à suivre un produit."; return low; }
  $("sk-sum").innerHTML = `<b>${total} en stock</b>, ${reserved} réservé${reserved > 1 ? "s" : ""} par des commandes, ${low} produit${low > 1 ? "s" : ""} à commander.`;
  return low;
}
function skSeg(res) {
  const low = products.filter((p) => ["out", "low"].includes(stateOf(p.id, res.get(p.id) || 0).k)).length;
  const withRes = products.filter((p) => res.get(p.id)).length;
  const opts = [["all", `Tous (${products.length})`], ["low", `À commander (${low})`], ["res", `Réservés (${withRes})`]];
  $("sk-seg").innerHTML = opts.map(([k, t]) => `<button type="button" data-sk="${k}" aria-pressed="${k === skView}">${t}</button>`).join("");
}
function skRender() {
  const res = reservedBy();
  skSum(res); skSeg(res);
  const q = skQuery.trim().toLowerCase();
  const list = products.filter((p) => {
    if (q && !`${p.brand} ${p.model} ${p.size}`.toLowerCase().includes(q)) return false;
    if (skView === "low") return ["out", "low"].includes(stateOf(p.id, res.get(p.id) || 0).k);
    if (skView === "res") return Boolean(res.get(p.id));
    return true;
  });
  $("sk-list").innerHTML = list.length ? list.map((p) => skRow(p, res)).join("") : '<p class="empty">Aucun produit dans cette liste.</p>';
}
// Met à jour une ligne sans la redessiner, pour ne pas perdre le champ en cours de saisie.
function skPaint(row, p) {
  const res = reservedBy(), r = res.get(p.id) || 0, e = entry(p.id), s = stateOf(p.id, r);
  row.querySelector("[data-free]").textContent = e.qty === null || e.qty === undefined ? "–" : Math.max(0, e.qty - r);
  const st = row.querySelector("[data-state]");
  st.textContent = s.label; st.className = `pill sk-pill ${s.cls}`;
  skSum(res); skSeg(res);
}
const toCount = (v) => { const t = String(v).trim(); if (t === "") return null; const n = Number(t); return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : NaN; };
async function skSave(p, row, next, done) {
  const before = stock[p.id];
  stock[p.id] = next;
  skPaint(row, p);
  try {
    await api.adminSetStock(p.id, next);
    skSay(done);
    changed();
  } catch (x) {
    if (before) stock[p.id] = before; else delete stock[p.id];
    skRender();
    skSay("L'enregistrement a échoué. Réessayez.", true);
  }
}
function skBuild() {
  skBuilt = true;
  $("sk-demo").hidden = !isDemo;
  $("sk-q").addEventListener("input", (e) => { skQuery = e.target.value; skRender(); });
  $("sk-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-sk]"); if (b) { skView = b.dataset.sk; skRender(); } });
  const save = {};
  $("sk-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const p = products.find((x) => x.id === row.dataset.id);
    if (e.target.closest("[data-orders]")) { showOrdersOf(p); return; }
    const step = e.target.closest("[data-step]");
    if (!step) return;
    const cur = entry(p.id), n = Math.max(0, Math.min(9999, (cur.qty ?? 0) + Number(step.dataset.step)));
    const input = row.querySelector("[data-qty]");
    input.value = n;
    const next = { ...cur, qty: n };
    stock[p.id] = next;
    skPaint(row, p);
    clearTimeout(save[p.id]);
    save[p.id] = setTimeout(() => skSave(p, row, next, `${p.model} : ${n} ${unitOf(p, n)} en stock.`), 300);
  });
  $("sk-list").addEventListener("change", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const p = products.find((x) => x.id === row.dataset.id), cur = entry(p.id);
    if (e.target.matches("[data-qty]")) {
      const n = toCount(e.target.value);
      if (Number.isNaN(n)) { e.target.value = cur.qty ?? ""; skSay("Indiquez un nombre entier, ou laissez vide pour ne pas suivre ce produit.", true); return; }
      if (n === cur.qty) return;
      skSave(p, row, { ...cur, qty: n }, n === null ? `${p.model} n'est plus suivi.` : `${p.model} : ${n} ${unitOf(p, n)} en stock.`);
    }
    if (e.target.matches("[data-min]")) {
      const n = toCount(e.target.value);
      if (Number.isNaN(n) || n === null) { e.target.value = cur.min ?? DEFAULT_MIN; skSay("Le seuil d'alerte est un nombre entier.", true); return; }
      if (n === cur.min) return;
      skSave(p, row, { ...cur, min: n }, `${p.model} : alerte à ${n}.`);
    }
  });
}
export async function openStock() {
  if (!skBuilt) skBuild();
  await fetchAll();
  skRender();
}

/* ---------------- Commandes ---------------- */
const PAGE = 20;
let odQuery = "", odView = "cours", odBuilt = false, odShown = PAGE, odProduct = null;
const STAGE = { nouvelle: 0, confirmee: 1, prete: 2 };
const VIEW_OF = (s) => (ACTIVE.has(s) ? "cours" : s === "livree" ? "faites" : "annulees");

function showOrdersOf(p) {
  odProduct = { id: p.id, label: `${p.brand} ${p.model}` };
  odView = "cours"; odQuery = ""; odShown = PAGE;
  $("od-q").value = "";
  location.hash = "#commandes";
}
function rdvOf(o) {
  if (String(o.details?.pose || "").startsWith("Retrait")) return null;
  if (o.details?.rdv) return bookings.find((b) => b.id === o.details.rdv) || null;
  const tel = digits(phoneOf(o)), from = new Date(o.created_at);
  return bookings.filter((b) => b.status !== "annule" && digits(b.customer_phone) === tel && new Date(b.start_at) >= from && (b.services || []).some((s) => s.id === "pneus"))
    .sort((a, b) => a.start_at.localeCompare(b.start_at))[0] || null;
}
function chip(l, s, others) {
  if (s === "annulee") return "";
  if (s === "livree") return '<span class="od-chip">Sorti du stock</span>';
  const c = stock[l.id];
  if (!c || typeof c.qty !== "number") return '<a class="od-chip" href="#stock">Stock non renseigné</a>';
  const free = c.qty - (others.get(l.id) || 0), qty = Number(l.qty);
  return free >= qty ? `<a class="od-chip ok" href="#stock">En stock : ${c.qty}</a>` : `<a class="od-chip bad" href="#stock">Manque ${qty - Math.max(0, free)}</a>`;
}
function orderHtml(o) {
  const s = statusOf(o), d = o.details || {}, lines = linesOf(o), others = reservedBy(o), name = nameOf(o), phone = phoneOf(o);
  const ref = d.ref || String(o.id).slice(-6).toUpperCase();
  const rdv = rdvOf(o);
  const pose = String(d.pose || "").startsWith("Retrait") ? "Retrait au comptoir"
    : rdv ? `Pose le ${shortDate.format(new Date(rdv.start_at))}, ${hourTxt(new Date(rdv.start_at))}` : "Pose au garage, rendez-vous à prendre";
  const items = lines.length
    ? `<ul class="od-lines">${lines.map((l) => `<li><span class="od-q">${esc(l.qty)} ×</span><span class="od-p">${esc(l.label)} <small>${esc(l.size)}</small></span>${chip(l, s, others)}</li>`).join("")}</ul>`
    : `<p class="od-plain">${esc(d.articles || "")}</p>`;
  const next = NEXT[s];
  const btns = [
    ACTIVE.has(s) ? `<button class="d-btn d-btn-text" type="button" data-cancel>Annuler</button>` : "",
    next ? `<button class="d-btn" type="button" data-to="${next[0]}">${next[1]}</button>` : "",
    s === "livree" ? `<button class="d-btn d-btn-text" type="button" data-to="prete">Annuler la remise</button>` : "",
    s === "annulee" ? `<button class="d-btn d-btn-line" type="button" data-to="nouvelle">Rétablir</button>` : "",
  ].join("");
  return `<article class="od" data-order="${esc(o.id)}">
    <div class="od-a">
      <p class="od-top"><span class="pill ${PILL[s]}">${LABEL[s]}</span><span class="od-ref">N° ${esc(ref)}</span></p>
      <p class="od-name">${esc(name)}</p>
      <a class="rdv-tel" href="tel:${esc(phone.replace(/[^\d+]/g, ""))}">${esc(phone)}</a>
      <p class="od-m">Commandé le ${esc(shortDate.format(new Date(o.created_at)))}</p>
    </div>
    <div class="od-b">
      ${items}
      <p class="od-m">${esc(pose)}${d.vehicule ? ` · ${esc(d.vehicule)}` : ""}</p>
      ${d.message ? `<p class="rdv-note">${esc(d.message)}</p>` : ""}
    </div>
    <div class="od-c">
      <p class="od-total">${esc(d.total || "")}</p>
      <div class="rdv-btns">${btns}</div>
      <p class="od-err" role="alert" hidden></p>
    </div>
  </article>`;
}
function odRender() {
  const counts = { cours: 0, faites: 0, annulees: 0 }, by = { nouvelle: 0, confirmee: 0, prete: 0 };
  for (const o of orders) { const s = statusOf(o); counts[VIEW_OF(s)]++; if (s in by) by[s]++; }
  const now = T.parisParts(new Date());
  const month = orders.filter((o) => { const p = T.parisParts(new Date(o.created_at)); return p.y === now.y && p.m === now.m && statusOf(o) !== "annulee"; }).length;
  const bits = [];
  if (by.nouvelle) bits.push(`<b>${by.nouvelle} à rappeler</b>`);
  if (by.confirmee) bits.push(`${by.confirmee} à préparer`);
  if (by.prete) bits.push(`${by.prete} prête${by.prete > 1 ? "s" : ""}`);
  $("od-sum").innerHTML = `${bits.length ? `${bits.join(", ")}. ` : "Aucune commande en cours. "}${month} commande${month > 1 ? "s" : ""} ce mois-ci.`;
  const opts = [["cours", `En cours (${counts.cours})`], ["faites", `Remises (${counts.faites})`], ["annulees", `Annulées (${counts.annulees})`]];
  $("od-seg").innerHTML = opts.map(([k, t]) => `<button type="button" data-od="${k}" aria-pressed="${k === odView}">${t}</button>`).join("");

  const f = $("od-filter");
  f.hidden = !odProduct;
  f.innerHTML = odProduct ? `Commandes avec <b>${esc(odProduct.label)}</b> <button class="d-link" type="button" id="od-filter-x">Tout afficher</button>` : "";

  const q = odQuery.trim().toLowerCase(), qd = digits(q);
  const list = orders.filter((o) => {
    if (VIEW_OF(statusOf(o)) !== odView) return false;
    if (odProduct && !linesOf(o).some((l) => l.id === odProduct.id)) return false;
    if (!q) return true;
    if (qd.length >= 4 && digits(phoneOf(o)).includes(qd)) return true;
    return `${nameOf(o)} ${o.details?.articles || ""} ${o.details?.ref || ""}`.toLowerCase().includes(q);
  });
  if (odView === "cours") list.sort((a, b) => STAGE[statusOf(a)] - STAGE[statusOf(b)] || b.created_at.localeCompare(a.created_at));
  const empty = q || odProduct ? "Aucune commande ne correspond." : odView === "cours" ? "Aucune commande en cours." : "Rien dans cette liste.";
  $("od-list").innerHTML = list.length ? list.slice(0, odShown).map(orderHtml).join("") : `<p class="empty">${empty}</p>`;
  $("od-more").hidden = list.length <= odShown;
}
function odBuild() {
  odBuilt = true;
  $("od-demo").hidden = !isDemo;
  $("od-q").addEventListener("input", (e) => { odQuery = e.target.value; odShown = PAGE; odRender(); });
  $("od-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-od]"); if (b) { odView = b.dataset.od; odShown = PAGE; odRender(); } });
  $("od-filter").addEventListener("click", (e) => { if (e.target.id === "od-filter-x") { odProduct = null; odRender(); } });
  $("od-more-b").addEventListener("click", () => { odShown += PAGE; odRender(); });
  $("od-list").addEventListener("click", async (e) => {
    const row = e.target.closest("[data-order]");
    if (!row) return;
    let target = e.target.closest("[data-to]")?.dataset.to;
    const cancel = e.target.closest("[data-cancel]");
    if (cancel) {
      if (cancel.dataset.sure !== "1") {
        cancel.dataset.sure = "1"; cancel.textContent = "Vraiment annuler ?"; cancel.classList.add("sure");
        setTimeout(() => { if (cancel.isConnected) { cancel.dataset.sure = ""; cancel.textContent = "Annuler"; cancel.classList.remove("sure"); } }, 4000);
        return;
      }
      target = "annulee";
    }
    if (!target) return;
    const err = row.querySelector(".od-err"), btns = row.querySelectorAll("button");
    err.hidden = true;
    btns.forEach((b) => { b.disabled = true; });
    try {
      await api.adminSetOrderStatus(row.dataset.order, target);
      await fetchAll();
      odRender();
      changed();
    } catch (x) {
      btns.forEach((b) => { b.disabled = false; });
      err.innerHTML = x?.code === "stock_short"
        ? `Stock insuffisant pour ${esc(x.message)}. <a href="#stock">Corriger le stock</a>`
        : "Le changement n'a pas été enregistré. Réessayez.";
      err.hidden = false;
    }
  });
}
export async function openOrders() {
  if (!odBuilt) odBuild();
  await fetchAll();
  odRender();
}
