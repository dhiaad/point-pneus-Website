// Espace gérant : qui vient, ce qu'il reste à traiter, les fermetures. Rien d'autre.
const { api, isDemo, time: T } = window.BookingAPI;
const cfg = window.BOOKING_CONFIG || {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euro = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const STATUS = { en_attente: "À confirmer", confirme: "Confirmé", annule: "Annulé", termine: "Terminé" };
const SERVICES = new Map((cfg.services || []).map((s) => [s.id, s]));
const back = location.origin + location.pathname;
const DAY = 864e5;

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const openSlots = (dow) => (cfg.hours?.[dow] || []).map(([a, b]) => [toMin(a), toMin(b)]);
const keyOf = (date) => { const p = T.parisParts(date); return T.dayKey(p.y, p.m, p.d); };
const minsOf = (date) => { const p = T.parisParts(date); return p.h * 60 + p.min; };
const hourTxt = (date) => { const p = T.parisParts(date); return p.min ? `${p.h} h ${T.pad(p.min)}` : `${p.h} h`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLabel = (date) => cap(T.dateLabel.format(date));
const isClosed = (date) => { const p = T.parisParts(date); return !openSlots(p.dow).length || T.holidays(p.y).has(T.dayKey(p.y, p.m, p.d)) || (cfg.closedDates || []).includes(T.dayKey(p.y, p.m, p.d)); };
const startOfDay = (date) => { const p = T.parisParts(date); return T.parisDate(p.y, p.m, p.d, 0, 0); };
const addDays = (date, n) => { const p = T.parisParts(new Date(date.getTime() + n * DAY + 12 * 36e5)); return T.parisDate(p.y, p.m, p.d, 0, 0); };
const dayName = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short" });
const dayNum = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short" });
const CHEVRON = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

let data = { bookings: [], quotes: [], blocks: [] };
let events = [];        // fréquentation du site, déjà agrégée (jour, type, page, source, appareil, nombre)
let period = 30;        // jours affichés dans « Activité du site »
let selected = null;    // jour affiché
let offset = 0;         // premier jour de la bande, en jours depuis aujourd'hui
const OFFSET_MIN = -91, OFFSET_MAX = 28;

/* ---------------- Connexion ---------------- */
$("demo-banner").hidden = !isDemo;
const VIEWS = { tableau: "dashboard", "nos-pneus": "view-boutique", stock: "view-stock", commandes: "view-commandes", qamar: "view-qamar" };
const ALIAS = { boutique: "nos-pneus" };
let signedIn = false, shownView = null;

/* ---------------- Les phares : allumés, l'espace gérant passe aux couleurs du site ---------------- */
const THEME_KEY = "pp-dash-theme";
const isDark = () => document.documentElement.dataset.dashTheme === "dark";
function paintBar() {
  document.querySelector('meta[name="theme-color"]').content = document.body.classList.contains("q-night") ? "#07060f" : isDark() ? "#0a090c" : "#f5f3ee";
}
function paintPhare() {
  const on = isDark(), b = $("phare");
  b.setAttribute("aria-checked", String(on));
  b.title = on ? "Éteindre les phares : passer en mode clair" : "Allumer les phares : passer en mode sombre";
  paintBar();
}
$("phare").addEventListener("click", (e) => {
  const on = !isDark();
  if (on) document.documentElement.dataset.dashTheme = "dark"; else delete document.documentElement.dataset.dashTheme;
  try { localStorage.setItem(THEME_KEY, on ? "dark" : "light"); } catch (x) { /* le choix vaudra pour cette page */ }
  paintPhare();
  if (on && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const r = e.currentTarget.getBoundingClientRect(), s = $("phare-sweep");
    s.style.setProperty("--x", `${Math.round(r.left + 12)}px`);
    s.style.setProperty("--y", `${Math.round(r.top + r.height / 2)}px`);
    s.classList.remove("go"); void s.offsetWidth; s.classList.add("go");
  }
});
paintPhare();

function route() {
  if (!signedIn) return;
  const h = location.hash.slice(1), wanted = ALIAS[h] || h, v = VIEWS[wanted] ? wanted : "tableau", prev = shownView;
  for (const [k, id] of Object.entries(VIEWS)) $(id).hidden = k !== v;
  document.querySelectorAll("[data-view]").forEach((a) => { if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.body.classList.toggle("q-night", v === "qamar");
  paintBar();
  if (shownView !== v) scrollTo(0, 0);
  shownView = v;
  if (v === "tableau" && chartData.length) drawChart(chartData);
  if (v === "tableau" && prev && prev !== "tableau") load();
  if (v === "nos-pneus") import("./admin-shop.js?v=2").then((m) => m.openShopAdmin());
  if (v === "stock") import("./admin-stock.js?v=1").then((m) => m.openStock());
  if (v === "commandes") import("./admin-stock.js?v=1").then((m) => m.openOrders());
  if (v === "qamar") import("./qamar.js?v=4").then((m) => m.openQamar());
}
addEventListener("hashchange", route);

async function start() {
  const user = await api.getUser().catch(() => null);
  signedIn = false; shownView = null;
  $("login").hidden = Boolean(user);
  $("garage-user").hidden = !user;
  Object.values(VIEWS).forEach((id) => { $(id).hidden = true; });
  $("d-tabs").hidden = true;
  document.body.classList.remove("q-night");
  $("denied").hidden = true;
  if (!user) return;
  $("admin-email").textContent = user.email || "";
  if (!(await api.isAdmin())) { $("denied").hidden = false; return; }
  signedIn = true;
  await autoSeed();
  $("d-tabs").hidden = false;
  route();
  $("demo-tools").hidden = !isDemo;
  $("b-day").value = keyOf(new Date());
  load();
}
$("admin-google").addEventListener("click", async () => { await api.signInWithGoogle(back).catch(() => null); start(); });
$("admin-email-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("admin-email-input").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("admin-email-msg").textContent = "Indiquez une adresse e-mail valide."; return; }
  try {
    const r = await api.signInWithEmail(email, back);
    if (r && r.instant) start(); else $("admin-email-msg").textContent = "Lien envoyé. Ouvrez-le pour revenir ici connecté.";
  } catch (x) { $("admin-email-msg").textContent = "Envoi impossible pour le moment."; }
});
$("admin-signout").addEventListener("click", async () => { await api.signOut(); start(); });

/* ---------------- Chargement ---------------- */
async function load() {
  const today = startOfDay(new Date());
  const [bookings, quotes, blocks, ev] = await Promise.all([
    api.adminBookings(addDays(today, -92), addDays(today, 31)).catch(() => null),
    api.adminQuotes().catch(() => null),
    api.adminBlocks().catch(() => []),
    api.adminEvents(190).catch(() => []),
  ]);
  data = { bookings: bookings || [], quotes: quotes || [], blocks: blocks || [] };
  events = ev || [];
  if (!selected) selected = keyOf(new Date());
  render();
  import("./admin-stock.js?v=1").then((m) => m.badges()).catch(() => null);
  if (!bookings) $("day-list").innerHTML = '<p class="empty">Chargement impossible. Vérifiez la connexion.</p>';
}
function render() { renderHello(); renderKpis(); renderDays(); renderDay(); renderTodo(); renderBlocks(); renderStats(); }

const live = (b) => b.status !== "annule";
const isShop = (q) => q.details && q.details.type === "Commande boutique";
const onDay = (key) => data.bookings.filter((b) => keyOf(new Date(b.start_at)) === key);
const serviceText = (b) => (b.services || []).map((s) => s.label || SERVICES.get(s.id)?.title || s.id).join(", ");
const telOf = (s) => String(s || "").replace(/[^\d+]/g, "");
const carText = (v = {}) => [v.brand, v.model, v.year].filter(Boolean).join(" ");
function nextToday() {
  const now = new Date();
  return onDay(keyOf(now)).filter((b) => live(b) && b.status !== "termine" && new Date(b.end_at) > now).sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
}
function todoItems() {
  const now = new Date();
  const rdv = data.bookings.filter((b) => b.status === "en_attente" && new Date(b.end_at) > now).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const asks = data.quotes.filter((q) => q.status !== "traite").sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { rdv, asks, total: rdv.length + asks.length };
}

/* ---------------- En-tête ---------------- */
function renderHello() {
  const now = new Date(), today = onDay(keyOf(now)).filter(live), next = nextToday(), { total } = todoItems();
  $("hello-t").textContent = dayLabel(now);
  const parts = [];
  if (isClosed(now) && !today.length) parts.push("Garage fermé aujourd'hui.");
  else if (!today.length) parts.push("Aucun rendez-vous aujourd'hui.");
  else parts.push(`<b>${today.length} rendez-vous</b> aujourd'hui.`);
  if (next) parts.push(`Prochain à <b>${hourTxt(new Date(next.start_at))}</b> : ${esc(next.customer_name)}${next.vehicle?.model ? `, ${esc(next.vehicle.model)}` : ""}.`);
  if (total) parts.push(`<a href="#todo-card">${total} à traiter</a>`);
  $("hello-sum").innerHTML = parts.join(" ");
}

/* ---------------- Les jours ---------------- */
function renderDays() {
  const today = startOfDay(new Date()), todayKey = keyOf(today);
  const cells = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, offset + i), k = keyOf(d), list = onDay(k).filter(live), closed = isClosed(d);
    const wait = list.some((b) => b.status === "en_attente");
    const label = `${dayLabel(d)}, ${closed && !list.length ? "fermé" : `${list.length} rendez-vous`}${wait ? ", à confirmer" : ""}`;
    return `<button type="button" class="day-b${closed && !list.length ? " closed" : ""}${wait ? " wait" : ""}" data-day="${k}" aria-pressed="${k === selected}" aria-label="${esc(label)}">
      <span class="d-n">${k === todayKey ? "Auj." : esc(cap(dayName.format(d).replace(".", "")))}</span>
      <span class="d-d">${esc(dayNum.format(d))}</span>
      <span class="d-c">${closed && !list.length ? "Fermé" : `${list.length} RDV`}</span>
    </button>`;
  }).join("");
  $("days").innerHTML = `<button type="button" class="day-nav" data-week="-7" aria-label="Semaine précédente" ${offset <= OFFSET_MIN ? "disabled" : ""}>${CHEVRON("M15 5l-7 7 7 7")}</button>${cells}<button type="button" class="day-nav" data-week="7" aria-label="Semaine suivante" ${offset >= OFFSET_MAX ? "disabled" : ""}>${CHEVRON("M9 5l7 7-7 7")}</button>`;
}
function showDay(key) {
  selected = key;
  const today = startOfDay(new Date());
  const inStrip = Array.from({ length: 7 }, (_, i) => keyOf(addDays(today, offset + i))).includes(key);
  if (!inStrip) for (let o = OFFSET_MIN; o <= OFFSET_MAX; o += 7) if (Array.from({ length: 7 }, (_, i) => keyOf(addDays(today, o + i))).includes(key)) { offset = o; break; }
  renderDays(); renderDay();
}

