// Mode démo uniquement : remplit l'espace gérant avec des données entièrement fictives.
// Les 30 prochains jours viennent de l'agenda de test ; les trois mois d'avant en sont tirés
// (mêmes créneaux d'une heure, mêmes véhicules, mêmes motifs). Les prix viennent du catalogue et des tarifs du site.
import { BASE_PRODUCTS } from "./catalogue.js?v=4";
import { AGENDA } from "./demo-agenda.js?v=1";

const { time: T } = window.BookingAPI;
const cfg = window.BOOKING_CONFIG || {};
const DAY = 864e5;
const HISTORY_DAYS = 92;

const dateOfKey = (k) => { const [y, m, d] = k.split("-").map(Number); return T.parisDate(y, m, d, 0, 0); };
const startOfDay = (date) => { const p = T.parisParts(date); return T.parisDate(p.y, p.m, p.d, 0, 0); };
const addDays = (date, n) => { const p = T.parisParts(new Date(date.getTime() + n * DAY + 12 * 36e5)); return T.parisDate(p.y, p.m, p.d, 0, 0); };
const keyOf = (date) => { const p = T.parisParts(date); return T.dayKey(p.y, p.m, p.d); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function isClosed(date) {
  const p = T.parisParts(date);
  return !(cfg.hours?.[p.dow] || []).length || T.holidays(p.y).has(T.dayKey(p.y, p.m, p.d)) || (cfg.closedDates || []).includes(T.dayKey(p.y, p.m, p.d));
}

const BRANDS = ["Renault", "Citroën", "Volkswagen", "Dacia", "Toyota", "Ford", "Peugeot", "Audi", "BMW", "Opel", "Fiat", "Nissan", "Mercedes", "Seat", "Hyundai"];
const carOf = (txt) => { const b = BRANDS.find((x) => txt.startsWith(`${x} `)); return b ? { brand: b, model: txt.slice(b.length + 1) } : { brand: "Renault", model: txt }; };

const TIRE_JOBS = {
  "demande de pneus 4 saisons": { cats: ["4saisons"], qty: [4, 4, 2] },
  "montage de pneus": { qty: [4, 2, 4] },
  "changement de pneus": { qty: [4, 4, 2] },
  "pneu endommagé": { qty: [1] },
  "recherche d'un pneu d'occasion": { cats: ["occasion"], qty: [1, 2] },
  "pneu arrière à remplacer": { qty: [1, 2] },
  "remplacement de deux pneus": { qty: [2] },
};
const FIXED_JOBS = {
  "crevaison avant gauche": { id: "crevaison", label: "Réparer une crevaison", eur: 15 },
  "parallélisme": { id: "geometrie", option: "avant", label: "Géométrie 3D · Parallélisme avant", eur: 65 },
  "recharge de climatisation": { id: "clim", option: "r1234yf", label: "Recharge de climatisation · Gaz R1234yf", eur: 110 },
  "vidange et entretien": { id: "vidange", label: "Vidange et entretien" },
  "bruit au freinage": { id: "freins", label: "Freins · bruit au freinage" },
  "contrôle des freins": { id: "freins", label: "Freins · contrôle" },
};

// Quantités de départ de la démo : [en stock, seuil d'alerte].
const START_STOCK = {
  "primacy-4p": [16, 8], "premiumcontact-7": [12, 6], "ventus-prime-4": [22, 8], "roadhawk-2": [14, 6],
  "crossclimate-2": [10, 8], "vector-4s-g3": [18, 6], "alpin-6": [24, 8], "wintercontact-ts870": [12, 6],
  "pilot-sport-5": [6, 4], "potenza-sport": [6, 4], "pilot-sport-cup-2": [3, 2], "proxes-r888r": [0, 2],
  "ns-2r": [8, 4], "595-rs-rr": [6, 4], "lot-drift": [2, 1], "occ-primacy-4": [3, 2], "occ-ecocontact-6": [2, 2],
};

const FIRST_NAMES = ["Léa", "Paul", "Manon", "Jules", "Clara", "Enzo", "Louise", "Hugo", "Zoé", "Nathan", "Lina", "Tom", "Jade", "Adam", "Anaïs", "Maxime", "Élodie", "Bilal", "Margaux", "Théo", "Amina", "Quentin", "Pauline", "Rayan", "Justine", "Florian", "Océane", "Samir", "Marine", "Kevin"];
const INITIALS = [..."ABCDEFGHJLMNPRSTV"];

export function seedDemo() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const now = new Date(), today = startOfDay(now);

  // Si on ouvre la démo après la fin de l'agenda, tout est décalé par semaines entières.
  const first = dateOfKey(AGENDA[0][0]), last = dateOfKey(AGENDA[AGENDA.length - 1][0]);
  const shift = today > last ? Math.ceil((today - first) / (7 * DAY)) * 7 : 0;
  const origin = addDays(first, shift);

  const SLOTS = [...new Set(AGENDA.map((r) => r[1]))].sort();
  const perDay = Object.values(AGENDA.reduce((m, r) => { m[r[0]] = (m[r[0]] || 0) + 1; return m; }, {}));
  const CSV_PEOPLE = [...new Map(AGENDA.map((r) => [r[3], { car: r[2], name: r[3], problem: r[4] }])).values()];
  const CARS = [...new Set(AGENDA.map((r) => r[2]))];
  const PROBLEMS = [...new Set(AGENDA.map((r) => r[4]))];
  const people = [...CSV_PEOPLE];
  FIRST_NAMES.forEach((f, i) => people.push({ car: pick(CARS), name: `${f} ${INITIALS[(i * 7) % INITIALS.length]}.` }));
  FIRST_NAMES.forEach((f, i) => people.push({ car: pick(CARS), name: `${f} ${INITIALS[(i * 5 + 3) % INITIALS.length]}.` }));

  // Numéros de la tranche réservée par l'Arcep aux œuvres de fiction : ils ne sont attribués à personne.
  const phones = new Map();
  const phoneOf = (person) => {
    if (!phones.has(person.name)) { const n = phones.size + 1; phones.set(person.name, `06 39 98 ${T.pad(Math.floor(n / 100))} ${T.pad(n % 100)}`); }
    return phones.get(person.name);
  };

  const productFor = (job, month) => {
    let cats = job.cats;
    if (!cats) cats = month >= 11 || month <= 3 ? ["hiver", "hiver", "4saisons", "ete"] : month === 10 ? ["4saisons", "hiver", "ete"] : ["ete", "ete", "ete", "4saisons", "sport"];
    const cat = pick(cats);
    return pick(BASE_PRODUCTS.filter((p) => p.cat === cat && p.id !== "lot-drift"));
  };
  const seasonOf = { ete: "Été", "4saisons": "4 saisons", hiver: "Hiver", sport: "Été", occasion: "Été" };
  const lineOf = (p, qty) => ({ id: p.id, qty, size: p.size, label: `${p.brand} ${p.model}`, price: p.price });
  const shopDetails = (lines, pose, person) => {
    const total = lines.reduce((t, l) => t + l.price * l.qty, 0);
    return {
      type: "Commande boutique", pose, total: `${total} € (indicatif, tarif posé)`, lignes: lines,
      articles: lines.map((l) => `${l.qty} × ${l.label} (${l.size})`).join(" ; "),
      vehicule: person.car,
    };
  };

  const bookings = [], orders = [];
  function addBooking(day, hour, person, problem, index) {
    const p = T.parisParts(day), [h, min] = hour.split(":").map(Number);
    const start = T.parisDate(p.y, p.m, p.d, h, min), end = new Date(start.getTime() + 60 * 6e4);
    const left = (start - now) / DAY;
    let status = "confirme";
    if (end < now) status = rnd() < 0.08 ? "annule" : "termine";
    else if (left < 5 && bookings.length % 4 === 1) status = "en_attente";

    const tire = TIRE_JOBS[problem];
    let svc, eur = null, product = null, qty = 0;
    if (tire) {
      product = productFor(tire, p.m); qty = pick(tire.qty);
      const size = product.size.split(" ").slice(0, 2).join(" ");
      svc = { id: "pneus", qty, season: seasonOf[product.cat] || "Été", size, label: `Changer des pneus · ${qty} pneu${qty > 1 ? "s" : ""} · ${size}`, price: "Pneus sur devis" };
      eur = qty * product.price;
    } else {
      const f = FIXED_JOBS[problem];
      if (f) { svc = { id: f.id, label: f.label, price: f.eur ? `${f.eur} €` : "Sur devis" }; if (f.option) svc.option = f.option; eur = f.eur || null; }
      else svc = { id: "autre", label: cap(problem), price: "Sur devis" };
    }
    const made = new Date(Math.min(start.getTime() - (1 + Math.floor(rnd() * 12)) * DAY, now.getTime() - (1 + rnd() * 240) * 36e5));
    const row = {
      id: `SEED-${keyOf(day)}-${index}`, start_at: start.toISOString(), end_at: end.toISOString(), minutes: 60,
      services: [svc], vehicle: { ...carOf(person.car), demo: true }, plate: null,
      customer_name: person.name, customer_phone: phoneOf(person), customer_email: null,
      note: null,
      estimated_total: eur, quote_needed: !eur, status, created_at: made.toISOString(),
    };
    bookings.push(row);

    // Environ une pose de pneus sur deux a été commandée sur la boutique quelques jours avant.
    if (tire && rnd() < 0.55) {
      const ordered = new Date(Math.min(start.getTime() - (2 + Math.floor(rnd() * 6)) * DAY, now.getTime() - (2 + rnd() * 150) * 36e5));
      const age = (now - ordered) / DAY;
      let order = "confirmee";
      if (status === "termine") order = "livree";
      else if (status === "annule") order = "annulee";
      else if (age < 1.6) order = "nouvelle";
      else if (left < 3) order = "prete";
      orders.push({ person, created: ordered, order, details: { ...shopDetails([lineOf(product, qty)], "Pose au garage avec rendez-vous", person), rdv: row.id } });
    }
  }

  // L'agenda de test, créneau par créneau.
  AGENDA.forEach((r, i) => {
    const day = addDays(dateOfKey(r[0]), shift);
    if (isClosed(day)) return;
    addBooking(day, r[1], { car: r[2], name: r[3] }, r[4], `c${i}`);
  });

  // Les semaines précédentes, sur le même modèle. Clim en fin d'été, pneus à l'automne.
  const weighted = (month) => PROBLEMS.flatMap((x) => {
    let w = 2;
    if (TIRE_JOBS[x]) w = month >= 10 ? 5 : 2;
    if (x === "recharge de climatisation") w = month <= 9 ? 6 : 1;
    return Array(w).fill(x);
  });
  for (let k = -HISTORY_DAYS; k < 0; k++) {
    const day = addDays(origin, k);
    if (isClosed(day)) continue;
    const month = T.parisParts(day).m, bag = weighted(month);
    const n = Math.max(1, Math.round(pick(perDay) * (month === 8 ? 0.65 : month === 9 ? 0.85 : 1)));
    const hours = SLOTS.slice().sort(() => rnd() - 0.5).slice(0, n);
    hours.forEach((h, i) => {
      const person = pick(people);
      addBooking(day, h, person, person.problem && rnd() < 0.3 ? person.problem : pick(bag), `h${i}`);
    });
  }

  // Retraits au comptoir, sans rendez-vous.
  const COUNTER = BASE_PRODUCTS.filter((p) => ["occasion", "drift", "sport", "competition"].includes(p.cat) && p.id !== "proxes-r888r");
  for (let k = -HISTORY_DAYS; k <= 0; k++) {
    const day = addDays(today, k);
    if (isClosed(day) || rnd() > 0.2) continue;
    const p = pick(COUNTER), qty = p.unit ? 1 : pick([1, 2, 2]);
    const dp = T.parisParts(day), created = T.parisDate(dp.y, dp.m, dp.d, 9 + Math.floor(rnd() * 9), Math.floor(rnd() * 60));
    if (created > now) continue;
    const age = (now - created) / DAY;
    const order = age < 1.6 ? "nouvelle" : age < 5 ? pick(["confirmee", "prete"]) : rnd() < 0.08 ? "annulee" : "livree";
    const person = pick(people);
    orders.push({ person, created, order, details: shopDetails([lineOf(p, qty)], "Retrait au comptoir", person) });
  }

  orders.sort((a, b) => a.created - b.created);
  const quotes = orders.map((o, i) => ({
    id: `SEEDO${i}`, kind: "pneus", details: { ...o.details, ref: String(1001 + i) },
    name: o.person.name, customer_name: o.person.name, customer_phone: phoneOf(o.person),
    status: o.order === "nouvelle" ? "nouveau" : "traite", order_status: o.order, created_at: o.created.toISOString(),
  }));

  // Demandes de devis reçues par le formulaire du site.
  const ASKS = PROBLEMS.filter((x) => !TIRE_JOBS[x] && !FIXED_JOBS[x]);
  for (let k = -HISTORY_DAYS, i = 0; k <= 0; k += 4 + Math.floor(rnd() * 3), i++) {
    const person = pick(people), created = new Date(today.getTime() + k * DAY + (9 + rnd() * 8) * 36e5);
    if (created > now) continue;
    quotes.push({ id: `SEEDQ${i}`, kind: "mecanique", details: { besoin: cap(pick(ASKS)), vehicule: person.car }, name: person.name, customer_name: person.name, customer_phone: phoneOf(person), status: "traite", created_at: created.toISOString() });
  }
  [[3, "bruit au freinage"], [26, "problème de suspension"]].forEach(([h, what], i) => {
    const person = people[25 + i * 3];
    quotes.push({ id: `SEEDQN${i}`, kind: "mecanique", details: { besoin: cap(what), vehicule: person.car }, name: person.name, customer_name: person.name, customer_phone: phoneOf(person), status: "nouveau", created_at: new Date(now.getTime() - h * 36e5).toISOString() });
  });

  const merge = (key, rows) => {
    let cur = [];
    try { cur = JSON.parse(localStorage.getItem(key) || "[]").filter((r) => !String(r.id).startsWith("SEED")); } catch (x) { /* rien */ }
    try { localStorage.setItem(key, JSON.stringify(cur.concat(rows))); } catch (x) { /* rien */ }
  };
  merge("pp-demo-bookings", bookings);
  merge("pp-demo-quotes", quotes);
  merge("pp-demo-blocks", []);
  merge("pp-demo-qamar", [
    { id: "SEEDM1", kind: "probleme", priority: "haute", page: "Boutique", description: "Exemple de démo : le prix d'un pneu ne se met pas à jour sur téléphone.", attachment: null, status: "en_cours", created_at: new Date(now - 2 * DAY).toISOString() },
    { id: "SEEDM2", kind: "amelioration", priority: "normale", page: "Accueil", description: "Exemple de démo : ajouter les horaires d'été dans le bas de page.", attachment: null, status: "recue", created_at: new Date(now - 5 * 36e5).toISOString() },
    { id: "SEEDM3", kind: "demande", priority: "basse", page: "Rendez-vous", description: "Exemple de démo : changer l'ordre des prestations proposées.", attachment: null, status: "terminee", created_at: new Date(now - 9 * DAY).toISOString() },
  ]);
  try { localStorage.setItem("pp-demo-stock", JSON.stringify(Object.fromEntries(Object.entries(START_STOCK).map(([id, [qty, min]]) => [id, { qty, min }])))); } catch (x) { /* rien */ }

  // Fréquentation d'exemple du site.
  const SRC = [["Google", 52], ["Accès direct", 26], ["Réseaux sociaux", 10], ["Annuaires et GPS", 8], ["Autre moteur", 4]];
  const DEV = [["mobile", 68], ["ordinateur", 26], ["tablette", 6]];
  const rows = [];
  for (let k = 100; k >= 0; k--) {
    const day = addDays(today, -k), d = keyOf(day), wk = T.parisParts(day).dow;
    const volume = (wk >= 6 ? 20 : 46) * (1 + (100 - k) * 0.004) * (0.8 + rnd() * 0.4);
    for (const [s, ws] of SRC) for (const [dv, wd] of DEV) {
      const n = Math.round((volume * ws * wd) / 10000 + rnd() * 0.6);
      if (n) rows.push({ d, kind: "visite", path: "/", source: s, device: dv, n });
    }
    for (const [p, f] of [["/", 1.1], ["/pneus.html", 0.7], ["/reserver.html", 0.35], ["/confidentialite.html", 0.02]]) rows.push({ d, kind: "page", path: p, source: null, device: "mobile", n: Math.round(volume * f) });
    for (const [kind, f] of [["rdv", 0.22], ["plaque", 0.14], ["panier", 0.06], ["appel", 0.1], ["itineraire", 0.07]]) { const n = Math.round(volume * f * (0.7 + rnd() * 0.6)); if (n) rows.push({ d, kind, path: "/", source: null, device: "mobile", n }); }
  }
  let mine = [];
  try { mine = JSON.parse(localStorage.getItem("pp-demo-events") || "[]").filter((r) => !r.seed); } catch (x) { /* rien */ }
  try { localStorage.setItem("pp-demo-events", JSON.stringify(mine.concat(rows.map((r) => ({ ...r, seed: 1 }))))); } catch (x) { /* rien */ }
}
