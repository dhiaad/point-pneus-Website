// Briques communes à toutes les pages : navigation, menu, heure et météo en direct,
// panneau des horaires, « Lire son pneu », mise en forme de la plaque.

export const PHONE = "04 68 50 50 68";
export const TEL = "+33468505068";
export const MAPS = "https://www.google.com/maps/dir/?api=1&destination=9%20Rue%20Henri%20Becquerel%2C%2066330%20Cabestany";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- Heure de Perpignan et horaires ---------------- */
const SLOTS = [[480, 720], [840, 1110]];
export const HOURS = { 1: SLOTS, 2: SLOTS, 3: SLOTS, 4: SLOTS, 5: SLOTS, 6: [], 7: [] };
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function parisNow(date = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t) => f.find((p) => p.type === t)?.value ?? "";
  const h = Number(get("hour")), m = Number(get("minute"));
  return { dow: WD.indexOf(get("weekday")) + 1, h, m, mins: h * 60 + m };
}
export const hm = (mins) => { const h = Math.floor(mins / 60), m = mins % 60; return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`; };
const clock = (n) => `${String(n.h).padStart(2, "0")}:${String(n.m).padStart(2, "0")}`;

export function openState(now = parisNow()) {
  const cur = (HOURS[now.dow] || []).find(([a, b]) => now.mins >= a && now.mins < b);
  if (cur) {
    const left = cur[1] - now.mins;
    return { open: true, title: "Ouvert", sub: left <= 60 ? `Ferme dans ${left} min` : `Ferme à ${hm(cur[1])}` };
  }
  for (let k = 0; k < 8; k++) {
    const dow = ((now.dow - 1 + k) % 7) + 1;
    for (const [a] of HOURS[dow] || []) {
      if (k === 0 && a <= now.mins) continue;
      const when = k === 0 ? "aujourd'hui" : k === 1 ? "demain" : DAYS[dow - 1].toLowerCase();
      return { open: false, title: "Fermé", sub: `Ouvre ${when} à ${hm(a)}` };
    }
  }
  return { open: false, title: "Fermé", sub: "" };
}

function tickClock() {
  const n = parisNow(), st = openState(n);
  $$("[data-clock]").forEach((el) => { el.textContent = clock(n); });
  $$("[data-open-dot]").forEach((el) => el.classList.toggle("on", st.open));
  $$("[data-open-text]").forEach((el) => { el.textContent = `${st.title} · ${st.sub}`; });
  $$("[data-open-title]").forEach((el) => { el.textContent = st.title; });
}

/* ---------------- Météo en direct (Open-Meteo, sans clé) ---------------- */
const WX_URL = "https://api.open-meteo.com/v1/forecast?latitude=42.6806&longitude=2.9424"
  + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day"
  + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=Europe%2FParis";

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CLOUD = '<path d="M7.5 18h9a3.75 3.75 0 0 0 .4-7.48A5.5 5.5 0 0 0 6.3 11.2 3.4 3.4 0 0 0 7.5 18z"/>';
const ICONS = {
  sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  moon: I('<path d="M19.5 14.2A7.5 7.5 0 0 1 9.8 4.5a7.5 7.5 0 1 0 9.7 9.7z"/>'),
  partly: I('<path d="M8.5 3.5v1.3M3.2 8.8h1.3M4.8 5.1l.9.9M12.2 5.1l-.9.9"/><path d="M5.9 11.2a3.3 3.3 0 0 1 5.6-3.3"/>' + CLOUD.replace("M7.5 18", "M9 19").replace("a3.75", "a3.4")),
  cloud: I(CLOUD),
  fog: I('<path d="M4 9h16M3 13h18M5 17h14"/>'),
  drizzle: I(CLOUD.replace("18h9", "15h9") + '<path d="M9 19v1M13 19v1"/>'),
  rain: I('<path d="M7.5 15h9a3.75 3.75 0 0 0 .4-7.48A5.5 5.5 0 0 0 6.3 8.2 3.4 3.4 0 0 0 7.5 15z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>'),
  snow: I('<path d="M7.5 15h9a3.75 3.75 0 0 0 .4-7.48A5.5 5.5 0 0 0 6.3 8.2 3.4 3.4 0 0 0 7.5 15z"/><path d="M8 19h.01M12 20h.01M16 19h.01"/>'),
  storm: I('<path d="M7.5 15h9a3.75 3.75 0 0 0 .4-7.48A5.5 5.5 0 0 0 6.3 8.2 3.4 3.4 0 0 0 7.5 15z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>'),
};
function wmo(code, day = 1) {
  if (code === 0) return { label: "Ciel dégagé", icon: day ? "sun" : "moon", kind: "clear" };
  if (code <= 2) return { label: code === 1 ? "Plutôt dégagé" : "Éclaircies", icon: day ? "partly" : "moon", kind: "clear" };
  if (code === 3) return { label: "Couvert", icon: "cloud", kind: "cloud" };
  if (code <= 48) return { label: "Brouillard", icon: "fog", kind: "fog" };
  if (code <= 57) return { label: "Bruine", icon: "drizzle", kind: "wet" };
  if (code <= 67) return { label: code >= 65 ? "Forte pluie" : "Pluie", icon: "rain", kind: "wet" };
  if (code <= 77) return { label: "Neige", icon: "snow", kind: "snow" };
  if (code <= 82) return { label: "Averses", icon: "rain", kind: "wet" };
  if (code <= 86) return { label: "Averses de neige", icon: "snow", kind: "snow" };
  return { label: "Orage", icon: "storm", kind: "wet" };
}
function wxTip(w) {
  if (w.kind === "snow" || w.temp <= 3) return "Gel ou neige : un pneu hiver ou 4 saisons 3PMSF garde son adhérence là où un pneu été glisse.";
  if (w.kind === "wet") return "Route mouillée : sous 3 mm de gomme, la distance de freinage s'allonge nettement. Un doute ? On mesure gratuitement.";
  if (w.kind === "fog") return "Brouillard : allumez vos feux de croisement et vérifiez qu'ils éclairent bien. On rénove aussi les optiques ternies.";
  if (w.temp < 7) return "Sous 7 °C, la gomme d'un pneu été durcit : un pneu hiver ou 4 saisons accroche mieux.";
  if (w.temp >= 30) return "Forte chaleur : vérifiez la pression à froid, et pensez à la recharge de clim avant les longs trajets.";
  if (w.wind >= 50) return "Vent fort : gardez de la marge au volant, surtout avec un utilitaire ou une remorque.";
  return "Bonnes conditions pour rouler. Pensez à contrôler la pression une fois par mois, à froid.";
}
let wx = null;
async function loadWeather() {
  try {
    const cached = JSON.parse(sessionStorage.getItem("pp-wx") || "null");
    if (cached && Date.now() - cached.t < 10 * 60e3) { wx = cached.w; renderWeather(); return; }
  } catch (e) { /* stockage indisponible */ }
  try {
    const r = await fetch(WX_URL);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json(), c = d.current;
    const w = wmo(c.weather_code, c.is_day);
    wx = {
      temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), wind: Math.round(c.wind_speed_10m),
      code: c.weather_code, day: c.is_day, ...w,
      days: (d.daily?.time || []).map((t, i) => ({ t, max: Math.round(d.daily.temperature_2m_max[i]), min: Math.round(d.daily.temperature_2m_min[i]), rain: d.daily.precipitation_probability_max?.[i] ?? null, ...wmo(d.daily.weather_code[i], 1) })),
    };
    wx.tip = wxTip(wx);
    try { sessionStorage.setItem("pp-wx", JSON.stringify({ t: Date.now(), w: wx })); } catch (e) { /* rien */ }
    renderWeather();
  } catch (e) {
    $$("[data-wx-chip]").forEach((el) => { el.hidden = true; });
    $$("[data-wx-card]").forEach((el) => { el.innerHTML = '<p class="wx-off">Météo indisponible pour le moment.</p>'; });
  }
}
export const weather = () => wx;
export const weatherIcon = (name) => ICONS[name] || ICONS.cloud;
function renderWeather() {
  if (!wx) return;
  $$("[data-wx-chip]").forEach((el) => { el.hidden = false; el.innerHTML = `${ICONS[wx.icon]}<span>${wx.temp}°</span>`; el.title = `${wx.label}, ${wx.temp} °C à Cabestany`; });
  $$("[data-wx-text]").forEach((el) => { el.textContent = `${wx.temp} °C · ${wx.label.toLowerCase()}`; });
  $$("[data-wx-icon]").forEach((el) => { el.innerHTML = ICONS[wx.icon]; });
  $$("[data-wx-tip]").forEach((el) => { el.textContent = wx.tip; });
  $$("[data-wx-card]").forEach((el) => {
    el.innerHTML = `${ICONS[wx.icon]}<strong>${wx.temp} °C</strong><span>${esc(wx.label)} · ressenti ${wx.feels} °C · vent ${wx.wind} km/h</span><p>${esc(wx.tip)}</p>`;
  });
  document.dispatchEvent(new CustomEvent("pp:weather", { detail: wx }));
}

/* ---------------- Panneaux ---------------- */
const X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
function makeSheet(id, title, eyebrow, wide = false) {
  let d = document.getElementById(id);
  if (d) return d;
  d = document.createElement("dialog");
  d.className = "sheet"; d.id = id; d.setAttribute("aria-labelledby", `${id}-t`);
  d.innerHTML = `<div class="sheet-panel${wide ? " wide" : ""}">
    <div class="sheet-head"><div><p class="eyebrow tag">${eyebrow}</p><h2 id="${id}-t">${title}</h2></div>
    <button class="sheet-x" type="button" data-close aria-label="Fermer">${X}</button></div>
    <div class="sheet-body" data-lenis-prevent></div></div>`;
  document.body.appendChild(d);
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) closeSheet(d); });
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  return d;
}
export function openSheet(d) {
  if (d.open) return;
  d.classList.remove("closing");
  d.showModal();
  window.__lenis?.stop();
}
export function closeSheet(d) {
  if (!d.open || d.classList.contains("closing")) return;
  d.classList.add("closing");
  setTimeout(() => { d.classList.remove("closing"); d.close(); if (!document.querySelector("dialog[open]")) window.__lenis?.start(); }, 260);
}
export { makeSheet };

function hoursSheet() {
  const d = makeSheet("hours-sheet", "Horaires", "Point Pneus · Cabestany");
  const n = parisNow(), st = openState(n);
  const today = HOURS[n.dow] || [];
  const span = [420, 1200]; // 7 h → 20 h
  const pct = (m) => ((m - span[0]) / (span[1] - span[0])) * 100;
  const bar = today.map(([a, b]) => `<i style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"></i>`).join("");
  const marker = n.mins > span[0] && n.mins < span[1] ? `<b style="left:${pct(n.mins)}%"></b>` : "";
  const week = DAYS.map((name, i) => {
    const s = HOURS[i + 1];
    const txt = s.length ? s.map(([a, b]) => `${hm(a)} – ${hm(b)}`).join(" · ") : "Fermé";
    return `<li class="${i + 1 === n.dow ? "today" : ""}"><span>${name}</span><span>${txt}</span></li>`;
  }).join("");
  d.querySelector(".sheet-body").innerHTML = `
    <div class="hours-now"><span class="live-dot ${st.open ? "on" : ""}"></span><div><strong>${st.title} en ce moment</strong><span class="sub">${st.sub} · il est ${clock(n).replace(":", " h ")}</span></div></div>
    <div class="hours-bar" aria-hidden="true">${bar}${marker}</div>
    <div class="hours-scale" aria-hidden="true"><span>7 h</span><span>12 h</span><span>14 h</span><span>20 h</span></div>
    <ul class="hours-week">${week}</ul>
    <p class="hours-note">Fermé les jours fériés. Une crevaison en dehors des horaires ? Laissez un message, on vous rappelle à l'ouverture.</p>
    <div class="wx-card" data-wx-card><p>Météo en cours de chargement…</p></div>
    <div class="sheet-actions">
      <a class="btn btn-light btn-arrow" href="reserver.html">Prendre rendez-vous</a>
      <a class="btn btn-ghost" href="tel:${TEL}">Appeler le ${PHONE}</a>
      <a class="btn btn-ghost" href="${MAPS}" target="_blank" rel="noopener">Itinéraire</a>
    </div>`;
  renderWeather();
  return d;
}