/* ---------------- Le jour choisi ---------------- */
function blocksOn(key, date) {
  return data.blocks.filter((b) => keyOf(new Date(b.start_at)) === key || (new Date(b.start_at) <= date && new Date(b.end_at) >= date));
}
function renderDay() {
  const now = new Date(), key = selected, [y, m, d] = key.split("-").map(Number), date = T.parisDate(y, m, d, 12, 0);
  const all = onDay(key), list = all.filter(live), cancelled = all.length - list.length;
  $("day-t").textContent = key === keyOf(now) ? "Aujourd'hui" : dayLabel(date);
  $("day-sub").textContent = `${list.length} rendez-vous${cancelled ? ` · ${cancelled} annulé${cancelled > 1 ? "s" : ""}` : ""}`;
  const next = nextToday();
  const rows = [
    ...list.map((b) => ({ at: new Date(b.start_at).getTime(), html: rdvRow(b, now, next) })),
    ...blocksOn(key, date).map((b) => {
      const a = new Date(b.start_at), z = new Date(b.end_at);
      return { at: a.getTime(), html: `<div class="rdv closed-row"><div class="rdv-time"><b>${hourTxt(a)}</b><small>à ${hourTxt(z)}</small></div><div><p class="rdv-name">Fermé</p>${b.reason ? `<p class="rdv-svc">${esc(b.reason)}</p>` : ""}</div><div class="rdv-act"><button class="d-btn d-btn-line" type="button" data-block="${esc(b.id)}">Rouvrir</button></div></div>` };
    }),
  ].sort((a, b) => a.at - b.at);
  $("day-list").innerHTML = rows.length ? rows.map((r) => r.html).join("") : `<p class="empty">${isClosed(date) ? "Garage fermé ce jour-là." : "Aucun rendez-vous ce jour-là."}</p>`;
}
function rdvRow(b, now, next) {
  const mins = Number(b.minutes) || Math.round((new Date(b.end_at) - new Date(b.start_at)) / 6e4);
  const car = carText(b.vehicle), past = b.status === "termine" || new Date(b.end_at) < now;
  const main = b.status === "en_attente" ? `<button class="d-btn" type="button" data-id="${esc(b.id)}" data-status="confirme">Confirmer</button>`
    : b.status === "confirme" ? `<button class="d-btn d-btn-line" type="button" data-id="${esc(b.id)}" data-status="termine">Terminé</button>` : "";
  const cancel = b.status === "en_attente" || b.status === "confirme" ? `<button class="d-btn d-btn-text" type="button" data-id="${esc(b.id)}" data-status="annule">Annuler</button>` : "";
  return `<article class="rdv${next && next.id === b.id ? " next" : ""}${past ? " past" : ""}" data-rdv="${esc(b.id)}">
    <div class="rdv-time"><b>${hourTxt(new Date(b.start_at))}</b><small>${mins} min</small></div>
    <div>
      <p class="rdv-name">${esc(b.customer_name)} <span class="pill st-${esc(b.status)}">${STATUS[b.status] || esc(b.status)}</span></p>
      ${car || b.plate ? `<p class="rdv-car">${esc(car)}${b.plate ? ` <span class="plate-chip">${esc(b.plate)}</span>` : ""}</p>` : ""}
      <p class="rdv-svc">${esc(serviceText(b))}${b.estimated_total ? ` · <b>${euro(b.estimated_total)}</b>` : ""}</p>
      ${b.note ? `<p class="rdv-note">${esc(b.note)}</p>` : ""}
    </div>
    <div class="rdv-act">
      <a class="rdv-tel" href="tel:${esc(telOf(b.customer_phone))}">${esc(b.customer_phone)}</a>
      <div class="rdv-btns">${cancel}${main}</div>
    </div>
  </article>`;
}

