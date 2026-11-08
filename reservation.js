/* Parcours de prise de rendez-vous : véhicule → prestations → créneau → coordonnées → confirmation. */
(function () {
  "use strict";

  const cfg = window.BOOKING_CONFIG;
  const { api, isDemo, plate: P, time: T, store } = window.BookingAPI;
  const $ = (id) => document.getElementById(id);
  const STATE_KEY = "pp-booking-state";
  const TIRE_SIZES = {
    width: [135, 145, 155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315, 325, 335, 345, 355],
    aspect: [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80],
    rim: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
  };
  const SERVICES = new Map(cfg.services.map((s) => [s.id, s]));
  const euro = (n) => `${n.toLocaleString("fr-FR")} €`;
  // « 9 h », « 9 h 30 » (ou « 9 h 00 » dans la grille, pour l'alignement)
  const hourText = (date, grid = false) => {
    const p = T.parisParts(date);
    return `${p.h} h${p.min || grid ? ` ${T.pad(p.min)}` : ""}`;
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- État ---------------- */
  const fresh = () => ({
    step: 1,
    plate: "",
    vehicle: null,          // { brand, model, version, year, fuel, tire, demo }
    manual: false,
    picked: {},             // { serviceId: { option, qty, season, size, unknownSize, note } }
    day: null,              // "YYYY-MM-DD"
    slot: null,             // ISO de début
    customer: { name: "", phone: "", email: "", note: "" },
    done: null,             // { id, start }
  });
  let state = Object.assign(fresh(), store("session", STATE_KEY) || {});
  const save = () => store("session", STATE_KEY, state);

  // Préremplissage depuis le site : reserver.html?prestation=pneus&taille=205/55R16&saison=Hiver
  // ou reserver.html?plaque=AB-123-CD (la plaque tapée en bas de l'accueil)
  let autoPlate = "", plateFromHome = false;
  (function fromUrl() {
    const q = new URLSearchParams(location.search);
    const id = q.get("prestation");
    const plate = P.normalize(q.get("plaque") || "");
    if ((id || plate) && state.done) { const keep = state.customer; state = fresh(); state.customer = keep; }
    if (plate) {
      plateFromHome = true;
      if (plate !== state.plate || !state.vehicle || state.manual) {
        Object.assign(state, { plate: "", vehicle: null, manual: false, day: null, slot: null });
        autoPlate = plate;
      }
      state.step = 1;
    }
    if (id && SERVICES.has(id)) {
      if (state.picked[id]) delete state.picked[id];
      state.picked[id] = defaultsFor(SERVICES.get(id));
      const size = (q.get("taille") || "").match(/^(\d{3})\/(\d{2})\s*R?(\d{2})$/i);
      if (size && id === "pneus") state.picked.pneus.size = `${size[1]}/${size[2]} R${size[3]}`;
      if (q.get("saison") && id === "pneus") state.picked.pneus.season = q.get("saison");
      const qty = Number(q.get("qte"));
      if ([1, 2, 4].includes(qty) && id === "pneus") state.picked.pneus.qty = qty;
    }
  })();

  function defaultsFor(s) {
    const d = {};
    if (s.options) d.option = s.options[0].id;
    if (s.id === "clim" && state.vehicle && state.vehicle.year) d.option = state.vehicle.year >= 2017 ? "r1234yf" : "r134a";
    if (s.kind === "tires") Object.assign(d, { qty: 2, season: "Été", size: (state.vehicle && state.vehicle.tire) || "", unknownSize: false });
    if (s.needsNote) d.note = "";
    return d;
  }

  /* ---------------- Calculs ---------------- */
  function serviceMinutes(id, pick) {
    const s = SERVICES.get(id);
    if (s.minutesByQty) return s.minutesByQty[pick.qty] || 30;
    return s.minutes || 30;
  }
  const totalMinutes = () => Math.min(240, Object.entries(state.picked).reduce((t, [id, p]) => t + serviceMinutes(id, p), 0));

  function servicePrice(id, pick) {
    const s = SERVICES.get(id);
    if (s.options) { const o = s.options.find((x) => x.id === pick.option); return o ? o.price : null; }
    return typeof s.price === "number" ? s.price : null;
  }

  function estimate() {
    let total = 0, quote = false;
    for (const [id, p] of Object.entries(state.picked)) {
      const price = servicePrice(id, p);
      if (price === null) quote = true; else total += price;
    }
    return { total, quote };
  }

  function serviceLine(id, p) {
    const s = SERVICES.get(id);
    let label = s.title;
    if (s.options) { const o = s.options.find((x) => x.id === p.option); if (o) label += ` · ${o.label}`; }
    if (s.kind === "tires") label += ` · ${p.qty} pneu${p.qty > 1 ? "s" : ""} ${p.season.toLowerCase()}${p.unknownSize || !p.size ? "" : ` · ${p.size}`}`;
    const price = servicePrice(id, p);
    return { label, price: price === null ? (s.priceLabel || "Sur devis") : euro(price) };
  }

  const vehicleText = () => {
    const v = state.vehicle;
    if (!v) return "";
    return [v.brand, v.model, v.version].filter(Boolean).join(" ") + (v.year ? ` (${v.year})` : "");
  };

  /* ---------------- Navigation ---------------- */
  const steps = [...document.querySelectorAll(".step")];
  const backBtn = $("back"), nextBtn = $("next");

  function showStep(n, focus = true) {
    state.step = n;
    save();
    for (const s of steps) s.hidden = Number(s.dataset.step) !== n;
    for (const li of document.querySelectorAll("#stepper li")) {
      const k = Number(li.dataset.for);
      li.classList.toggle("is-done", k < n);
      li.classList.toggle("is-current", k === n);
      if (k === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    }
    document.body.classList.toggle("is-finished", n === 5);
    $("step-nav").hidden = n === 5;
    backBtn.hidden = n === 1;
    nextBtn.textContent = n === 4 ? "Confirmer" : "Continuer";
    if (n === 2) renderServices();
    if (n === 3) renderSlots();
    if (n === 4) { renderRecap(); refreshAccount(); }
    if (n === 5) renderDone();
    renderSummary();
    if (focus) {
      const h = steps.find((s) => !s.hidden).querySelector("h2");
      h.focus({ preventScroll: true });
      const top = $("stepper").getBoundingClientRect().top + window.scrollY - 100;
      if (Math.abs(window.scrollY - top) > 40) window.scrollTo({ top, behavior: "smooth" });
    }
  }

  function showError(id, msg) { const el = $(id); el.textContent = msg || ""; el.hidden = !msg; }

  backBtn.addEventListener("click", () => showStep(Math.max(1, state.step - 1)));
  nextBtn.addEventListener("click", async () => {
    if (state.step === 1 && validateVehicle()) showStep(2);
    else if (state.step === 2 && validateServices()) showStep(3);
    else if (state.step === 3 && validateSlot()) showStep(4);
    else if (state.step === 4) submit();
  });

  /* ---------------- Étape 1 : véhicule ---------------- */
  const plateInput = $("plate");
  plateInput.value = state.plate ? P.format(state.plate) : "";

  plateInput.addEventListener("input", () => {
    const raw = P.normalize(plateInput.value);
    // Mise en forme AB-123-CD pendant la saisie (format actuel)
    if (/^[A-Z]{2}\d{0,3}[A-Z]{0,2}$/.test(raw) && raw.length > 2) {
      const f = raw.slice(0, 2) + "-" + raw.slice(2, 5) + (raw.length > 5 ? "-" + raw.slice(5, 7) : "");
      if (f !== plateInput.value) plateInput.value = f;
    }
    showError("plate-error", "");
    plateInput.removeAttribute("aria-invalid");
  });

  $("plate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = P.normalize(plateInput.value);
    if (!P.isValid(raw)) {
      plateInput.setAttribute("aria-invalid", "true");
      showError("plate-error", "Plaque non reconnue. Format attendu : AB-123-CD (ou 1234 AB 66).");
      return;
    }
    const btn = $("plate-submit");
    btn.disabled = true;
    btn.textContent = "Recherche…";
    try {
      const v = await api.lookupPlate(raw);
      state.plate = raw;
      state.vehicle = v;
      state.manual = false;
      // la taille trouvée remplit la prestation pneus si elle est déjà cochée
      if (state.picked.pneus && !state.picked.pneus.size && v.tire) state.picked.pneus.size = v.tire;
      save();
      renderVehicle();
      showError("s1-error", "");
      if (autoPlate) { autoPlate = ""; showStep(2); }
    } catch (err) {
      const msg = {
        plate_not_found: "Nous n'avons pas trouvé ce véhicule. Vérifiez la plaque, ou indiquez la marque et le modèle.",
        too_many: "Trop de recherches d'affilée. Patientez un peu, ou indiquez la marque et le modèle.",
      }[err.code] || "La recherche ne répond pas pour le moment. Indiquez la marque et le modèle à la place.";
      showError("plate-error", msg);
      if (err.code !== "too_many") openManual();
      autoPlate = "";
    } finally {
      btn.disabled = false;
      btn.textContent = "Rechercher";
    }
  });

  function renderVehicle() {
    const card = $("vehicle-card");
    if (!state.vehicle || state.manual) { card.hidden = true; return; }
    const v = state.vehicle;
    $("vehicle-plate").textContent = state.plate ? P.format(state.plate) : "";
    $("vehicle-name").textContent = [v.brand, v.model].filter(Boolean).join(" ");
    const meta = [v.version, v.year, v.fuel, v.tire ? `pneus ${v.tire}` : ""].filter(Boolean).join(" · ");
    $("vehicle-meta").textContent = meta + (v.demo ? " · véhicule fictif (démo)" : "");
    card.hidden = false;
    $("manual-vehicle").hidden = true;
    $("no-plate").hidden = true;
  }

  function openManual() {
    state.manual = true;
    $("vehicle-card").hidden = true;
    $("manual-vehicle").hidden = false;
    $("no-plate").hidden = true;
    const v = state.vehicle && state.manual ? state.vehicle : null;
    if (v) { $("m-brand").value = v.brand || ""; $("m-model").value = v.model || ""; $("m-year").value = v.year || ""; }
    save();
  }

  $("no-plate").addEventListener("click", () => { openManual(); $("m-brand").focus(); });
  $("not-my-car").addEventListener("click", () => {
    state.vehicle = null;
    state.plate = "";
    plateInput.value = "";
    openManual();
    $("m-brand").focus();
  });

  function validateVehicle() {
    if (state.manual) {
      const brand = $("m-brand").value.trim(), model = $("m-model").value.trim(), year = $("m-year").value.trim();
      if (!brand || !model) { showError("s1-error", "Indiquez au moins la marque et le modèle."); ($("m-brand").value ? $("m-model") : $("m-brand")).focus(); return false; }
      const y = Number(year);
      state.vehicle = { brand, model, year: y >= 1950 && y <= 2100 ? y : null, manual: true };
      save();
    }
    if (!state.vehicle) {
      showError("s1-error", "Recherchez votre plaque, ou choisissez « Je n'ai pas ma plaque sous la main ».");
      plateInput.focus();
      return false;
    }
    showError("s1-error", "");
    return true;
  }

  /* ---------------- Étape 2 : prestations ---------------- */
  function sizeOptions(list, current) {
    return list.map((v) => `<option${String(v) === String(current) ? " selected" : ""}>${v}</option>`).join("");
  }

  function renderServices() {
    const box = $("services-pick");
    box.innerHTML = cfg.services.map((s) => {
      const p = state.picked[s.id];
      const on = Boolean(p);
      let price = s.priceLabel || (typeof s.price === "number" ? euro(s.price) : "");
      if (s.options) price = `dès ${euro(Math.min(...s.options.map((o) => o.price)))}`;
      let extra = "";
      if (on && s.options) {
        extra = `<fieldset class="opt-list"><legend class="sr-only">${escapeHtml(s.title)} : formule</legend>${s.options.map((o) => `
          <label class="opt"><input type="radio" name="opt-${s.id}" value="${o.id}" data-svc="${s.id}" data-k="option"${p.option === o.id ? " checked" : ""}>
          <span>${escapeHtml(o.label)}${o.hint ? ` <small>${escapeHtml(o.hint)}</small>` : ""}</span><b>${euro(o.price)}</b></label>`).join("")}</fieldset>`;
      }
      if (on && s.kind === "tires") {
        const [w, a, r] = (p.size.match(/^(\d{3})\/(\d{2}) R(\d{2})$/) || [, 205, 55, 16]).slice(1);
        extra = `<div class="tire-opts">
          <fieldset class="pills"><legend>Nombre de pneus</legend>${[1, 2, 4].map((n) => `<label><input type="radio" name="qty" value="${n}" data-svc="pneus" data-k="qty"${p.qty === n ? " checked" : ""}><span>${n}</span></label>`).join("")}</fieldset>
          <fieldset class="pills"><legend>Saison</legend>${["Été", "Hiver", "4 saisons"].map((n) => `<label><input type="radio" name="season" value="${n}" data-svc="pneus" data-k="season"${p.season === n ? " checked" : ""}><span>${n}</span></label>`).join("")}</fieldset>
          <div class="size-pick"${p.unknownSize ? " hidden" : ""}>
            <p class="size-label">Taille ${state.vehicle && state.vehicle.tire && p.size === state.vehicle.tire ? "<small>(trouvée avec votre plaque, à vérifier sur le flanc du pneu)</small>" : ""}</p>
            <div class="size-selects">
              <select aria-label="Largeur" data-size="w">${sizeOptions(TIRE_SIZES.width, w)}</select><span>/</span>
              <select aria-label="Hauteur" data-size="a">${sizeOptions(TIRE_SIZES.aspect, a)}</select><span>R</span>
              <select aria-label="Diamètre de jante" data-size="r">${sizeOptions(TIRE_SIZES.rim, r)}</select>
            </div>
          </div>
          <label class="check"><input type="checkbox" data-svc="pneus" data-k="unknownSize"${p.unknownSize ? " checked" : ""}><span>Je ne connais pas la taille, on regardera au garage</span></label>
        </div>`;
      }
      if (on && s.needsNote) {
        extra = `<label class="field"><span>Décrivez en quelques mots</span><textarea rows="2" data-svc="${s.id}" data-k="note" placeholder="Bruit à l'avant en tournant, voyant moteur…">${escapeHtml(p.note || "")}</textarea></label>`;
      }
      return `<div class="svc${on ? " is-on" : ""}">
        <label class="svc-head"><input type="checkbox" value="${s.id}" data-toggle${on ? " checked" : ""}>
          <span class="svc-text"><span class="svc-title">${escapeHtml(s.title)}</span><span class="svc-desc">${escapeHtml(s.desc || "")}</span></span>
          <span class="svc-price">${escapeHtml(price)}</span></label>
        ${extra ? `<div class="svc-extra">${extra}</div>` : ""}
      </div>`;
    }).join("");
  }

  $("services-pick").addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-toggle]")) {
      if (t.checked) state.picked[t.value] = defaultsFor(SERVICES.get(t.value));
      else delete state.picked[t.value];
      state.slot = null; // la durée change, on revalide le créneau
      save();
      renderServices();
      renderSummary();
      const again = document.querySelector(`#services-pick input[value="${t.value}"][data-toggle]`);
      if (again) again.focus();
      showError("s2-error", "");
      return;
    }
    if (t.dataset.svc) {
      const p = state.picked[t.dataset.svc];
      const k = t.dataset.k;
      if (k === "qty") { p.qty = Number(t.value); state.slot = null; }
      else if (k === "unknownSize") { p.unknownSize = t.checked; renderAfter(t); }
      else if (k !== "note") p[k] = t.value;
      save();
      renderSummary();
      return;
    }
    if (t.dataset.size) {
      const sel = document.querySelectorAll(".size-selects select");
      state.picked.pneus.size = `${sel[0].value}/${sel[1].value} R${sel[2].value}`;
      save();
      renderSummary();
    }
  });
  $("services-pick").addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.k === "note") { state.picked[t.dataset.svc].note = t.value; save(); }
  });
  function renderAfter(t) { const pick = t.closest(".tire-opts").querySelector(".size-pick"); pick.hidden = t.checked; }

  function validateServices() {
    const ids = Object.keys(state.picked);
    if (!ids.length) { showError("s2-error", "Choisissez au moins une prestation."); return false; }
    const t = state.picked.pneus;
    if (t && !t.unknownSize && !t.size) {
      const sel = document.querySelectorAll(".size-selects select");
      if (sel.length) t.size = `${sel[0].value}/${sel[1].value} R${sel[2].value}`;
    }
    for (const id of ids) {
      const s = SERVICES.get(id);
      if (s.needsNote && !(state.picked[id].note || "").trim()) {
        showError("s2-error", `Décrivez votre besoin pour « ${s.title} ».`);
        const ta = document.querySelector(`textarea[data-svc="${id}"]`);
        if (ta) ta.focus();
        return false;
      }
    }
    save();
    showError("s2-error", "");
    return true;
  }

  /* ---------------- Étape 3 : créneau ---------------- */
  let busyCache = null;

  function openDays() {
    const now = T.parisParts(new Date());
    const days = [];
    const hol = new Set([...T.holidays(now.y), ...T.holidays(now.y + 1)]);
    for (let i = 0; days.length < cfg.daysAhead && i < 60; i++) {
      const t = new Date(Date.UTC(now.y, now.m - 1, now.d + i));
      const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
      const iso = ((t.getUTCDay() + 6) % 7) + 1;
      const key = T.dayKey(y, m, d);
      if (!cfg.hours[iso] || hol.has(key) || cfg.closedDates.includes(key)) continue;
      days.push({ y, m, d, iso, key });
    }
    return days;
  }

  function slotsFor(day, minutes, busy, capacity) {
    const out = [];
    const earliest = Date.now() + cfg.minLeadMinutes * 6e4;
    for (const [open, close] of cfg.hours[day.iso]) {
      const o = T.toMinutes(open), c = T.toMinutes(close);
      for (let t = o; t + minutes <= c; t += cfg.slotStep) {
        const start = T.parisDate(day.y, day.m, day.d, Math.floor(t / 60), t % 60);
        const end = new Date(start.getTime() + minutes * 6e4);
        if (start.getTime() < earliest) continue;
        let used = 0, blocked = false;
        for (const b of busy) {
          if (b.start < end && b.end > start) { if (b.blocked) blocked = true; else used++; }
        }
        out.push({ start, end, free: !blocked && used < capacity, morning: t < 12 * 60 });
      }
    }
    return out;
  }

  async function renderSlots() {
    const minutes = totalMinutes();
    $("s3-lead").textContent = `Durée estimée : ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60 ? T.pad(minutes % 60) : ""}` : `${minutes} min`}. Les créneaux grisés sont déjà pris.`;
    const days = openDays();
    const daysBox = $("days"), timesBox = $("times");
    timesBox.innerHTML = `<p class="loading">Chargement des disponibilités…</p>`;
    showError("s3-error", "");
    try {
      const from = T.parisDate(days[0].y, days[0].m, days[0].d, 0, 0);
      const last = days[days.length - 1];
      const to = T.parisDate(last.y, last.m, last.d, 23, 59);
      busyCache = await api.getBusy(from, to);
    } catch (e) {
      timesBox.innerHTML = "";
      showError("s3-error", "Impossible de charger les créneaux. Vérifiez votre connexion, ou appelez le 04 68 50 50 68.");
      return;
    }
    const byDay = days.map((d) => ({ ...d, slots: slotsFor(d, minutes, busyCache.busy, busyCache.capacity) }));
    if (!state.day || !byDay.some((d) => d.key === state.day && d.slots.some((s) => s.free))) {
      const first = byDay.find((d) => d.slots.some((s) => s.free));
      state.day = first ? first.key : byDay[0].key;
    }
    const fmtDay = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    daysBox.innerHTML = byDay.map((d) => {
      const free = d.slots.filter((s) => s.free).length;
      const label = fmtDay.format(new Date(Date.UTC(d.y, d.m - 1, d.d))).replace(".", "");
      const [wd, ...rest] = label.split(" ");
      return `<button type="button" role="radio" class="day${d.key === state.day ? " is-on" : ""}" data-day="${d.key}" aria-checked="${d.key === state.day}"${free ? "" : " disabled"}>
        <span class="day-wd">${wd}</span><span class="day-d">${rest.join(" ")}</span><span class="day-n">${free ? `${free} libre${free > 1 ? "s" : ""}` : "complet"}</span></button>`;
    }).join("");
    const current = daysBox.querySelector(".is-on");
    if (current) current.scrollIntoView({ block: "nearest", inline: "center" });
    renderTimes(byDay.find((d) => d.key === state.day));
    daysBox.onclick = (e) => {
      const b = e.target.closest("[data-day]");
      if (!b || b.disabled) return;
      state.day = b.dataset.day;
      state.slot = null;
      save();
      for (const x of daysBox.querySelectorAll(".day")) { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", on); }
      renderTimes(byDay.find((d) => d.key === state.day));
      renderSummary();
    };
  }

  function renderTimes(day) {
    const box = $("times");
    if (!day || !day.slots.some((s) => s.free)) { box.innerHTML = `<p class="loading">Complet ce jour-là. Choisissez un autre jour.</p>`; return; }
    const group = (title, list) => list.length ? `<p class="times-title">${title}</p><div class="times-grid" role="radiogroup" aria-label="${title}">${list.map((s) => {
      const iso = s.start.toISOString();
      const on = state.slot === iso;
      return `<button type="button" role="radio" class="time${on ? " is-on" : ""}" data-slot="${iso}" aria-checked="${on}"${s.free ? "" : " disabled"}>${hourText(s.start, true)}</button>`;
    }).join("")}</div>` : "";
    box.innerHTML = group("Matin", day.slots.filter((s) => s.morning)) + group("Après-midi", day.slots.filter((s) => !s.morning));
    box.onclick = (e) => {
      const b = e.target.closest("[data-slot]");
      if (!b || b.disabled) return;
      state.slot = b.dataset.slot;
      save();
      for (const x of box.querySelectorAll(".time")) { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", on); }
      showError("s3-error", "");
      renderSummary();
    };
  }

  function validateSlot() {
    if (!state.slot) { showError("s3-error", "Choisissez une heure."); return false; }
    return true;
  }

  /* ---------------- Étape 4 : compte, coordonnées, récapitulatif ---------------- */
  const fields = { name: $("c-name"), phone: $("c-phone"), email: $("c-email"), note: $("c-note") };
  for (const [k, el] of Object.entries(fields)) {
    el.value = state.customer[k] || "";
    el.addEventListener("input", () => { state.customer[k] = el.value; save(); setInvalid(el, false); });
  }

  function setInvalid(el, bad) {
    const err = el.parentElement.querySelector(".error");
    if (bad) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    if (err) err.hidden = !bad;
  }

  const validPhone = (v) => { const d = v.replace(/\D/g, ""); return d.length >= 10 && d.length <= 15; };
  const validEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  function returnUrl() { return location.origin + location.pathname + "?retour=compte"; }

  async function refreshAccount() {
    let user = null;
    try { user = await api.getUser(); } catch (e) { user = null; }
    $("signed-out").hidden = Boolean(user);
    $("signed-in").hidden = !user;
    if (user) {
      $("user-email").textContent = user.email;
      if (!fields.email.value) { fields.email.value = user.email; state.customer.email = user.email; }
      if (!fields.name.value && user.name) { fields.name.value = user.name; state.customer.name = user.name; }
      save();
    }
    return user;
  }

  $("google-button").addEventListener("click", async () => {
    save();
    const btn = $("google-button");
    btn.disabled = true;
    try {
      await api.signInWithGoogle(returnUrl());
      await refreshAccount();
    } catch (e) {
      showError("s4-error", "La connexion Google n'a pas abouti. Vous pouvez continuer sans compte.");
    } finally {
      btn.disabled = false;
    }
  });

  $("email-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("login-email").value.trim();
    const msg = $("email-login-msg");
    if (!validEmail(email) || !email) { msg.textContent = "Indiquez une adresse e-mail valide."; return; }
    save();
    try {
      const r = await api.signInWithEmail(email, returnUrl());
      if (r && r.instant) await refreshAccount();
      else msg.textContent = `C'est envoyé. Ouvrez le lien reçu à ${email} sur ce téléphone : vous reviendrez ici, votre réservation est gardée.`;
    } catch (err) {
      msg.textContent = "L'envoi n'a pas abouti. Vous pouvez continuer sans compte.";
    }
  });

  $("sign-out").addEventListener("click", async () => { await api.signOut(); refreshAccount(); });

  function slotText(iso) {
    const d = new Date(iso);
    const day = T.dateLabel.format(d);
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} à ${hourText(d)}`;
  }

  function renderRecap() {
    const lines = Object.entries(state.picked).map(([id, p]) => serviceLine(id, p));
    const { total, quote } = estimate();
    $("recap").innerHTML = `<p class="recap-title">Récapitulatif</p>
      <dl>
        <dt>Quand</dt><dd>${escapeHtml(state.slot ? slotText(state.slot) : "")}</dd>
        <dt>Véhicule</dt><dd>${escapeHtml(vehicleText())}${state.plate ? ` · ${escapeHtml(P.format(state.plate))}` : ""}</dd>
        <dt>Prestations</dt><dd><ul>${lines.map((l) => `<li><span>${escapeHtml(l.label)}</span><b>${escapeHtml(l.price)}</b></li>`).join("")}</ul></dd>
      </dl>
      <p class="recap-total"><span>Total estimé</span><strong>${total ? euro(total) : "Sur devis"}${total && quote ? " + devis" : ""}</strong></p>`;
  }

  let sending = false;
  async function submit() {
    if (sending) return;
    const c = state.customer;
    let firstBad = null;
    const bad = (el, cond) => { setInvalid(el, cond); if (cond && !firstBad) firstBad = el; };
    bad(fields.name, c.name.trim().length < 2);
    bad(fields.phone, !validPhone(c.phone));
    bad(fields.email, !validEmail(c.email.trim()));
    if (firstBad) { firstBad.focus(); return; }

    sending = true;
    nextBtn.disabled = true;
    nextBtn.textContent = "Envoi…";
    showError("s4-error", "");
    const start = new Date(state.slot);
    const minutes = totalMinutes();
    const { total, quote } = estimate();
    const services = Object.entries(state.picked).map(([id, p]) => ({ id, ...p, ...serviceLine(id, p) }));
    try {
      const r = await api.createBooking({
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + minutes * 6e4).toISOString(),
        minutes,
        services,
        vehicle: state.vehicle,
        plate: state.plate ? P.format(state.plate) : null,
        customer_name: c.name.trim(),
        customer_phone: c.phone.trim(),
        customer_email: c.email.trim() || null,
        note: c.note.trim() || null,
        estimated_total: total || null,
        quote_needed: quote,
      });
      state.done = { id: r.id, start: state.slot, minutes, name: c.name.trim().split(/\s+/)[0] };
      save();
      showStep(5);
    } catch (err) {
      if (err.code === "slot_taken") {
        state.slot = null;
        save();
        showStep(3);
        showError("s3-error", "Ce créneau vient d'être pris. Choisissez-en un autre.");
      } else if (err.code === "too_many") {
        showError("s4-error", "Vous avez déjà plusieurs rendez-vous à venir. Appelez-nous au 04 68 50 50 68.");
      } else {
        showError("s4-error", "La réservation n'a pas pu être envoyée. Réessayez, ou appelez le 04 68 50 50 68.");
      }
    } finally {
      sending = false;
      nextBtn.disabled = false;
      if (state.step === 4) nextBtn.textContent = "Confirmer";
    }
  }

  /* ---------------- Fin ---------------- */
  function icsFor(done) {
    const s = new Date(done.start), e = new Date(s.getTime() + done.minutes * 6e4);
    const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const what = Object.values(state.picked).length ? Object.entries(state.picked).map(([id]) => SERVICES.get(id).title).join(", ") : "Rendez-vous";
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Point Pneus Guerido//RDV//FR", "BEGIN:VEVENT",
      `UID:${done.id}@point-pneus-guerido.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(s)}`, `DTEND:${stamp(e)}`,
      `SUMMARY:Point Pneus Guerido : ${what}`, "LOCATION:9 Rue Henri Becquerel\\, 66330 Cabestany",
      "DESCRIPTION:Garage : 04 68 50 50 68", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }

  function renderDone() {
    const d = state.done;
    if (!d) { showStep(1); return; }
    $("s5-title").textContent = d.name ? `C'est noté, ${d.name} !` : "C'est noté !";
    $("done-when").textContent = slotText(d.start);
    $("done-text").textContent = isDemo
      ? "Démonstration : rien n'a été envoyé au garage. Une fois le site branché, le garage reçoit la demande et vous confirme le rendez-vous."
      : "Le garage a bien reçu votre demande et vous confirme le rendez-vous par téléphone ou par e-mail. Pensez à venir avec la carte grise si on commande des pneus.";
    $("ics-link").href = "data:text/calendar;charset=utf-8," + encodeURIComponent(icsFor(d));
  }

  $("new-booking").addEventListener("click", () => {
    const keepCustomer = state.customer;
    state = fresh();
    state.customer = keepCustomer;
    plateInput.value = "";
    $("manual-vehicle").hidden = true;
    $("no-plate").hidden = false;
    renderVehicle();
    showStep(1);
  });

  /* ---------------- Résumé ---------------- */
  function renderSummary() {
    $("sum-vehicle").textContent = vehicleText() || "À choisir";
    const lines = Object.entries(state.picked).map(([id, p]) => serviceLine(id, p));
    $("sum-services").innerHTML = lines.length ? `<ul>${lines.map((l) => `<li><span>${escapeHtml(l.label)}</span><b>${escapeHtml(l.price)}</b></li>`).join("")}</ul>` : "À choisir";
    $("sum-slot").textContent = state.slot ? slotText(state.slot) : "À choisir";
    const { total, quote } = estimate();
    $("sum-total").textContent = lines.length ? (total ? `${euro(total)}${quote ? " + devis" : ""}` : "Sur devis") : "–";
    $("sum-note").textContent = lines.length ? "Paiement au garage. Montage, équilibrage et valves inclus pour les pneus." : "";
  }

  /* ---------------- Mes rendez-vous ---------------- */
  const sheet = $("my-bookings");
  const STATUS = { en_attente: "En attente de confirmation", confirme: "Confirmé", annule: "Annulé", termine: "Terminé" };

  async function openMyBookings() {
    const body = $("mb-body");
    body.innerHTML = `<p class="loading">Chargement…</p>`;
    if (typeof sheet.showModal === "function") sheet.showModal(); else sheet.setAttribute("open", "");
    const user = await api.getUser().catch(() => null);
    if (!user) {
      body.innerHTML = `<p>Connectez-vous pour retrouver vos rendez-vous.</p>
        <button class="btn btn-google btn-wide" type="button" id="mb-google">Continuer avec Google</button>
        <p class="form-hint">Vous avez réservé sans compte ? Appelez le <a href="tel:+33468505068">04 68 50 50 68</a> pour modifier ou annuler.</p>`;
      $("mb-google").onclick = async () => { save(); await api.signInWithGoogle(location.origin + location.pathname + "?retour=mes-rdv"); openMyBookings(); };
      return;
    }
    let list = [];
    try { list = await api.myBookings(); } catch (e) { body.innerHTML = "<p>Impossible de charger vos rendez-vous pour le moment.</p>"; return; }
    if (!list.length) { body.innerHTML = `<p>Aucun rendez-vous pour ${escapeHtml(user.email)}.</p>`; return; }
    body.innerHTML = `<ul class="mb-list">${list.map((b) => {
      const future = new Date(b.start_at).getTime() > Date.now() + 2 * 36e5;
      const canCancel = future && (b.status === "en_attente" || b.status === "confirme");
      const what = (b.services || []).map((s) => s.title || s.label || s.id).join(", ");
      return `<li><p class="mb-when">${escapeHtml(slotText(b.start_at))}</p><p>${escapeHtml(what)}</p>
        <p class="mb-status mb-${b.status}">${STATUS[b.status] || b.status}</p>
        ${canCancel ? `<button class="text-btn" type="button" data-cancel="${b.id}">Annuler ce rendez-vous</button>` : ""}</li>`;
    }).join("")}</ul><p class="form-hint">Annulation en ligne jusqu'à 2 h avant. Après, appelez le garage.</p>`;
    body.onclick = async (e) => {
      const b = e.target.closest("[data-cancel]");
      if (!b) return;
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirmer l'annulation"; return; }
      b.disabled = true;
      try { await api.cancelBooking(b.dataset.cancel); openMyBookings(); }
      catch (err) { b.textContent = "Annulation impossible, appelez le garage"; }
    };
  }

  $("account-button").addEventListener("click", openMyBookings);
  $("mb-close").addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });

  /* ---------------- Démarrage ---------------- */
  $("demo-banner").hidden = !isDemo;
  if (state.manual) {
    openManual();
    if (state.vehicle) { $("m-brand").value = state.vehicle.brand || ""; $("m-model").value = state.vehicle.model || ""; $("m-year").value = state.vehicle.year || ""; }
  } else {
    renderVehicle();
  }
  const ret = new URLSearchParams(location.search).get("retour");
  if (location.search) history.replaceState(null, "", location.pathname);
  showStep(state.done ? 5 : state.step || 1, false);
  if (ret === "mes-rdv") openMyBookings();
  // Plaque venue de l'accueil : on cherche le véhicule puis on passe aux prestations
  if (autoPlate) {
    plateInput.value = P.format(autoPlate);
    $("plate-form").requestSubmit();
  } else if (plateFromHome && state.vehicle && state.step === 1) {
    showStep(2, false);
  }
})();