/* ---------------- Lire son pneu ---------------- */
const LOAD = { 60: 250, 61: 257, 62: 265, 63: 272, 64: 280, 65: 290, 66: 300, 67: 307, 68: 315, 69: 325, 70: 335, 71: 345, 72: 355, 73: 365, 74: 375, 75: 387, 76: 400, 77: 412, 78: 425, 79: 437, 80: 450, 81: 462, 82: 475, 83: 487, 84: 500, 85: 515, 86: 530, 87: 545, 88: 560, 89: 580, 90: 600, 91: 615, 92: 630, 93: 650, 94: 670, 95: 690, 96: 710, 97: 730, 98: 750, 99: 775, 100: 800, 101: 825, 102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000, 109: 1030, 110: 1060, 111: 1090, 112: 1120, 113: 1150, 114: 1180, 115: 1215, 116: 1250, 117: 1285, 118: 1320, 119: 1360, 120: 1400 };
const SPEED = { L: 120, M: 130, N: 140, P: 150, Q: 160, R: 170, S: 180, T: 190, U: 200, H: 210, V: 240, W: 270, Y: 300 };

export function parseSize(str) {
  const m = String(str || "").toUpperCase().replace(/\s+/g, " ").trim()
    .match(/^(\d{3})\s?\/\s?(\d{2})\s?(Z?R)?\s?(\d{2})(?:\s?(\d{2,3})\s?([A-Z]))?$/);
  if (!m) return null;
  const s = { w: +m[1], r: +m[2], z: m[3] || "R", d: +m[4], li: m[5] ? +m[5] : null, sp: m[6] || null };
  if (s.w < 125 || s.w > 355 || s.r < 25 || s.r > 85 || s.d < 12 || s.d > 24) return null;
  s.side = Math.round((s.w * s.r) / 100);
  s.rimMm = Math.round(s.d * 25.4);
  s.total = Math.round(s.rimMm + 2 * s.side);
  s.kg = s.li ? LOAD[s.li] || null : null;
  s.kmh = s.sp ? SPEED[s.sp] || null : null;
  s.label = `${s.w}/${s.r} ${s.z}${s.d}${s.li ? ` ${s.li}${s.sp || ""}` : ""}`;
  s.short = `${s.w}/${s.r} R${s.d}`;
  return s;
}