/* ---------------- Chiffres clés ---------------- */
const lastDays = (n, shift = 0) => { const t = startOfDay(new Date()); return Array.from({ length: n }, (_, i) => keyOf(addDays(t, -(n - 1 - i) - shift))); };
const sumKind = (kind, keys) => { const set = new Set(keys); return events.reduce((a, r) => (r.kind === kind && set.has(r.d) ? a + r.n : a), 0); };
const fr = (n) => Math.round(n).toLocaleString("fr-FR");
const pl = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
function compare(now, before) {
  if (!before) return { text: now ? "Première semaine mesurée" : "En attente des premières visites", cls: "" };
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? "+" : ""}${pct} % par rapport aux 7 jours d'avant`, cls: pct > 0 ? "up" : pct < 0 ? "down" : "" };
}
function renderKpis() {
  const now = new Date(), today = startOfDay(now), dow = T.parisParts(now).dow;
  const monday = addDays(today, 1 - dow), nextMonday = addDays(monday, 7);
  const v7 = sumKind("visite", lastDays(7)), cmp = compare(v7, sumKind("visite", lastDays(7, 7)));
  const week = data.bookings.filter((b) => live(b) && new Date(b.start_at) >= monday && new Date(b.start_at) < nextMonday);
  const waiting = week.filter((b) => b.status === "en_attente").length;
  const { rdv, asks, total } = todoItems();
  const p = T.parisParts(now), first = T.parisDate(p.y, p.m, 1, 0, 0), next = p.m === 12 ? T.parisDate(p.y + 1, 1, 1, 0, 0) : T.parisDate(p.y, p.m + 1, 1, 0, 0);
  const month = data.bookings.filter((b) => live(b) && b.estimated_total && new Date(b.start_at) >= first && new Date(b.start_at) < next);
  const ca = month.reduce((a, b) => a + Number(b.estimated_total), 0);
  const card = (l, v, d, cls = "") => `<div class="kpi"><span class="kpi-l">${l}</span><span class="kpi-v">${v}</span><span class="kpi-d ${cls}">${d}</span></div>`;
  $("kpis").innerHTML = [
    card("Visites, 7 derniers jours", fr(v7), cmp.text, cmp.cls),
    card("Rendez-vous cette semaine", week.length, waiting ? pl(waiting, "à confirmer", "à confirmer") : "Tous confirmés"),
    card("À traiter", total, total ? `${pl(rdv.length, "rendez-vous", "rendez-vous")}, ${pl(asks.length, "demande")}` : "Tout est à jour"),
    card("Chiffre d'affaires estimé du mois", euro(ca), `D'après ${pl(month.length, "rendez-vous chiffré", "rendez-vous chiffrés")}, hors devis`),
  ].join("");
}

