/*
 * Couche d'accès aux données de la prise de rendez-vous.
 * Deux branchements possibles, mêmes fonctions :
 *   - demo     : tout reste dans ce navigateur (localStorage), véhicules fictifs.
 *   - supabase : base de données, comptes, connexion Google, recherche de plaque via une fonction serveur.
 */
(function () {
  "use strict";

  const cfg = window.BOOKING_CONFIG || {};
  const TZ = "Europe/Paris";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

  /* ---------------- Plaques françaises ---------------- */
  const SIV = /^[A-HJ-NP-TV-Z]{2}\d{3}[A-HJ-NP-TV-Z]{2}$/;   // AB-123-CD (sans I, O, U)
  const FNI = /^(\d{1,4})([A-Z]{1,3})(\d{2}|2A|2B)$/;        // 1234 AB 66 (ancien format)

  const normalizePlate = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isValidPlate = (p) => SIV.test(p) || FNI.test(p);

  function formatPlate(p) {
    if (SIV.test(p)) return `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`;
    const m = p.match(FNI);
    return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
  }

  /* ---------------- Heure de Perpignan ---------------- */
  const partsFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  });
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function parisParts(date) {
    const o = {};
    for (const p of partsFormat.formatToParts(date)) o[p.type] = p.value;
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, dow: WEEKDAYS.indexOf(o.weekday) + 1 };
  }

  // Date réelle correspondant à une heure affichée à Perpignan (gère l'heure d'été).
  function parisDate(y, m, d, h = 0, min = 0) {
    const wanted = Date.UTC(y, m - 1, d, h, min);
    let guess = wanted;
    for (let i = 0; i < 3; i++) {
      const p = parisParts(new Date(guess));
      guess += wanted - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    }
    return new Date(guess);
  }

  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

  // Jours fériés français (lundi de Pentecôte compris).
  function holidays(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = Date.UTC(year, month - 1, day);
    const shift = (n) => { const t = new Date(easter + n * 864e5); return dayKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
    return new Set([
      dayKey(year, 1, 1), shift(1), dayKey(year, 5, 1), dayKey(year, 5, 8), shift(39), shift(50),
      dayKey(year, 7, 14), dayKey(year, 8, 15), dayKey(year, 11, 1), dayKey(year, 11, 11), dayKey(year, 12, 25),
    ]);
  }

  const dateLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  const timeLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

  /* ---------------- Outils ---------------- */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  class BookingError extends Error {
    constructor(code, message) { super(message || code); this.code = code; }
  }

  function store(kind, key, value) {
    try {
      const s = kind === "local" ? window.localStorage : window.sessionStorage;
      if (value === undefined) return JSON.parse(s.getItem(key) || "null");
      if (value === null) s.removeItem(key); else s.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
    return null;
  }

  // Écriture qui prévient si le navigateur n'a plus de place (photos, fichiers joints).
  function demoWrite(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { throw new BookingError("storage_full", "Stockage plein"); }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new BookingError("network", "Chargement impossible"));
      document.head.appendChild(s);
    });
  }

  /* ---------------- Branchement démo ---------------- */
  const DEMO_CARS = [
    { brand: "Renault", model: "Clio V", version: "1.0 TCe 90", year: 2021, fuel: "Essence", tire: "195/55 R16" },
    { brand: "Peugeot", model: "208", version: "1.2 PureTech 100", year: 2020, fuel: "Essence", tire: "195/55 R16" },
    { brand: "Citroën", model: "C3", version: "1.5 BlueHDi 100", year: 2019, fuel: "Diesel", tire: "205/50 R17" },
    { brand: "Dacia", model: "Sandero", version: "1.0 TCe 90", year: 2022, fuel: "Essence", tire: "185/65 R15" },
    { brand: "Volkswagen", model: "Golf VII", version: "1.6 TDI 115", year: 2016, fuel: "Diesel", tire: "205/55 R16" },
    { brand: "Toyota", model: "Yaris", version: "1.5 Hybride 116", year: 2021, fuel: "Hybride", tire: "185/65 R15" },
  ];
  const DEMO_KEY = "pp-demo-bookings";
  const DEMO_USER = "pp-demo-user";

  function hash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

  // Plaque de présentation : une vraie voiture, sans publier son immatriculation en clair dans le site.
  // C4 II phase 2 de 2015 : 205/55 R16 ou 225/45 R17 selon la finition.
  const DEMO_KNOWN = new Map([[3079777525, { brand: "Citroën", model: "C4 II phase 2", year: 2015, tire: "205/55 R16", tireAlt: ["225/45 R17"] }]]);

  const demo = {
    name: "demo",
    async lookupPlate(plate) {
      await wait(650);
      const known = DEMO_KNOWN.get(hash(plate));
      if (known) return { ...known };
      return { ...DEMO_CARS[hash(plate) % DEMO_CARS.length], demo: true };
    },
    async getBusy(from, to) {
      await wait(250);
      const busy = [];
      // Quelques créneaux déjà pris, toujours les mêmes pour un jour donné.
      for (let t = from.getTime(); t < to.getTime(); t += 864e5) {
        const p = parisParts(new Date(t));
        const seed = hash(dayKey(p.y, p.m, p.d));
        for (const [i, h] of [[0, 8], [1, 9], [2, 10], [3, 14], [4, 15], [5, 16], [6, 17]]) {
          if ((seed >> (i * 2)) % 4 === 0) {
            const start = parisDate(p.y, p.m, p.d, h, seed % 2 ? 0 : 30);
            busy.push({ start, end: new Date(start.getTime() + 45 * 6e4) });
          }
        }
      }
      for (const b of store("local", "pp-demo-blocks") || []) {
        busy.push({ start: new Date(b.start_at), end: new Date(b.end_at), blocked: true });
      }
      for (const b of store("local", DEMO_KEY) || []) {
        if (b.status !== "annule") busy.push({ start: new Date(b.start_at), end: new Date(b.end_at) });
      }
      return { capacity: cfg.capacity || 1, busy };
    },
    async createBooking(b) {
      await wait(700);
      const user = store("session", DEMO_USER);
      const list = store("local", DEMO_KEY) || [];
      const row = { ...b, id: "DEMO-" + Date.now().toString(36).toUpperCase(), status: "en_attente", user_id: user ? user.id : null, created_at: new Date().toISOString() };
      list.push(row);
      store("local", DEMO_KEY, list);
      return { id: row.id };
    },
    async getUser() { return store("session", DEMO_USER); },
    async signInWithGoogle() {
      await wait(500);
      const u = { id: "demo-user", email: "client.demo@exemple.fr", name: "Client Démo" };
      store("session", DEMO_USER, u);
      return u;
    },
    async signInWithEmail(email) {
      await wait(500);
      store("session", DEMO_USER, { id: "demo-user", email, name: "" });
      return { instant: true };
    },
    async signOut() { store("session", DEMO_USER, null); },
    async myBookings() {
      const u = store("session", DEMO_USER);
      return (store("local", DEMO_KEY) || []).filter((b) => u && b.user_id === u.id).sort((a, b) => b.start_at.localeCompare(a.start_at));
    },
    async cancelBooking(id) {
      const list = store("local", DEMO_KEY) || [];
      const row = list.find((b) => b.id === id);
      if (row) row.status = "annule";
      store("local", DEMO_KEY, list);
    },
    async createQuote(q) {
      await wait(500);
      const list = store("local", "pp-demo-quotes") || [];
      list.push({ ...q, id: "Q" + Date.now(), status: "nouveau", created_at: new Date().toISOString() });
      store("local", "pp-demo-quotes", list);
    },
    async adminQuotes() { return (store("local", "pp-demo-quotes") || []).slice().reverse(); },
    async adminSetQuoteStatus(id, status) {
      const list = store("local", "pp-demo-quotes") || [];
      const row = list.find((q) => q.id === id);
      if (row) row.status = status;
      store("local", "pp-demo-quotes", list);
    },
    async isAdmin() { return true; },
    async adminBookings(from, to) {
      return (store("local", DEMO_KEY) || [])
        .filter((b) => new Date(b.start_at) >= from && new Date(b.start_at) < to)
        .sort((a, b) => a.start_at.localeCompare(b.start_at));
    },
    async adminSetStatus(id, status) {
      const list = store("local", DEMO_KEY) || [];
      const row = list.find((b) => b.id === id);
      if (row) row.status = status;
      store("local", DEMO_KEY, list);
    },
    async adminEvents(days) {
      const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      return (store("local", "pp-demo-events") || []).filter((r) => r.d >= from);
    },
    async adminBlocks() { return store("local", "pp-demo-blocks") || []; },
    async adminBlock(start, end, reason) {
      const list = store("local", "pp-demo-blocks") || [];
      list.push({ id: "B" + Date.now(), start_at: start.toISOString(), end_at: end.toISOString(), reason });
      store("local", "pp-demo-blocks", list);
    },
    async adminDeleteBlock(id) {
      store("local", "pp-demo-blocks", (store("local", "pp-demo-blocks") || []).filter((b) => b.id !== id));
    },
    async products() { return store("local", "pp-demo-products"); },
    async adminSaveProducts(list) { await wait(120); demoWrite("pp-demo-products", list); },
    async qamarList() { return (store("local", "pp-demo-qamar") || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async qamarCreate(r) {
      await wait(400);
      const row = { ...r, id: "QM" + Date.now(), status: "recue", created_at: new Date().toISOString() };
      demoWrite("pp-demo-qamar", [...(store("local", "pp-demo-qamar") || []), row]);
      return row;
    },
  };

  /* ---------------- Branchement Supabase ---------------- */
  function supabaseAdapter() {
    let clientPromise = null;
    const client = () => {
      if (!clientPromise) {
        clientPromise = loadScript(SUPABASE_JS).then(() =>
          window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
            auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" },
          }));
      }
      return clientPromise;
    };
    const check = (error, code) => { if (error) throw new BookingError(code, error.message); };

    return {
      name: "supabase",
      async lookupPlate(plate) {
        const sb = await client();
        const { data, error } = await sb.functions.invoke("plate-lookup", { body: { plate } });
        if (error) {
          const status = error.context && error.context.status;
          throw new BookingError(status === 404 ? "plate_not_found" : status === 429 ? "too_many" : "plate_failed", error.message);
        }
        if (!data || !data.vehicle) throw new BookingError("plate_not_found");
        return data.vehicle;
      },
      async getBusy(from, to) {
        const sb = await client();
        const { data, error } = await sb.rpc("get_busy", { from_ts: from.toISOString(), to_ts: to.toISOString() });
        check(error, "network");
        return {
          capacity: data.capacity || 1,
          busy: (data.busy || []).map((r) => ({ start: new Date(r.start_at), end: new Date(r.end_at), blocked: r.kind === "blocked" })),
        };
      },
      async createBooking(b) {
        const sb = await client();
        const { data, error } = await sb.rpc("create_booking", {
          p_start: b.start_at, p_minutes: b.minutes, p_services: b.services, p_vehicle: b.vehicle,
          p_plate: b.plate, p_name: b.customer_name, p_phone: b.customer_phone,
          p_email: b.customer_email, p_note: b.note, p_total: b.estimated_total,
        });
        if (error) {
          const msg = error.message || "";
          throw new BookingError(msg.includes("creneau_indisponible") ? "slot_taken" : msg.includes("trop_de_rdv") ? "too_many" : "booking_failed", msg);
        }
        return { id: data };
      },
      async getUser() {
        const sb = await client();
        const { data } = await sb.auth.getSession();
        const u = data.session && data.session.user;
        return u ? { id: u.id, email: u.email, name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "" } : null;
      },
      async signInWithGoogle(redirectTo) {
        const sb = await client();
        const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
        check(error, "auth_failed");
        return null; // la page part chez Google puis revient
      },
      async signInWithEmail(email, redirectTo) {
        const sb = await client();
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        check(error, "auth_failed");
        return { instant: false };
      },
      async signOut() { const sb = await client(); await sb.auth.signOut(); },
      async myBookings() {
        const sb = await client();
        const { data, error } = await sb.from("bookings")
          .select("id,start_at,end_at,status,services,vehicle,plate")
          .order("start_at", { ascending: false }).limit(20);
        check(error, "network");
        return data;
      },
      async cancelBooking(id) {
        const sb = await client();
        const { error } = await sb.rpc("cancel_booking", { p_id: id });
        check(error, "cancel_failed");
      },
      async createQuote(q) {
        const sb = await client();
        const { error } = await sb.rpc("create_quote_request", { p_kind: q.kind, p_details: q.details, p_name: q.name, p_phone: q.phone });
        check(error, "quote_failed");
      },
      async adminQuotes() {
        const sb = await client();
        const { data, error } = await sb.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(50);
        check(error, "network");
        return data;
      },
      async adminSetQuoteStatus(id, status) {
        const sb = await client();
        const { error } = await sb.from("quote_requests").update({ status }).eq("id", id);
        check(error, "network");
      },
      async isAdmin() {
        const sb = await client();
        const { data, error } = await sb.rpc("is_admin");
        return !error && data === true;
      },
      async adminBookings(from, to) {
        const sb = await client();
        const { data, error } = await sb.from("bookings").select("*")
          .gte("start_at", from.toISOString()).lt("start_at", to.toISOString()).order("start_at");
        check(error, "network");
        return data;
      },
      async adminSetStatus(id, status) {
        const sb = await client();
        const { error } = await sb.from("bookings").update({ status }).eq("id", id);
        check(error, "network");
      },
      async adminEvents(days) {
        const sb = await client();
        const { data, error } = await sb.rpc("admin_events", { p_days: days });
        check(error, "network");
        return data || [];
      },
      async adminBlocks() {
        const sb = await client();
        const { data, error } = await sb.from("blocked_slots").select("*").gte("end_at", new Date().toISOString()).order("start_at");
        check(error, "network");
        return data;
      },
      async adminBlock(start, end, reason) {
        const sb = await client();
        const { error } = await sb.from("blocked_slots").insert({ start_at: start.toISOString(), end_at: end.toISOString(), reason });
        check(error, "network");
      },
      async adminDeleteBlock(id) {
        const sb = await client();
        const { error } = await sb.from("blocked_slots").delete().eq("id", id);
        check(error, "network");
      },
      async products() {
        const sb = await client();
        const { data, error } = await sb.from("products").select("id,position,data").order("position");
        check(error, "network");
        return data.length ? data.map((r) => ({ ...r.data, id: r.id })) : null;
      },
      async adminSaveProducts(list) {
        const sb = await client();
        const rows = list.map(({ id, ...data }, position) => ({ id, position, data, updated_at: new Date().toISOString() }));
        const { error } = await sb.from("products").upsert(rows);
        check(error, "network");
        const { error: gone } = await sb.from("products").delete().not("id", "in", `(${list.map((p) => `"${p.id}"`).join(",")})`);
        check(gone, "network");
      },
      async qamarList() {
        const sb = await client();
        const { data, error } = await sb.from("dev_requests").select("*").order("created_at", { ascending: false }).limit(100);
        check(error, "network");
        return data;
      },
      async qamarCreate(r) {
        const sb = await client();
        const { data, error } = await sb.from("dev_requests").insert(r).select().single();
        check(error, "qamar_failed");
        return data;
      },
    };
  }

  const live = cfg.mode === "supabase" && cfg.supabaseUrl && cfg.supabaseAnonKey;

  // Anti-spam côté navigateur : case invisible que seuls les robots remplissent, et envoi trop rapide pour un humain.
  // La vraie barrière reste côté serveur (limites dans supabase/schema.sql).
  const bornAt = Date.now();
  const spam = { suspect: (form) => Boolean(form.elements.website && form.elements.website.value) || Date.now() - bornAt < 2500 };

  window.BookingAPI = {
    spam,
    api: live ? supabaseAdapter() : demo,
    isDemo: !live,
    BookingError,
    plate: { normalize: normalizePlate, isValid: isValidPlate, format: formatPlate },
    time: { parisParts, parisDate, dayKey, toMinutes, holidays, pad, dateLabel, timeLabel },
    store,
  };
})();