const READ = {
  w: (s) => ({ k: "width", eyebrow: "Largeur", big: `${s.w} mm`, text: "La largeur du pneu, d'un flanc à l'autre, en millimètres. Plus large, il accroche mieux sur le sec mais fait un peu plus de bruit et consomme un peu plus." }),
  r: (s) => ({ k: "side", eyebrow: "Hauteur du flanc", big: `${s.r} %, soit ${s.side} mm`, text: "La hauteur du flanc, en pourcentage de la largeur. Un flanc bas (40, 45) rend la voiture plus vive et plus ferme ; un flanc haut (60, 65) filtre mieux les chocs." }),
  z: (s) => ({ k: "radial", eyebrow: "Structure", big: s.z === "ZR" ? "ZR · radiale" : "R · radiale", text: "Les nappes de la carcasse vont d'un talon à l'autre, comme des rayons. Presque tous les pneus de voiture sont radiaux. ZR signale en plus un pneu prévu au-delà de 240 km/h." }),
  d: (s) => ({ k: "rim", eyebrow: "Diamètre de jante", big: `${s.d} pouces, soit ${s.rimMm} mm`, text: `Le diamètre de la jante, en pouces (1 pouce = 25,4 mm). Il doit correspondre exactement à votre jante. Diamètre total du pneu monté : environ ${s.total} mm.` }),
  li: (s) => ({ k: "load", eyebrow: "Indice de charge", big: s.kg ? `${s.li} = ${s.kg} kg` : `${s.li}`, text: s.kg ? `La charge maximale par pneu : ${s.kg} kg, soit ${(s.kg * 4).toLocaleString("fr-FR")} kg pour les quatre. Ne montez jamais un indice plus faible que celui d'origine.` : "La charge maximale que le pneu peut porter. Ne montez jamais un indice plus faible que celui d'origine." }),
  sp: (s) => ({ k: "speed", eyebrow: "Indice de vitesse", big: s.kmh ? `${s.sp} = ${s.kmh} km/h` : s.sp, text: "La vitesse maximale que le pneu supporte à pleine charge. Un indice plus élevé que l'origine est permis, pas plus faible. Seule tolérance : les pneus hiver, avec un rappel de vitesse visible du conducteur." }),
  dot: () => ({ k: "dot", eyebrow: "Code DOT", big: "45e semaine de 2026", text: "Les quatre derniers chiffres du code DOT donnent la semaine puis l'année de fabrication. Au-delà de 5 ans, faites contrôler la gomme ; au-delà de 10 ans, changez le pneu." }),
  ms: () => ({ k: "snow", eyebrow: "M+S", big: "Boue et neige", text: "Marquage déclaré par le fabricant. Depuis le 1er novembre 2024, il ne suffit plus seul pour la loi Montagne : il faut aussi le symbole 3PMSF." }),
  pm: () => ({ k: "snow", eyebrow: "3PMSF", big: "Montagne et flocon", text: "Pneu testé sur la neige. C'est le marquage exigé par la loi Montagne du 1er novembre au 31 mars, dans les communes concernées des Pyrénées notamment." }),
  twi: () => ({ k: "twi", eyebrow: "Témoins d'usure", big: "1,6 mm", text: "Le petit triangle ▲ TWI montre où se trouvent les témoins dans les rainures. Quand la gomme les affleure, le pneu doit être changé ; sous la pluie, mieux vaut ne pas attendre 3 mm." }),
};