/* ---------------- Activité du site ---------------- */
const PAGE_NAMES = { "/": "Accueil", "/pneus.html": "Boutique", "/reserver.html": "Rendez-vous", "/garage.html": "Espace gérant", "/mentions-legales.html": "Mentions légales", "/confidentialite.html": "Vos données", "/cgu.html": "Conditions d'utilisation", "/404.html": "Page introuvable" };
const DEVICE_NAMES = { mobile: "Téléphone", tablette: "Tablette", ordinateur: "Ordinateur" };
function group(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (k) m.set(k, (m.get(k) || 0) + (r.n || 1)); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function rankList(entries, max) {
  if (!entries.length) return '<p class="rank-empty">Pas encore de données sur cette période.</p>';
  const top = max || entries[0][1] || 1;
  return `<ul class="rank">${entries.map(([k, n]) => `<li><span>${esc(k)}</span><b>${fr(n)}</b><i style="--w:${Math.max(n ? 2 : 0, Math.round((n / top) * 100))}%"></i></li>`).join("")}</ul>`;
}
function renderStats() {
  const keys = lastDays(period), set = new Set(keys), rows = events.filter((r) => set.has(r.d));
  $("stats-note").textContent = isDemo
    ? "Mode démo : chiffres d'exemple, plus vos propres visites dans ce navigateur."
    : "Visiteurs ayant accepté la mesure d'audience. Anonyme, aucun suivi individuel.";
  document.querySelectorAll("[data-period]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.period) === period)));

  const visits = rows.filter((r) => r.kind === "visite");
  const byDay = keys.map((d) => ({ d, n: visits.reduce((a, r) => (r.d === d ? a + r.n : a), 0) }));
  const total = byDay.reduce((a, x) => a + x.n, 0);
  $("chart-sum").textContent = `${fr(total)} ${total > 1 ? "visites" : "visite"}`;
  drawChart(byDay);
  $("chart-table").innerHTML = `<table><thead><tr><th scope="col">Jour</th><th scope="col">Visites</th></tr></thead><tbody>${byDay.slice().reverse().map((x) => `<tr><td>${esc(cap(shortDate.format(dateOfKey(x.d))))}</td><td>${fr(x.n)}</td></tr>`).join("")}</tbody></table>`;

  const fromMs = Date.now() - period * DAY;
  const received = data.bookings.filter((b) => new Date(b.created_at) >= fromMs).length + data.quotes.filter((q) => new Date(q.created_at) >= fromMs).length;
  const count = (k) => rows.reduce((a, r) => (r.kind === k ? a + r.n : a), 0);
  $("funnel").innerHTML = rankList([
    ["Visites", total], ["Clics vers le rendez-vous", count("rdv")], ["Voitures cherchées par plaque", count("plaque")], ["Pneus mis au panier", count("panier")],
    ["Appels depuis le site", count("appel")], ["Itinéraires demandés", count("itineraire")], ["Demandes reçues", received],
  ], Math.max(1, total));

  $("st-sources").innerHTML = rankList(group(visits, (r) => r.source || "Accès direct").slice(0, 6));
  $("st-pages").innerHTML = rankList(group(rows.filter((r) => r.kind === "page"), (r) => PAGE_NAMES[r.path] || r.path).slice(0, 6));
  $("st-devices").innerHTML = rankList(group(visits, (r) => DEVICE_NAMES[r.device] || "Autre"));
  const from = new Date(fromMs), svc = data.bookings.filter((b) => live(b) && new Date(b.start_at) >= from && new Date(b.start_at) <= new Date()).flatMap((b) => b.services || []);
  $("st-services").innerHTML = rankList(group(svc.map((s) => ({ s: SERVICES.get(s.id)?.title || s.label || s.id, n: 1 })), (r) => r.s).slice(0, 6));
}
const dateOfKey = (k) => { const [y, m, d] = k.split("-").map(Number); return T.parisDate(y, m, d, 12, 0); };
const niceMax = (v) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)), r = v / p; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p; };
let chartData = [];
function drawChart(series) {
  chartData = series;
  const el = $("chart"), W = Math.max(280, el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) * 2), H = W < 480 ? 180 : 240;
  const m = { l: 34, r: 8, t: 14, b: 24 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const top = niceMax(Math.max(...series.map((x) => x.n), 1));
  const X = (i) => m.l + (series.length < 2 ? iw / 2 : (i / (series.length - 1)) * iw), Y = (v) => m.t + ih - (v / top) * ih;
  const pts = series.map((x, i) => `${X(i).toFixed(1)},${Y(x.n).toFixed(1)}`);
  const grid = [0, 0.5, 1].map((f) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(top * f)}" y2="${Y(top * f)}"/><text x="${m.l - 8}" y="${Y(top * f) + 4}" text-anchor="end">${fr(top * f)}</text>`).join("");
  const step = series.length <= 7 ? 1 : series.length <= 30 ? 7 : 15;
  const labels = series.map((x, i) => {
    if ((series.length - 1 - i) % step) return "";
    const txt = series.length <= 7 ? cap(dayName.format(dateOfKey(x.d)).replace(".", "")) : new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" }).format(dateOfKey(x.d));
    return `<text x="${X(i)}" y="${H - 6}" text-anchor="${i === series.length - 1 ? "end" : "middle"}">${esc(txt)}</text>`;
  }).join("");
  el.setAttribute("aria-label", `Courbe des visites par jour, ${series.length} jours, ${fr(series.reduce((a, x) => a + x.n, 0))} visites au total`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" aria-hidden="true">${grid}<polygon class="area" points="${m.l},${Y(0)} ${pts.join(" ")} ${W - m.r},${Y(0)}"/><polyline class="line" points="${pts.join(" ")}"/>${labels}<g id="chart-hover" hidden><line class="cross" y1="${m.t}" y2="${m.t + ih}"/><circle class="dot" r="5"/></g></svg><div class="chart-tip" id="chart-tip" hidden></div>`;
  const svg = el.querySelector("svg"), g = el.querySelector("#chart-hover"), tip = el.querySelector("#chart-tip");
  const show = (i) => {
    const x = X(i), y = Y(series[i].n), scale = svg.getBoundingClientRect().width / W, pad = parseFloat(getComputedStyle(el).paddingLeft);
    g.hidden = false;
    g.querySelector("line").setAttribute("x1", x); g.querySelector("line").setAttribute("x2", x);
    g.querySelector("circle").setAttribute("cx", x); g.querySelector("circle").setAttribute("cy", y);
    tip.hidden = false;
    tip.innerHTML = `${esc(cap(shortDate.format(dateOfKey(series[i].d))))} · <b>${fr(series[i].n)}</b>`;
    const left = pad + x * scale, half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(el.clientWidth - half - 4, Math.max(half + 4, left))}px`;
  };
  const hide = () => { g.hidden = true; tip.hidden = true; };
  let cur = series.length - 1;
  el.onpointermove = (e) => {
    const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    cur = Math.max(0, Math.min(series.length - 1, Math.round(((px - m.l) / iw) * (series.length - 1))));
    show(cur);
  };
  el.onpointerleave = hide;
  el.onblur = hide;
  el.onfocus = () => show(cur);
  el.onkeydown = (e) => {
    if (e.key === "ArrowLeft") cur = Math.max(0, cur - 1); else if (e.key === "ArrowRight") cur = Math.min(series.length - 1, cur + 1); else return;
    e.preventDefault(); show(cur);
  };
}
let chartResize;
addEventListener("resize", () => { clearTimeout(chartResize); chartResize = setTimeout(() => { if (!$("dashboard").hidden && chartData.length) drawChart(chartData); }, 150); });

/* ---------------- À traiter ---------------- */
const QUOTE_LABELS = { pose: "Pose", message: "Message", taille: "Taille", indices: "Indices", saison: "Saison", quantite: "Quantité", gamme: "Gamme", vehicule: "Véhicule", immatriculation: "Plaque" };
function renderTodo() {
  const { rdv, asks, total } = todoItems();
  const count = $("todo-count");
  count.hidden = !total; count.textContent = String(total);
  if (!total) { $("todo").innerHTML = '<p class="empty">Rien à traiter. Tout est à jour.</p>'; return; }
  const a = rdv.map((b) => {
    const when = new Date(b.start_at);
    return `<div class="todo-i">
      <p class="todo-k"><span>Rendez-vous à confirmer</span></p>
      <p class="todo-n">${esc(b.customer_name)}</p>
      <p class="todo-d">${esc(cap(shortDate.format(when)))}, ${hourTxt(when)} · ${esc(serviceText(b))}</p>
      <div class="todo-a"><a class="rdv-tel" href="tel:${esc(telOf(b.customer_phone))}">${esc(b.customer_phone)}</a><span class="rdv-btns"><button class="d-btn d-btn-text" type="button" style="color:var(--ink-2)" data-goto="${esc(keyOf(when))}" data-rdv-go="${esc(b.id)}">Voir</button><button class="d-btn" type="button" data-id="${esc(b.id)}" data-status="confirme">Confirmer</button></span></div>
    </div>`;
  });
  const q = asks.map((q) => {
    const d = q.details || {}, name = q.customer_name || q.name, phone = q.customer_phone || q.phone;
    const main = d.articles || d.besoin || "";
    const rest = Object.entries(d).filter(([k, v]) => v && QUOTE_LABELS[k]).map(([k, v]) => `${QUOTE_LABELS[k]} : ${v}`).join(" · ");
    const ago = Math.round((Date.now() - new Date(q.created_at)) / 6e4);
    const when = ago < 60 ? `il y a ${Math.max(1, ago)} min` : ago < 1440 ? `il y a ${Math.round(ago / 60)} h` : cap(shortDate.format(new Date(q.created_at)));
    return `<div class="todo-i">
      <p class="todo-k"><span>${isShop(q) ? "Commande de pneus" : "Demande de devis"}</span><span>${esc(when)}</span></p>
      <p class="todo-n">${esc(name)}${d.total ? ` · ${esc(d.total)}` : ""}</p>
      ${main ? `<p class="todo-d">${esc(main)}</p>` : ""}
      ${rest ? `<p class="todo-d">${esc(rest)}</p>` : ""}
      <div class="todo-a"><a class="rdv-tel" href="tel:${esc(telOf(phone))}">${esc(phone)}</a>${isShop(q) ? '<a class="d-btn d-btn-line" href="#commandes">Voir la commande</a>' : `<button class="d-btn d-btn-line" type="button" data-quote="${esc(q.id)}">Rappelé</button>`}</div>
    </div>`;
  });
  $("todo").innerHTML = [...a, ...q].join("");
}

/* ---------------- Fermetures ---------------- */
function renderBlocks() {
  const list = data.blocks.filter((b) => new Date(b.end_at) > new Date()).sort((a, b) => a.start_at.localeCompare(b.start_at));
  $("blocks").innerHTML = list.map((b) => `<li><span>${esc(cap(shortDate.format(new Date(b.start_at))))}, ${hourTxt(new Date(b.start_at))} – ${hourTxt(new Date(b.end_at))}${b.reason ? ` · ${esc(b.reason)}` : ""}</span><button class="d-link" type="button" data-block="${esc(b.id)}">Rouvrir</button></li>`).join("");
}
$("block-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("block-error");
  const [y, m, d] = $("b-day").value.split("-").map(Number);
  const [fh, fm] = $("b-from").value.split(":").map(Number);
  const [th, tm] = $("b-to").value.split(":").map(Number);
  if (!y || Number.isNaN(fh) || Number.isNaN(th) || th * 60 + tm <= fh * 60 + fm) {
    err.textContent = "Vérifiez le jour et les heures : la fin doit être après le début.";
    err.hidden = false;
    return;
  }
  err.hidden = true;
  try {
    await api.adminBlock(T.parisDate(y, m, d, fh, fm), T.parisDate(y, m, d, th, tm), $("b-reason").value.trim() || null);
    $("b-reason").value = "";
    data.blocks = await api.adminBlocks().catch(() => data.blocks);
    render();
  } catch (x) {
    err.textContent = "La fermeture n'a pas été enregistrée.";
    err.hidden = false;
  }
});

/* ---------------- Actions ---------------- */
$("dashboard").addEventListener("click", async (e) => {
  const per = e.target.closest("[data-period]");
  if (per) { period = Number(per.dataset.period); renderStats(); return; }

  const day = e.target.closest("[data-day]");
  if (day) { showDay(day.dataset.day); return; }

  const week = e.target.closest("[data-week]");
  if (week) {
    offset = Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, offset + Number(week.dataset.week)));
    showDay(keyOf(addDays(startOfDay(new Date()), offset === 0 ? 0 : offset)));
    return;
  }

  const go = e.target.closest("[data-goto]");
  if (go) {
    showDay(go.dataset.goto);
    const row = document.querySelector(`[data-rdv="${CSS.escape(go.dataset.rdvGo)}"]`);
    if (row) { row.scrollIntoView({ behavior: "smooth", block: "center" }); row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash"); }
    return;
  }

  const st = e.target.closest("[data-status]");
  if (st) {
    if (st.dataset.status === "annule" && st.dataset.sure !== "1") {
      st.dataset.sure = "1"; st.textContent = "Vraiment annuler ?"; st.classList.add("sure");
      setTimeout(() => { if (st.isConnected) { st.dataset.sure = ""; st.textContent = "Annuler"; st.classList.remove("sure"); } }, 4000);
      return;
    }
    st.disabled = true;
    try {
      await api.adminSetStatus(st.dataset.id, st.dataset.status);
      const row = data.bookings.find((x) => x.id === st.dataset.id);
      if (row) row.status = st.dataset.status;
      render();
    } catch (err) { st.disabled = false; st.textContent = "Échec, réessayer"; }
    return;
  }

  const q = e.target.closest("[data-quote]");
  if (q) {
    q.disabled = true;
    try {
      await api.adminSetQuoteStatus(q.dataset.quote, "traite");
      const row = data.quotes.find((x) => String(x.id) === q.dataset.quote);
      if (row) row.status = "traite";
      render();
    } catch (err) { q.disabled = false; q.textContent = "Échec, réessayer"; }
    return;
  }

  const bl = e.target.closest("[data-block]");
  if (bl) {
    bl.disabled = true;
    await api.adminDeleteBlock(bl.dataset.block).catch(() => null);
    data.blocks = await api.adminBlocks().catch(() => data.blocks);
    render();
  }
});

/* ---------------- Démo : données d'exemple ---------------- */
const SEED_FLAG = "pp-demo-seeded", SEED_VERSION = "agenda-1";
async function fillDemo() {
  const m = await import("./demo-seed.js?v=1");
  m.seedDemo();
  try { localStorage.setItem(SEED_FLAG, SEED_VERSION); } catch (x) { /* rien */ }
}
// La démo arrive déjà remplie, une seule fois : après « Vider », elle reste vide.
async function autoSeed() {
  if (!isDemo) return;
  let flag = null;
  try { flag = localStorage.getItem(SEED_FLAG); } catch (x) { return; }
  if (flag === SEED_VERSION || flag === "vide") return;
  await fillDemo().catch(() => null);
}
if (isDemo) {
  $("demo-fill").addEventListener("click", async () => { await fillDemo(); load(); });
  $("demo-clear").addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tout effacer ?"; setTimeout(() => { b.dataset.sure = ""; b.textContent = "Vider"; }, 4000); return; }
    for (const k of ["pp-demo-bookings", "pp-demo-quotes", "pp-demo-blocks", "pp-demo-events", "pp-demo-qamar", "pp-demo-stock"]) { try { localStorage.removeItem(k); } catch (x) { /* rien */ } }
    try { localStorage.setItem(SEED_FLAG, "vide"); } catch (x) { /* rien */ }
    b.dataset.sure = ""; b.textContent = "Vider";
    load();
  });
}
start();
// Le tableau se remet à jour tout seul (heure, prochain rendez-vous)
setInterval(() => { if (!$("dashboard").hidden && !$("dashboard").querySelector(".sure")) { renderHello(); renderDay(); } }, 60e3);
