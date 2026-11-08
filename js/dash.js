// Espace gérant : un écran qui résume le garage (rendez-vous, commandes de pneus, devis, chiffres, météo).
import { initUI, weather, weatherIcon } from "./ui.js";

initUI();
const { api, isDemo, time: T } = window.BookingAPI;
const cfg = window.BOOKING_CONFIG || {};
const CAPACITY = cfg.capacity || 2;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euro = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const STATUS = { en_attente: "À confirmer", confirme: "Confirmé", annule: "Annulé", termine: "Terminé" };
const SERVICES = new Map((cfg.services || []).map((s) => [s.id, s]));
const back = location.origin + location.pathname;
const DAY = 864e5;

// Heures d'ouverture, en minutes, pour un jour (1 = lundi)
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const openSlots = (dow) => (cfg.hours?.[dow] || []).map(([a, b]) => [toMin(a), toMin(b)]);
const keyOf = (date) => { const p = T.parisParts(date); return T.dayKey(p.y, p.m, p.d); };
const minsOf = (date) => { const p = T.parisParts(date); return p.h * 60 + p.min; };
const hourTxt = (date) => { const p = T.parisParts(date); return `${p.h} h ${T.pad(p.min)}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLabel = (date) => cap(T.dateLabel.format(date));
const shortDay = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric" });
const isClosed = (date) => { const p = T.parisParts(date); return !openSlots(p.dow).length || T.holidays(p.y).has(T.dayKey(p.y, p.m, p.d)) || (cfg.closedDates || []).includes(T.dayKey(p.y, p.m, p.d)); };
const startOfDay = (date) => { const p = T.parisParts(date); return T.parisDate(p.y, p.m, p.d, 0, 0); };
const addDays = (date, n) => { const p = T.parisParts(new Date(date.getTime() + n * DAY + 12 * 36e5)); return T.parisDate(p.y, p.m, p.d, 0, 0); };
const ICON = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  cal: ICON('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  week: ICON('<path d="M4 19V9M9 19V5M14 19v-7M19 19V8"/>'),
  euro: ICON('<path d="M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10.5h9M4 13.5h9"/>'),
  gauge: ICON('<path d="M4.5 16a8 8 0 1 1 15 0"/><path d="m12 13 4-4"/>'),
  bell: ICON('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  tire: ICON('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5"/>'),
};

let data = { bookings: [], quotes: [], blocks: [] };

/* ---------------- Connexion ---------------- */
$("demo-banner").hidden = !isDemo;
async function start() {
  const user = await api.getUser().catch(() => null);
  $("login").hidden = Boolean(user);
  $("garage-user").hidden = !user;
  $("dashboard").hidden = true;
  $("denied").hidden = true;
  if (!user) return;
  $("admin-email").textContent = user.email || "";
  $("admin-initial").textContent = (user.name || user.email || "G").trim().charAt(0).toUpperCase();
  if (!(await api.isAdmin())) { $("denied").hidden = false; return; }
  $("dashboard").hidden = false;
  $("demo-tools").hidden = !isDemo;
  const p = T.parisParts(new Date());
  $("b-day").value = T.dayKey(p.y, p.m, p.d);
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
  const [bookings, quotes, blocks] = await Promise.all([
    api.adminBookings(addDays(today, -14), addDays(today, 31)).catch(() => null),
    api.adminQuotes().catch(() => null),
    api.adminBlocks().catch(() => []),
  ]);
  if (!bookings) { $("bookings").innerHTML = '<p class="empty">Chargement impossible. Vérifiez la connexion.</p>'; }
  data = { bookings: bookings || [], quotes: quotes || [], blocks: blocks || [] };
  render();
}
function render() {
  renderHello(); renderKpis(); renderTimeline(); renderChart(); renderMix(); renderList(); renderInbox(); renderBlocks();
}

const live = (b) => b.status !== "annule";
const isShop = (q) => q.details && q.details.type === "Commande boutique";
const quoteTotal = (q) => { const n = parseInt(String(q.details?.total || "").replace(/\s/g, ""), 10); return Number.isFinite(n) ? n : 0; };
function todayInfo() {
  const now = new Date(), key = keyOf(now);
  const list = data.bookings.filter((b) => live(b) && keyOf(new Date(b.start_at)) === key);
  const next = list.filter((b) => new Date(b.end_at) > now && b.status !== "termine").sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  return { now, key, list, next };
}

/* ---------------- Bonjour ---------------- */
function renderHello() {
  const { now, list, next } = todayInfo();
  const p = T.parisParts(now);
  $("hello-date").textContent = dayLabel(now);
  $("hello-t").textContent = p.h < 12 ? "Bonjour." : p.h < 18 ? "Bon après-midi." : "Bonsoir.";
  const wait = data.bookings.filter((b) => b.status === "en_attente" && new Date(b.start_at) > now).length;
  const shop = data.quotes.filter((q) => isShop(q) && q.status !== "traite").length;
  const parts = [];
  if (isClosed(now)) parts.push("Le garage est fermé aujourd'hui");
  else parts.push(list.length ? `<b>${list.length} rendez-vous</b> aujourd'hui` : "Aucun rendez-vous aujourd'hui");
  if (next) parts.push(`prochain à <b>${hourTxt(new Date(next.start_at))}</b> : ${esc(next.customer_name)}${next.vehicle?.model ? `, ${esc(next.vehicle.model)}` : ""}`);
  let s = parts.join(", ") + ".";
  const todo = [];
  if (wait) todo.push(`${wait} rendez-vous à confirmer`);
  if (shop) todo.push(`${shop} commande${shop > 1 ? "s" : ""} de pneus à rappeler`);
  if (todo.length) s += ` À faire : ${todo.join(" et ")}.`;
  $("hello-sum").innerHTML = s;
}