const FIGURE = `<svg viewBox="0 0 360 250" role="img" aria-label="Schéma d'une roue et de la coupe d'un pneu">
  <defs><marker id="rdA" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" fill="currentColor"/></marker></defs>
  <g color="#ffd600">
  <circle cx="125" cy="140" r="98" fill="#0c0b0e" stroke="#3b3842" stroke-width="2"/>
  <circle cx="125" cy="140" r="98" fill="none" stroke="#1d1b21" stroke-width="10" stroke-dasharray="3 5"/>
  <circle cx="125" cy="140" r="58" fill="#2a2830" stroke="#4a4652"/>
  <circle cx="125" cy="140" r="16" fill="#3a3740"/>
  <g class="g dim" data-k="radial" stroke="#b69cff" stroke-width="1.2">${Array.from({ length: 36 }, (_, i) => { const a = (i / 36) * Math.PI * 2; return `<line x1="${(125 + Math.cos(a) * 60).toFixed(1)}" y1="${(140 + Math.sin(a) * 60).toFixed(1)}" x2="${(125 + Math.cos(a) * 95).toFixed(1)}" y2="${(140 + Math.sin(a) * 95).toFixed(1)}"/>`; }).join("")}</g>
  <g class="g dim" data-k="side" stroke="currentColor" stroke-width="2"><line x1="29" y1="140" x2="65" y2="140" marker-start="url(#rdA)" marker-end="url(#rdA)"/></g>
  <g class="g dim" data-k="rim" stroke="currentColor" stroke-width="2"><line x1="125" y1="84" x2="125" y2="196" marker-start="url(#rdA)" marker-end="url(#rdA)"/></g>
  <g class="g dim" data-k="load" stroke="currentColor" stroke-width="3"><line x1="125" y1="4" x2="125" y2="36" marker-end="url(#rdA)"/></g>
  <g class="g dim" data-k="speed" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M230 104h-14M236 122h-26M232 140h-18M238 158h-30M230 176h-14"/></g>
  <g class="g dim" data-k="dot"><rect x="100" y="214" width="50" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/></g>
  <path d="M262 74c0-10 6-16 16-16h34c10 0 16 6 16 16v132c0 10-6 16-16 16h-34c-10 0-16-6-16-16z" fill="#141317" stroke="#3b3842" stroke-width="2"/>
  <path d="M276 222v-22h40v22" fill="#2a2830" stroke="#4a4652"/>
  <g stroke="#0a090c" stroke-width="5"><line x1="282" y1="58" x2="282" y2="70"/><line x1="295" y1="58" x2="295" y2="70"/><line x1="308" y1="58" x2="308" y2="70"/></g>
  <g class="g dim" data-k="twi" fill="currentColor"><rect x="279.5" y="64" width="5" height="6"/><rect x="292.5" y="64" width="5" height="6"/><rect x="305.5" y="64" width="5" height="6"/></g>
  <g class="g dim" data-k="width" stroke="currentColor" stroke-width="2"><line x1="262" y1="40" x2="328" y2="40" marker-start="url(#rdA)" marker-end="url(#rdA)"/></g>
  <g class="g dim" data-k="snow" stroke="currentColor" stroke-width="2" fill="none"><path d="M268 34 284 12l8 10 6-8 14 20z"/><path d="M296 28v-6m-3 3h6"/></g>
  </g></svg>`;

export function mountReader(host, initial = "205/55 R16 91V") {
  let s = parseSize(initial), sel = "w";
  host.innerHTML = `<div class="rd">
    <div class="rd-wall">
      <div class="rd-size" role="group" aria-label="Inscription du flanc"></div>
      <div class="rd-extra" role="group" aria-label="Autres marquages">
        <button class="rd-tok small" type="button" data-t="dot">DOT 4X2T 4526</button>
        <button class="rd-tok small" type="button" data-t="ms">M+S</button>
        <button class="rd-tok small" type="button" data-t="pm">3PMSF</button>
        <button class="rd-tok small" type="button" data-t="twi">▲ TWI</button>
      </div>
      <p class="rd-hint">Touchez un chiffre pour savoir ce qu'il veut dire</p>
    </div>
    <div class="rd-explain" aria-live="polite">
      <div class="rd-figure">${FIGURE}</div>
      <div class="rd-text"><p class="eyebrow"></p><p class="rd-big"></p><p class="rd-desc"></p></div>
    </div>
    <form class="rd-try" novalidate>
      <label for="rd-in-${host.id || "x"}">Lisez votre propre pneu : recopiez ce qui est écrit sur le flanc</label>
      <div class="rd-try-row"><input id="rd-in-${host.id || "x"}" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="205/55 R16 91V"><button class="btn btn-light" type="submit">Lire</button></div>
      <p class="rd-err" hidden>Format attendu : 205/55 R16 91V (largeur/hauteur R jante, puis indices).</p>
      <dl class="rd-stats"></dl>
      <div class="sheet-actions" style="margin-top:4px">
        <a class="btn btn-light btn-arrow" data-rd-shop href="pneus.html">Voir les pneus à cette taille</a>
        <a class="btn btn-ghost" data-rd-rdv href="reserver.html?prestation=pneus">Prendre rendez-vous</a>
      </div>
    </form></div>`;
  const size = $(".rd-size", host), desc = $(".rd-text", host);
  const renderSize = () => {
    size.innerHTML = `<button class="rd-tok" type="button" data-t="w">${s.w}</button><span class="rd-sep">/</span><button class="rd-tok" type="button" data-t="r">${s.r}</button>
      <button class="rd-tok" type="button" data-t="z">${s.z}</button><button class="rd-tok" type="button" data-t="d">${s.d}</button>
      ${s.li ? `<span class="rd-sep">&nbsp;</span><button class="rd-tok" type="button" data-t="li">${s.li}</button><button class="rd-tok" type="button" data-t="sp">${s.sp || ""}</button>` : ""}`;
    $(".rd-stats", host).innerHTML = `<div><dt>Flanc</dt><dd>${s.side} mm</dd></div><div><dt>Diamètre total</dt><dd>${s.total} mm</dd></div>
      <div><dt>Charge</dt><dd>${s.kg ? `${s.kg} kg` : "–"}</dd></div><div><dt>Vitesse max</dt><dd>${s.kmh ? `${s.kmh} km/h` : "–"}</dd></div>`;
    $("[data-rd-shop]", host).href = `pneus.html?taille=${encodeURIComponent(s.short)}`;
    $("[data-rd-rdv]", host).href = `reserver.html?prestation=pneus&taille=${encodeURIComponent(`${s.w}/${s.r} R${s.d}`)}`;
    if (!s[sel] && !["dot", "ms", "pm", "twi", "z"].includes(sel)) sel = "w";
    show(sel);
  };
  const show = (t) => {
    sel = t;
    const info = READ[t](s);
    $$(".rd-tok", host).forEach((b) => { b.classList.toggle("on", b.dataset.t === t); b.setAttribute("aria-pressed", b.dataset.t === t); });
    $$(".rd-figure .dim", host).forEach((g) => g.classList.toggle("on", g.dataset.k === info.k));
    $(".eyebrow", desc).textContent = info.eyebrow;
    $(".rd-big", desc).textContent = info.big;
    $(".rd-desc", desc).textContent = info.text;
  };
  host.addEventListener("click", (e) => { const b = e.target.closest(".rd-tok"); if (b) show(b.dataset.t); });
  $("form", host).addEventListener("submit", (e) => {
    e.preventDefault();
    const v = parseSize($("input", host).value);
    $(".rd-err", host).hidden = Boolean(v);
    if (v) { s = v; renderSize(); }
  });
  renderSize();
}