/* ---------------- Chiffres clés ---------------- */
function renderKpis() {
  const { now, list, next } = todayInfo();
  const in7 = new Date(now.getTime() + 7 * DAY);
  const week = data.bookings.filter((b) => live(b) && new Date(b.start_at) >= startOfDay(now) && new Date(b.start_at) < in7);
  const weekWait = week.filter((b) => b.status === "en_attente").length;
  const revenue = week.reduce((t, b) => t + (Number(b.estimated_total) || 0), 0);
  const onQuote = week.filter((b) => b.quote_needed || !b.estimated_total).length;
  // Remplissage : minutes réservées sur les heures d'ouverture × postes de travail
  const dow = T.parisParts(now).dow;
  const openMin = openSlots(dow).reduce((t, [a, b]) => t + (b - a), 0) * CAPACITY;
  const booked = list.reduce((t, b) => t + (Number(b.minutes) || (new Date(b.end_at) - new Date(b.start_at)) / 6e4), 0);
  const fill = openMin && !isClosed(now) ? Math.min(100, Math.round((booked / openMin) * 100)) : null;
  const wait = data.bookings.filter((b) => b.status === "en_attente" && new Date(b.end_at) > now).length;
  const qOpen = data.quotes.filter((q) => q.status !== "traite");
  const shop = qOpen.filter(isShop);
  const shopValue = shop.reduce((t, q) => t + quoteTotal(q), 0);
  const todo = wait + qOpen.length;
  const h = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${T.pad(Math.round(m % 60))}` : ""}` : `${Math.round(m)} min`);

  const tiles = [
    { icon: I.cal, label: "Aujourd'hui", value: list.length, unit: list.length > 1 ? "RDV" : "RDV", sub: next ? `Prochain à ${hourTxt(new Date(next.start_at))}` : isClosed(now) ? "Garage fermé" : "Plus rien de prévu", go: "today" },
    { icon: I.week, label: "7 prochains jours", value: week.length, unit: "RDV", sub: weekWait ? `dont ${weekWait} à confirmer` : "Tous confirmés", go: "list" },
    { icon: I.euro, label: "Estimé sur 7 jours", value: revenue ? euro(revenue) : "–", sub: onQuote ? `+ ${onQuote} sur devis` : "Prix des prestations à tarif fixe", go: "chart" },
    { icon: I.gauge, label: "Atelier rempli aujourd'hui", value: fill === null ? "–" : `${fill}`, unit: fill === null ? "" : "%", sub: fill === null ? "Fermé aujourd'hui" : `${h(booked)} réservées sur ${h(openMin)}`, meter: fill },
    { icon: I.bell, label: "À traiter", value: todo, sub: todo ? `${wait} RDV · ${qOpen.length} demande${qOpen.length > 1 ? "s" : ""}` : "Tout est à jour", hot: todo > 0, go: wait ? "wait" : "inbox" },
    { icon: I.tire, label: "Commandes de pneus", value: shop.length, sub: shop.length ? `≈ ${euro(shopValue)} à confirmer` : "Aucune en attente", hot: shop.length > 0, go: "inbox" },
  ];
  $("kpis").innerHTML = tiles.map((t, i) => `
    <button type="button" class="kpi${t.hot ? " hot" : ""}" style="--i:${i}" ${t.go ? `data-go="${t.go}"` : ""}>
      ${i === 0 ? '<span class="kpi-glow" aria-hidden="true"></span>' : ""}
      <span class="kpi-l">${t.icon}${esc(t.label)}</span>
      <span class="kpi-v">${esc(String(t.value))}${t.unit ? `<small>${esc(t.unit)}</small>` : ""}</span>
      ${t.meter != null ? `<span class="kpi-meter"><i data-w="${t.meter}"></i></span>` : ""}
      <span class="kpi-s">${esc(t.sub)}</span>
    </button>`).join("");
  requestAnimationFrame(() => document.querySelectorAll(".kpi-meter i").forEach((el) => { el.style.width = `${el.dataset.w}%`; }));
}
$("kpis").addEventListener("click", (e) => {
  const k = e.target.closest("[data-go]");
  if (!k) return;
  const go = k.dataset.go;
  if (go === "wait") { document.querySelector('input[name="range"][value="wait"]').checked = true; renderList(); }
  if (go === "inbox") { document.querySelector('input[name="inbox"][value="shop"]').checked = true; renderInbox(); }
  const target = { today: ".p-today", list: ".p-list", wait: ".p-list", chart: ".p-chart", inbox: ".p-inbox" }[go];
  document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------------- Planning du jour ---------------- */
const SPAN = [480, 1110]; // 8 h → 18 h 30
const pct = (m) => ((Math.min(Math.max(m, SPAN[0]), SPAN[1]) - SPAN[0]) / (SPAN[1] - SPAN[0])) * 100;
function renderTimeline() {
  const now = new Date(), box = $("timeline");
  // Jour fermé : on montre directement le planning du prochain jour ouvré
  const isToday = !isClosed(now);
  const day = isToday ? now : [1, 2, 3, 4, 5, 6, 7].map((n) => addDays(now, n)).find((d) => !isClosed(d));
  $("today-t").textContent = isToday ? "Planning du jour" : "Prochain jour ouvré";
  if (!day) { box.innerHTML = '<p class="tl-empty">Aucun jour ouvré dans la semaine.</p>'; return; }
  const key = keyOf(day), dow = T.parisParts(day).dow;
  const list = data.bookings.filter((b) => live(b) && keyOf(new Date(b.start_at)) === key);
  $("today-sub").textContent = `${dayLabel(day)} · ${list.length} rendez-vous · ${CAPACITY} postes`;
  // répartit les rendez-vous sur les postes, sans chevauchement
  const lanes = Array.from({ length: CAPACITY }, () => []);
  for (const b of list.slice().sort((a, b) => a.start_at.localeCompare(b.start_at))) {
    const s = new Date(b.start_at).getTime();
    let lane = lanes.find((l) => !l.length || new Date(l[l.length - 1].end_at).getTime() <= s);
    if (!lane) { lane = []; lanes.push(lane); }
    lane.push(b);
  }
  const slots = openSlots(dow);
  const lunch = slots.length > 1 ? [slots[0][1], slots[1][0]] : null;
  const blocks = data.blocks.filter((b) => keyOf(new Date(b.start_at)) === key || (new Date(b.start_at) <= day && new Date(b.end_at) >= day));
  const ticks = [8, 10, 12, 14, 16, 18].map((h) => `<span style="left:${pct(h * 60)}%">${h} h</span>`).join("");
  const nm = minsOf(now);
  box.innerHTML = `<div class="tl-inner" style="position:relative">
    <div class="tl-scale" aria-hidden="true">${ticks}</div>
    <div class="tl-lanes">
      ${lanes.map((lane, i) => `<div class="tl-lane" aria-label="Poste ${i + 1}">
        ${lunch ? `<span class="tl-lunch" style="left:${pct(lunch[0])}%;width:${pct(lunch[1]) - pct(lunch[0])}%"></span>` : ""}
        ${blocks.map((b) => { const a = keyOf(new Date(b.start_at)) === key ? minsOf(new Date(b.start_at)) : SPAN[0]; const z = keyOf(new Date(b.end_at)) === key ? minsOf(new Date(b.end_at)) : SPAN[1]; return `<span class="tl-block" style="left:${pct(a)}%;width:${pct(z) - pct(a)}%">${i === 0 ? esc(b.reason || "Bloqué") : ""}</span>`; }).join("")}
        ${lane.map((b) => {
          const a = minsOf(new Date(b.start_at)), z = minsOf(new Date(b.end_at));
          const svc = (b.services || []).map((s) => SERVICES.get(s.id)?.title || s.label || s.id).join(", ");
          return `<button type="button" class="tl-b st-${esc(b.status)}" data-jump="${esc(b.id)}" style="left:${pct(a)}%;width:${pct(z) - pct(a)}%"
            title="${esc(`${hourTxt(new Date(b.start_at))} – ${hourTxt(new Date(b.end_at))} · ${b.customer_name} · ${svc} · ${STATUS[b.status] || b.status}`)}">
            <strong>${esc(b.customer_name)}</strong><span>${hourTxt(new Date(b.start_at))} · ${esc(svc)}</span></button>`;
        }).join("")}
      </div>`).join("")}
    </div>
    ${isToday && nm > SPAN[0] && nm < SPAN[1] ? `<span class="tl-now" style="left:${pct(nm)}%" data-t="${hourTxt(now)}"></span>` : ""}
  </div>
  ${list.length ? "" : `<p class="tl-empty">Aucun rendez-vous ${isToday ? "aujourd'hui" : "ce jour-là"} pour le moment.</p>`}`;
}
document.addEventListener("click", (e) => {
  const j = e.target.closest("[data-jump]");
  if (!j) return;
  const range = document.querySelector('input[name="range"][value="7"]');
  if (!range.checked) { range.checked = true; renderList(); }
  const el = document.querySelector(`.bk[data-id="${CSS.escape(j.dataset.jump)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
});

/* ---------------- 14 jours ---------------- */
function renderChart() {
  const today = startOfDay(new Date());
  const days = Array.from({ length: 15 }, (_, i) => addDays(today, i - 7));
  const rows = days.map((d, i) => {
    const k = keyOf(d);
    const list = data.bookings.filter((b) => live(b) && keyOf(new Date(b.start_at)) === k);
    return { d, i, k, n: list.length, sum: list.reduce((t, b) => t + (Number(b.estimated_total) || 0), 0), past: i < 7, today: i === 7, closed: isClosed(d) };
  }).filter((r) => !(r.closed && !r.n && r.i !== 7) || true);
  const max = Math.max(4, ...rows.map((r) => r.n));
  const step = max <= 6 ? 2 : max <= 12 ? 4 : 5;
  const top = Math.ceil(max / step) * step;
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  const peak = Math.max(...rows.map((r) => r.n));
  $("chart14").innerHTML = `
    <div class="chart-y" aria-hidden="true">${ticks.map((v) => `<span style="bottom:${(v / top) * 100}%">${v}</span>`).join("")}</div>
    <div class="chart-plot" style="grid-template-columns:repeat(${rows.length},1fr)">
      <div class="chart-grid" aria-hidden="true">${ticks.map((v) => `<i class="${v === 0 ? "base" : ""}" style="bottom:${(v / top) * 100}%"></i>`).join("")}</div>
      ${rows.map((r) => {
        const label = shortDay.format(r.d).replace(".", "");
        const showVal = r.today || (r.n === peak && r.n > 0);
        return `<button type="button" class="col${r.past ? " past" : ""}${r.today ? " today" : ""}${r.closed ? " closed" : ""}" style="--i:${r.i}"
          data-tip="${esc(dayLabel(r.d))}|${r.closed && !r.n ? "Fermé" : `${r.n} rendez-vous`}|${r.sum ? `${euro(r.sum)} estimés` : ""}"
          aria-label="${esc(dayLabel(r.d))} : ${r.n} rendez-vous${r.sum ? `, ${euro(r.sum)} estimés` : ""}">
          ${showVal ? `<span class="val">${r.n}</span>` : ""}
          <span class="bar" style="height:${r.n ? Math.max(2, (r.n / top) * 100) : 0}%"></span>
          <span class="day">${r.today ? "Auj." : esc(label)}</span>
        </button>`;
      }).join("")}
    </div>`;
}
{
  const tip = $("chart-tip"), panel = document.querySelector(".p-chart");
  const show = (col) => {
    const [d, n, s] = col.dataset.tip.split("|");
    tip.innerHTML = `<b>${esc(d)}</b>${esc(n)}${s ? ` · ${esc(s)}` : ""}`;
    tip.hidden = false;
    const pr = panel.getBoundingClientRect(), cr = col.getBoundingClientRect(), bar = col.querySelector(".bar").getBoundingClientRect();
    const x = Math.min(Math.max(cr.left + cr.width / 2 - pr.left, 90), pr.width - 90);
    tip.style.left = `${x}px`; tip.style.top = `${Math.min(bar.top, cr.bottom - 30) - pr.top}px`;
  };
  $("chart14").addEventListener("pointerover", (e) => { const c = e.target.closest(".col"); if (c) show(c); });
  $("chart14").addEventListener("focusin", (e) => { const c = e.target.closest(".col"); if (c) show(c); });
  $("chart14").addEventListener("pointerleave", () => { tip.hidden = true; });
  $("chart14").addEventListener("focusout", () => { tip.hidden = true; });
}

/* ---------------- Prestations ---------------- */
function renderMix() {
  const counts = new Map();
  for (const b of data.bookings.filter(live)) for (const s of b.services || []) counts.set(s.id, (counts.get(s.id) || 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!rows.length) { $("mix").innerHTML = '<li class="mix-empty">Pas encore de rendez-vous sur la période.</li>'; return; }
  const max = rows[0][1], total = rows.reduce((t, r) => t + r[1], 0);
  $("mix").innerHTML = rows.map(([id, n], i) => `<li>
      <span>${esc(SERVICES.get(id)?.title || id)}</span><span class="n">${n} <small style="color:var(--muted);font-weight:400">· ${Math.round((n / total) * 100)} %</small></span>
      <span class="track"><i style="width:${(n / max) * 100}%;animation-delay:${i * 60}ms"></i></span>
    </li>`).join("");
}

/* ---------------- Liste des rendez-vous ---------------- */
function renderList() {
  const box = $("bookings");
  const mode = document.querySelector('input[name="range"]:checked').value;
  const now = new Date();
  const from = new Date(now.getTime() - 2 * 36e5);
  let list = data.bookings.filter((b) => new Date(b.start_at) >= from);
  if (mode === "wait") list = list.filter((b) => b.status === "en_attente");
  else list = list.filter((b) => new Date(b.start_at) < new Date(now.getTime() + Number(mode) * DAY));
  list.sort((a, b) => a.start_at.localeCompare(b.start_at));
  if (!list.length) { box.innerHTML = `<p class="empty">${mode === "wait" ? "Rien à confirmer. Tout est à jour." : "Aucun rendez-vous sur cette période."}</p>`; return; }
  let current = "";
  box.innerHTML = list.map((b) => {
    const d = dayLabel(new Date(b.start_at));
    const head = d !== current ? `<h3 class="day-head">${esc(d)}</h3>` : "";
    current = d;
    const v = b.vehicle || {};
    const vehicle = [v.brand, v.model, v.version, v.year].filter(Boolean).join(" ");
    const services = (b.services || []).map((s) => `<li>${esc(s.label || SERVICES.get(s.id)?.title || s.id)}${s.note ? ` : <em>${esc(s.note)}</em>` : ""}</li>`).join("");
    const phone = String(b.customer_phone || "").replace(/[^\d+]/g, "");
    const mins = Number(b.minutes) || Math.round((new Date(b.end_at) - new Date(b.start_at)) / 6e4);
    return `${head}<article class="bk st-${esc(b.status)}" data-id="${esc(b.id)}">
      <p class="bk-time">${hourTxt(new Date(b.start_at))}<small>${mins} min</small></p>
      <div class="bk-main">
        <p class="bk-name">${esc(b.customer_name)} · <a href="tel:${esc(phone)}">${esc(b.customer_phone)}</a>${b.customer_email ? ` · <a href="mailto:${esc(b.customer_email)}">${esc(b.customer_email)}</a>` : ""}</p>
        ${vehicle || b.plate ? `<p class="bk-car">${esc(vehicle)}${b.plate ? `${vehicle ? " · " : ""}<b>${esc(b.plate)}</b>` : ""}</p>` : ""}
        <ul class="bk-services">${services}</ul>
        ${b.note ? `<p class="bk-note">« ${esc(b.note)} »</p>` : ""}
      </div>
      <div class="bk-side">
        <span class="pill st-${esc(b.status)}">${STATUS[b.status] || esc(b.status)}</span>
        ${b.estimated_total ? `<span class="bk-price">${euro(b.estimated_total)}</span>` : ""}
        <div class="bk-actions">
          ${b.status === "en_attente" ? `<button class="mini go" data-id="${esc(b.id)}" data-status="confirme">Confirmer</button>` : ""}
          ${b.status === "confirme" ? `<button class="mini ghost" data-id="${esc(b.id)}" data-status="termine">Terminé</button>` : ""}
          ${b.status === "en_attente" || b.status === "confirme" ? `<button class="mini warn" data-id="${esc(b.id)}" data-status="annule">Annuler</button>` : ""}
        </div>
      </div>
    </article>`;
  }).join("");
}
$("bookings").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-status]");
  if (!b) return;
  if (b.dataset.status === "annule" && b.dataset.sure !== "1") {
    b.dataset.sure = "1"; b.textContent = "Sûr ? Annuler"; b.classList.add("sure");
    setTimeout(() => { if (b.isConnected) { b.dataset.sure = ""; b.textContent = "Annuler"; b.classList.remove("sure"); } }, 4000);
    return;
  }
  b.disabled = true;
  try {
    await api.adminSetStatus(b.dataset.id, b.dataset.status);
    const row = data.bookings.find((x) => x.id === b.dataset.id);
    if (row) row.status = b.dataset.status;
    render();
  } catch (err) { b.disabled = false; b.textContent = "Échec, réessayer"; }
});
document.querySelectorAll('input[name="range"]').forEach((r) => r.addEventListener("change", renderList));

/* ---------------- Commandes et devis ---------------- */
const QUOTE_LABELS = { articles: "Articles", pose: "Pose", total: "Total", message: "Message", besoin: "Besoin", taille: "Taille", indices: "Indices", saison: "Saison", quantite: "Quantité", gamme: "Gamme", vehicule: "Véhicule", immatriculation: "Plaque" };
function renderInbox() {
  const mode = document.querySelector('input[name="inbox"]:checked').value;
  let list = data.quotes.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (mode === "shop") list = list.filter((q) => isShop(q) && q.status !== "traite");
  else if (mode === "quote") list = list.filter((q) => !isShop(q) && q.status !== "traite");
  else list = list.filter((q) => q.status === "traite");
  if (!list.length) {
    $("quotes").innerHTML = `<p class="empty">${mode === "done" ? "Aucune demande traitée pour l'instant." : mode === "shop" ? "Aucune commande de pneus à rappeler." : "Aucune demande de devis à rappeler."}</p>`;
    return;
  }
  $("quotes").innerHTML = list.map((q) => {
    const phone = String(q.customer_phone || q.phone || "").replace(/[^\d+]/g, "");
    const name = q.customer_name || q.name;
    const d = q.details || {};
    const lines = Object.entries(d).filter(([k, v]) => v && k !== "type" && k !== "total")
      .map(([k, v]) => `<li><b>${esc(QUOTE_LABELS[k] || k)} :</b> ${esc(v)}</li>`).join("");
    const created = new Date(q.created_at);
    const ago = Math.round((Date.now() - created) / 6e4);
    const when = ago < 60 ? `il y a ${Math.max(1, ago)} min` : ago < 1440 ? `il y a ${Math.round(ago / 60)} h` : `${dayLabel(created)}`;
    const total = quoteTotal(q);
    return `<article class="q">
      <div class="q-top"><span class="q-kind">${isShop(q) ? "Commande boutique" : q.kind === "mecanique" ? "Devis mécanique" : "Devis pneus"}</span><span class="q-when">${esc(when)}</span></div>
      <p class="q-name">${esc(name)} · <a href="tel:${esc(phone)}">${esc(q.customer_phone || q.phone)}</a></p>
      <ul class="q-lines">${lines}</ul>
      <div class="q-foot">
        ${total ? `<span class="q-total">${euro(total)}<small style="font-size:12px;color:var(--muted);font-weight:400"> indicatif</small></span>` : "<span></span>"}
        ${q.status === "traite" ? '<span class="pill st-traite">Traitée</span>' : `<button class="mini go" type="button" data-quote="${esc(q.id)}">Rappelé, marquer traitée</button>`}
      </div>
    </article>`;
  }).join("");
}
document.querySelectorAll('input[name="inbox"]').forEach((r) => r.addEventListener("change", renderInbox));
$("quotes").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-quote]");
  if (!b) return;
  b.disabled = true;
  try {
    await api.adminSetQuoteStatus(b.dataset.quote, "traite");
    const row = data.quotes.find((q) => String(q.id) === b.dataset.quote);
    if (row) row.status = "traite";
    render();
  } catch (err) { b.disabled = false; b.textContent = "Échec, réessayer"; }
});

/* ---------------- Créneaux bloqués ---------------- */
function renderBlocks() {
  const list = data.blocks.filter((b) => new Date(b.end_at) > new Date()).sort((a, b) => a.start_at.localeCompare(b.start_at));
  $("blocks").innerHTML = list.length ? list.map((b) => `<li><span>${esc(dayLabel(new Date(b.start_at)))}, ${hourTxt(new Date(b.start_at))} – ${hourTxt(new Date(b.end_at))}${b.reason ? ` · ${esc(b.reason)}` : ""}</span>
    <button class="mini ghost" type="button" data-block="${esc(b.id)}">Retirer</button></li>`).join("") : "";
}
$("blocks").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-block]");
  if (!b) return;
  b.disabled = true;
  await api.adminDeleteBlock(b.dataset.block).catch(() => null);
  data.blocks = await api.adminBlocks().catch(() => data.blocks);
  render();
});
$("block-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("block-error");
  const [y, m, d] = $("b-day").value.split("-").map(Number);
  const [fh, fm] = $("b-from").value.split(":").map(Number);
  const [th, tm] = $("b-to").value.split(":").map(Number);
  if (!y || Number.isNaN(fh) || Number.isNaN(th) || th * 60 + tm <= fh * 60 + fm) {
    err.textContent = "Vérifiez le jour et les heures : l'heure de fin doit être après l'heure de début.";
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
    err.textContent = "Le blocage n'a pas été enregistré.";
    err.hidden = false;
  }
});

/* ---------------- Météo sur 3 jours ---------------- */
const dayName = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
function renderDays(w) {
  if (!w?.days?.length) return;
  $("wx-days").innerHTML = w.days.slice(0, 3).map((d, i) => `<li><b>${i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : esc(dayName.format(new Date(`${d.t}T12:00:00`)))}</b>${weatherIcon(d.icon)}${d.max}° / ${d.min}°${d.rain != null ? `<br><span style="color:var(--muted)">pluie ${d.rain} %</span>` : ""}</li>`).join("");
}
document.addEventListener("pp:weather", (e) => renderDays(e.detail));
if (weather()) renderDays(weather());

/* ---------------- Démo : données d'exemple ---------------- */
if (isDemo) {
  $("demo-fill").addEventListener("click", () => { seedDemo(); load(); });
  $("demo-clear").addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tout effacer ?"; setTimeout(() => { b.dataset.sure = ""; b.textContent = "Vider"; }, 4000); return; }
    for (const k of ["pp-demo-bookings", "pp-demo-quotes", "pp-demo-blocks"]) { try { localStorage.removeItem(k); } catch (x) { /* rien */ } }
    b.dataset.sure = ""; b.textContent = "Vider";
    load();
  });
}
function seedDemo() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const NAMES = ["Démo · Martin", "Démo · Garcia", "Démo · Roux", "Démo · Lopez", "Démo · Bernard", "Démo · Puig", "Démo · Ferrer", "Démo · Moreau", "Démo · Vidal", "Démo · Sanchez"];
  const CARS = [
    { brand: "Renault", model: "Clio V", year: 2021, tire: "195/55 R16" }, { brand: "Peugeot", model: "208", year: 2020, tire: "195/55 R16" },
    { brand: "Citroën", model: "C3", year: 2019, tire: "205/50 R17" }, { brand: "Dacia", model: "Sandero", year: 2022, tire: "185/65 R15" },
    { brand: "Volkswagen", model: "Golf VII", year: 2016, tire: "205/55 R16" }, { brand: "Toyota", model: "Yaris", year: 2021, tire: "185/65 R15" },
    { brand: "BMW", model: "Série 1", year: 2018, tire: "225/45 R17" }, { brand: "Renault", model: "Trafic", year: 2017, tire: "215/65 R16" },
  ];
  const JOBS = [
    { id: "pneus", w: 5, make: (car) => { const qty = pick([2, 4, 4]); return { svc: { id: "pneus", qty, season: pick(["Été", "4 saisons", "Hiver"]), size: car.tire, label: `Changer des pneus · ${qty} pneus · ${car.tire}`, price: "Pneus sur devis" }, min: qty === 4 ? 45 : 30, eur: qty * 95 }; } },
    { id: "crevaison", w: 2, make: () => ({ svc: { id: "crevaison", label: "Réparer une crevaison", price: "15 €" }, min: 30, eur: 15 }) },
    { id: "geometrie", w: 2, make: () => ({ svc: { id: "geometrie", option: "avant", label: "Géométrie 3D · Parallélisme avant", price: "65 €" }, min: 60, eur: 65 }) },
    { id: "clim", w: 1, make: () => ({ svc: { id: "clim", option: "r1234yf", label: "Recharge de climatisation · Gaz R1234yf", price: "110 €" }, min: 60, eur: 110 }) },
    { id: "vidange", w: 2, make: () => ({ svc: { id: "vidange", label: "Vidange et entretien", price: "Sur devis" }, min: 60, eur: 0 }) },
    { id: "freins", w: 1, make: () => ({ svc: { id: "freins", label: "Freins", price: "Sur devis" }, min: 90, eur: 0 }) },
  ];
  const bag = JOBS.flatMap((j) => Array(j.w).fill(j));
  const now = new Date(), today = startOfDay(now), out = [];
  for (let k = -10; k <= 12; k++) {
    const day = addDays(today, k);
    if (isClosed(day)) continue;
    const p = T.parisParts(day), dow = p.dow;
    const n = 2 + Math.floor(rnd() * 4) + (k === 0 ? 2 : 0);
    const used = [[], []];
    for (let i = 0; i < n; i++) {
      const job = pick(bag), car = pick(CARS), made = job.make(car);
      const slots = openSlots(dow);
      const [a, z] = pick(slots);
      const startM = a + Math.floor(rnd() * ((z - a - made.min) / 30 + 1)) * 30;
      const lane = used.findIndex((l) => l.every(([s, e]) => startM >= e || startM + made.min <= s));
      if (lane < 0) continue;
      used[lane].push([startM, startM + made.min]);
      const start = T.parisDate(p.y, p.m, p.d, Math.floor(startM / 60), startM % 60);
      const end = new Date(start.getTime() + made.min * 6e4);
      let status = "confirme";
      if (end < now) status = rnd() < 0.08 ? "annule" : "termine";
      else if (k > 0 && rnd() < 0.35) status = "en_attente";
      else if (k === 0 && rnd() < 0.25) status = "en_attente";
      const letters = "ABCDEFGHJKLMNPRSTVWXYZ";
      const plate = `${pick([...letters])}${pick([...letters])}-${100 + Math.floor(rnd() * 899)}-${pick([...letters])}${pick([...letters])}`;
      out.push({
        id: `SEED-${k + 20}-${i}`, start_at: start.toISOString(), end_at: end.toISOString(), minutes: made.min,
        services: [made.svc], vehicle: { brand: car.brand, model: car.model, year: car.year, demo: true }, plate,
        customer_name: pick(NAMES), customer_phone: `06 00 00 ${T.pad(10 + i)} ${T.pad(20 + ((k + 30) % 70))}`, customer_email: null,
        note: rnd() < 0.15 ? "Voiture qui tire à droite depuis une semaine." : null,
        estimated_total: made.eur || null, quote_needed: !made.eur, status, created_at: new Date(start.getTime() - 3 * DAY).toISOString(),
      });
    }
  }
  const quotes = [
    { kind: "pneus", details: { type: "Commande boutique", articles: "4 × Michelin CrossClimate 2 (205/55 R16 94V)", pose: "Pose au garage avec rendez-vous", total: "504 € (indicatif)", message: "Plaque AB-482-KD" }, name: "Démo · Sanchez", customer_name: "Démo · Sanchez", customer_phone: "06 00 00 11 22", status: "nouveau", created_at: new Date(now - 42 * 6e4).toISOString(), id: "SEEDQ1" },
    { kind: "pneus", details: { type: "Commande boutique", articles: "2 × Nankang NS-2R (225/45 R17 94W) ; 1 × Lot drift (225/45 R17)", pose: "Retrait au comptoir", total: "316 € (indicatif)" }, name: "Démo · Ferrer", customer_name: "Démo · Ferrer", customer_phone: "06 00 00 33 44", status: "nouveau", created_at: new Date(now - 5 * 36e5).toISOString(), id: "SEEDQ2" },
    { kind: "mecanique", details: { besoin: "Bruit au freinage à l'avant", vehicule: "Peugeot 3008 2019" }, name: "Démo · Moreau", customer_name: "Démo · Moreau", customer_phone: "06 00 00 55 66", status: "nouveau", created_at: new Date(now - 26 * 36e5).toISOString(), id: "SEEDQ3" },
    { kind: "pneus", details: { type: "Commande boutique", articles: "4 × Hankook Ventus Prime 4 (205/55 R16 91V)", pose: "Pose au garage avec rendez-vous", total: "312 € (indicatif)" }, name: "Démo · Vidal", customer_name: "Démo · Vidal", customer_phone: "06 00 00 77 88", status: "traite", created_at: new Date(now - 3 * DAY).toISOString(), id: "SEEDQ4" },
  ];
  const lunchDay = addDays(today, [1, 2, 3, 4, 5, 6, 7].find((n) => !isClosed(addDays(today, n))) || 1);
  const lp = T.parisParts(lunchDay);
  const blocks = [{ id: "SEEDB1", start_at: T.parisDate(lp.y, lp.m, lp.d, 16, 0).toISOString(), end_at: T.parisDate(lp.y, lp.m, lp.d, 18, 30).toISOString(), reason: "Formation pneus run-flat" }];
  const merge = (k, rows) => {
    let cur = []; try { cur = JSON.parse(localStorage.getItem(k) || "[]").filter((r) => !String(r.id).startsWith("SEED")); } catch (x) { /* rien */ }
    try { localStorage.setItem(k, JSON.stringify(cur.concat(rows))); } catch (x) { /* rien */ }
  };
  merge("pp-demo-bookings", out); merge("pp-demo-quotes", quotes); merge("pp-demo-blocks", blocks);
}

start();
// Le tableau se remet à jour tout seul (heure, prochain rendez-vous)
setInterval(() => { if (!$("dashboard").hidden) { renderHello(); renderKpis(); renderTimeline(); } }, 60e3);