function readerSheet() {
  const d = makeSheet("reader-sheet", "Lire son pneu", "Comprendre le flanc", true);
  const body = d.querySelector(".sheet-body");
  if (!body.dataset.ready) { body.id = "reader-body"; mountReader(body); body.dataset.ready = "1"; }
  return d;
}

/* ---------------- Menu (téléphone, tablette) ---------------- */
function buildMenu(nav) {
  const menu = document.createElement("div");
  menu.className = "menu"; menu.id = "menu";
  const links = $$(".nav-links > a, .nav-links > button", nav).map((a) => {
    const el = a.cloneNode(true); el.classList.remove("is-active"); el.removeAttribute("data-nav-i");
    el.querySelector(".new")?.remove();
    return el.outerHTML;
  }).join("");
  menu.innerHTML = `<nav class="menu-links" aria-label="Menu">${links}</nav>
    <div class="menu-foot">
      <button class="menu-card" type="button" data-open="hours"><small>Horaires</small><span><span class="live-dot" data-open-dot></span> <span data-open-text>…</span></span></button>
      <a class="menu-card" href="tel:${TEL}"><small>Téléphone</small><span>${PHONE}</span></a>
      <a class="menu-card" href="reserver.html"><small>En ligne</small><span>Prendre rendez-vous →</span></a>
      <div class="menu-card"><small>Cabestany, maintenant</small><span><span data-clock>--:--</span> · <span data-wx-text>météo…</span></span></div>
    </div>`;
  document.body.appendChild(menu);
  menu.addEventListener("click", (e) => { if (e.target.closest("a, button")) document.documentElement.classList.remove("menu-open"); });
  return menu;
}

/* ---------------- Initialisation ---------------- */
export function initUI() {
  const root = document.documentElement;
  root.classList.add("js");
  const nav = $(".nav");
  if (nav) {
    buildMenu(nav);
    const burger = $(".nav-burger", nav);
    burger?.addEventListener("click", () => {
      const open = root.classList.toggle("menu-open");
      burger.setAttribute("aria-expanded", String(open));
      if (open) window.__lenis?.stop(); else window.__lenis?.start();
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape" && root.classList.contains("menu-open")) { root.classList.remove("menu-open"); window.__lenis?.start(); } });
    const onScroll = () => nav.classList.toggle("scrolled", scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-open]");
    if (!t) return;
    e.preventDefault();
    const which = t.dataset.open;
    if (which === "hours") openSheet(hoursSheet());
    if (which === "reader") openSheet(readerSheet());
  });

  // Plaques : AB-123-CD pendant la saisie
  $$("[data-plate]").forEach((inp) => inp.addEventListener("input", () => {
    const raw = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z]{2}\d{0,3}[A-Z]{0,2}$/.test(raw) && raw.length > 2) inp.value = raw.slice(0, 2) + "-" + raw.slice(2, 5) + (raw.length > 5 ? "-" + raw.slice(5, 7) : "");
    else if (inp.value !== inp.value.toUpperCase()) inp.value = inp.value.toUpperCase();
  }));

  // Boutons aimantés (souris seulement)
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    $$("[data-magnet]").forEach((el) => {
      const k = Number(el.dataset.magnet) || 0.3;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * k}px, ${(e.clientY - r.top - r.height / 2) * k}px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  tickClock();
  setInterval(tickClock, 15000);
  loadWeather();
  setInterval(loadWeather, 10 * 60e3);
}

// Pastille de la navigation qui glisse sous le lien actif
export function setActiveNav(key) {
  const links = $(".nav-links");
  if (!links) return;
  let pill = $(".nav-pill", links);
  if (!pill) { pill = document.createElement("span"); pill.className = "nav-pill"; links.prepend(pill); }
  const a = key ? $(`[data-nav="${key}"]`, links) : null;
  $$("[data-nav]", links).forEach((l) => l.classList.toggle("is-active", l === a));
  if (!a) { pill.style.opacity = "0"; return; }
  pill.style.opacity = "1";
  pill.style.width = `${a.offsetWidth}px`;
  pill.style.transform = `translateX(${a.offsetLeft}px)`;
}
