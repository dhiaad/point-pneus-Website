// Adresse qui reçoit les demandes de devis.
const SHOP_EMAIL = "pointpneusguerido@free.fr";

const SIZES = {
  width: [135, 145, 155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315, 325, 335, 345, 355],
  aspect: [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80],
  rim: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
};
const DEFAULT_SIZE = { width: 205, aspect: 55, rim: 16 };

// De la petite citadine au 4x4, un pneu fait en général de 480 à 900 mm de diamètre.
const USUAL_DIAMETER = { min: 480, max: 900 };

// Dessin du pneu, dans un repère de 640 x 640
const CENTER = 320;
const MAX_RADIUS = 296;
const BASE_SCALE = 0.84; // pixels par millimètre
const WHEEL_BASE_RADIUS = 170;
const TIRE_ANIMATION_MS = 550;

// Scène : position de la roue avant et rayon du pneu dans le décor
const WHEEL_X = 300;
const WHEEL_Y = 0;
const TIRE_RADIUS = 88;
const ROLL_RADIUS = 85;
const STRIP_WIDTH = 2400;

// Horaires habituels, en minutes depuis minuit. 1 = lundi.
const OPENING_HOURS = {
  1: [[480, 720], [840, 1110]],
  2: [[480, 720], [840, 1110]],
  3: [[480, 720], [840, 1110]],
  4: [[480, 720], [840, 1110]],
  5: [[480, 720], [840, 1110]],
};
const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const $ = (id) => document.getElementById(id);
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (from, to, t) => from + (to - from) * t;
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const compactLayout = window.matchMedia("(max-width: 900px), (max-height: 660px)");

/* ---------- Pneu et sélecteur de taille ---------- */

const selects = { width: $("width"), aspect: $("aspect"), rim: $("rim") };

for (const [key, select] of Object.entries(selects)) {
  for (const value of SIZES[key]) {
    select.add(new Option(value, value, false, value === DEFAULT_SIZE[key]));
  }
}

(function drawSpokes() {
  const group = $("spokes");
  const svgNS = "http://www.w3.org/2000/svg";
  for (let i = 0; i < 5; i++) {
    for (const lean of [-7, 7]) {
      const spoke = document.createElementNS(svgNS, "path");
      spoke.setAttribute("d", "M314 320 L316 168 L324 168 L326 320 Z");
      spoke.setAttribute("transform", `rotate(${i * 72 + lean} ${CENTER} ${CENTER})`);
      group.appendChild(spoke);
    }
  }
})();

let tireGeometry = null;
let tireFrame = null;
let tireAngle = 0;

function readSize() {
  return {
    width: Number(selects.width.value),
    aspect: Number(selects.aspect.value),
    rim: Number(selects.rim.value),
  };
}

function sizeLabel({ width, aspect, rim }) {
  return `${width}/${aspect} R${rim}`;
}

function measure({ width, aspect, rim }) {
  const sidewall = (width * aspect) / 100;
  const rimDiameter = rim * 25.4;
  return { sidewall, total: rimDiameter + 2 * sidewall, rimDiameter };
}

function geometryFor(size) {
  const { total, rimDiameter } = measure(size);
  const scale = Math.min(BASE_SCALE, MAX_RADIUS / (total / 2));
  return { outer: (total / 2) * scale, inner: (rimDiameter / 2) * scale };
}

function arc(radius, sweep) {
  return `M${CENTER - radius} ${CENTER} A${radius} ${radius} 0 0 ${sweep} ${CENTER + radius} ${CENTER}`;
}

function placeDot(dot, radius, degrees) {
  const angle = (degrees * Math.PI) / 180;
  dot.setAttribute("cx", CENTER + radius * Math.cos(angle));
  dot.setAttribute("cy", CENTER + radius * Math.sin(angle));
}

function drawTire({ outer, inner }) {
  const side = outer - inner;
  const middle = inner + side * 0.5;
  const fontSize = Math.min(44, side * 0.42);

  $("t-body").setAttribute("r", outer);
  $("t-tread").setAttribute("r", outer + 2);
  $("t-tread").setAttribute("stroke-dasharray", "15 6");
  $("t-line-outer").setAttribute("r", outer - Math.max(9, side * 0.1));
  $("t-line-inner").setAttribute("r", inner + Math.max(6, side * 0.07));

  $("arc-top").setAttribute("d", arc(middle - fontSize * 0.35, 1));
  $("arc-bottom").setAttribute("d", arc(middle + fontSize * 0.28, 0));
  $("text-top").style.fontSize = `${fontSize}px`;
  $("text-bottom").style.fontSize = `${fontSize * 0.72}px`;

  const dotRadius = Math.max(4, Math.min(8, side * 0.08));
  for (const [id, degrees] of [["dot-yellow", 0], ["dot-violet", 180]]) {
    const dot = $(id);
    dot.setAttribute("r", dotRadius);
    placeDot(dot, middle, degrees);
  }

  $("wheel").setAttribute(
    "transform",
    `translate(${CENTER} ${CENTER}) scale(${inner / WHEEL_BASE_RADIUS}) translate(${-CENTER} ${-CENTER})`
  );
}

function animateTire(target) {
  if (tireFrame) cancelAnimationFrame(tireFrame);

  if (!tireGeometry || reducedMotion.matches) {
    tireGeometry = target;
    drawTire(target);
    return;
  }

  const from = { ...tireGeometry };
  const start = performance.now();
  const roll = $("tire-roll");

  const step = (now) => {
    const progress = Math.min(1, (now - start) / TIRE_ANIMATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    tireGeometry = {
      outer: lerp(from.outer, target.outer, eased),
      inner: lerp(from.inner, target.inner, eased),
    };
    drawTire(tireGeometry);
    roll.setAttribute("transform", `rotate(${tireAngle + 360 * eased} ${CENTER} ${CENTER})`);
    tireFrame = progress < 1 ? requestAnimationFrame(step) : null;
  };
  tireFrame = requestAnimationFrame(step);
}

function selectedSeason() {
  return document.querySelector('input[name="season"]:checked').value;
}

function updateFinder() {
  const size = readSize();
  const label = sizeLabel(size);
  const { sidewall, total } = measure(size);
  const season = selectedSeason();

  $("path-top").textContent = label;
  $("path-bottom").textContent = season.toUpperCase();
  $("cta-size").textContent = label;
  $("book-size").href = `reserver.html?prestation=pneus&taille=${encodeURIComponent(label)}&saison=${encodeURIComponent(season)}`;
  $("s-width").textContent = size.width;
  $("s-side").textContent = Math.round(sidewall);
  $("s-total").textContent = Math.round(total);
  $("size-warning").hidden = total >= USUAL_DIAMETER.min && total <= USUAL_DIAMETER.max;

  $("q-size").value = label;
  $("q-season").value = season;

  animateTire(geometryFor(size));
}

$("finder").addEventListener("change", updateFinder);
$("finder").addEventListener("submit", (event) => event.preventDefault());

/* ---------- Animation au défilement ---------- */

const stageScroll = $("stage-scroll");
const stage = $("stage");
const camera = $("camera");
const carBody = $("car-body");
const carLiner = $("car-liner");
const spinFront = $("spin-front");
const spinRear = $("spin-rear");
const lane = $("lane");
const stripLayer = $("strip-layer");
const shadow = $("shadow");
const beam = $("headlight-beam");
const introTitle = $("intro-title");
const stageActions = $("stage-actions");
const captionRoad = $("caption-road");
const captionEnd = $("caption-end");
const progressBar = $("progress");

let view = null;
let targetProgress = 0;
let currentProgress = -1;
let sceneFrame = null;

function computeView() {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const compact = compactLayout.matches;

  const startScale = Math.min((W * 0.86) / 1040, (H * (compact ? 0.42 : 0.38)) / 330);
  const roadLine = H * (compact ? 0.7 : 0.74);
  const endRadius = compact ? Math.min(W * 0.42, H * 0.29) : Math.min(H * 0.4, W * 0.24);
  const endScale = endRadius / TIRE_RADIUS;

  view = {
    W,
    H,
    startScale,
    endScale,
    start: { x: W / 2 + (WHEEL_X + 10) * startScale, y: roadLine - ROLL_RADIUS * startScale },
    end: compact ? { x: W / 2, y: H * 0.5 } : { x: W * 0.72, y: H * 0.5 },
    turns: compact ? 6 : 9,
    trackTop: stageScroll.getBoundingClientRect().top + window.scrollY,
    travel: Math.max(0, stageScroll.offsetHeight - H),
  };
}

function renderScene(p) {
  const { startScale, endScale, start, end, H, turns } = view;

  const zoom = smoothstep(0.2, 0.82, p);
  const scale = Math.exp(lerp(Math.log(startScale), Math.log(endScale), zoom));
  const screenX = lerp(start.x, end.x, zoom);
  const screenY = lerp(start.y, end.y, zoom);
  camera.setAttribute(
    "transform",
    `translate(${screenX - WHEEL_X * scale} ${screenY - WHEEL_Y * scale}) scale(${scale})`
  );

  // La voiture ralentit pour s'arrêter pile quand le marquage du pneu est droit.
  const rolled = 1 - Math.pow(1 - clamp(p / 0.92), 2);
  const angle = rolled * turns * 360;
  const distance = rolled * turns * 2 * Math.PI * ROLL_RADIUS;
  const spin = `rotate(${angle})`;
  spinFront.setAttribute("transform", spin);
  spinRear.setAttribute("transform", spin);
  lane.setAttribute("stroke-dashoffset", distance);

  const stripOffset = -((distance * 0.55) % STRIP_WIDTH);
  stripLayer.setAttribute("transform", `translate(${stripOffset} 0)`);
  stripLayer.setAttribute("opacity", 1 - smoothstep(0.22, 0.5, p));

  // La voiture monte sur le pont et libère la roue.
  const lift = smoothstep(0.5, 0.8, p);
  const liftTransform = `translate(0 ${(-lift * H * 1.25) / scale})`;
  carBody.setAttribute("transform", liftTransform);
  carLiner.setAttribute("transform", liftTransform);
  shadow.setAttribute("opacity", 0.5 * (1 - smoothstep(0.45, 0.6, p)));
  beam.setAttribute("opacity", 1 - smoothstep(0.1, 0.4, p));

  const titleOpacity = 1 - smoothstep(0.03, 0.14, p);
  introTitle.style.opacity = titleOpacity;
  introTitle.style.transform = `translateY(${-p * 300}px)`;
  introTitle.style.visibility = titleOpacity <= 0 ? "hidden" : "visible";
  stageActions.style.opacity = titleOpacity;
  stageActions.style.visibility = titleOpacity <= 0 ? "hidden" : "visible";

  captionRoad.style.opacity = smoothstep(0.2, 0.3, p) * (1 - smoothstep(0.5, 0.6, p));
  captionEnd.style.opacity = smoothstep(0.76, 0.9, p);
}

function readScroll() {
  if (!view) return;
  targetProgress = view.travel > 0 ? clamp((window.scrollY - view.trackTop) / view.travel) : 1;
  const total = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.transform = `scaleX(${total > 0 ? clamp(window.scrollY / total) : 0})`;
}

function sceneLoop() {
  const gap = targetProgress - currentProgress;
  const settled = Math.abs(gap) < 0.0005 || reducedMotion.matches;
  currentProgress = settled ? targetProgress : currentProgress + gap * 0.16;
  renderScene(currentProgress);
  sceneFrame = settled ? null : requestAnimationFrame(sceneLoop);
}

function requestScene() {
  readScroll();
  if (!sceneFrame) sceneFrame = requestAnimationFrame(sceneLoop);
}

function refreshLayout() {
  document.documentElement.classList.toggle("reduce-motion", reducedMotion.matches);
  computeView();
  requestScene();
}

window.addEventListener("scroll", requestScene, { passive: true });
window.addEventListener("resize", refreshLayout);
window.addEventListener("load", refreshLayout);
reducedMotion.addEventListener("change", refreshLayout);
compactLayout.addEventListener("change", refreshLayout);

/* ---------- Ouvert ou fermé, à l'heure de Cabestany ---------- */

function parisTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function formatHour(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}

function openingStatus(date = new Date()) {
  const { day, minutes } = parisTime(date);
  const today = OPENING_HOURS[day] || [];

  const current = today.find(([from, to]) => minutes >= from && minutes < to);
  if (current) return { open: true, label: `Ouvert · ferme à ${formatHour(current[1])}` };

  const laterToday = today.find(([from]) => minutes < from);
  if (laterToday) return { open: false, label: `Fermé · ouvre à ${formatHour(laterToday[0])}` };

  for (let offset = 1; offset <= 7; offset++) {
    const nextDay = (day + offset) % 7;
    const hours = OPENING_HOURS[nextDay];
    if (hours) {
      const when = offset === 1 ? "demain" : DAY_NAMES[nextDay];
      return { open: false, label: `Fermé · ouvre ${when} à ${formatHour(hours[0][0])}` };
    }
  }
  return { open: false, label: "Fermé" };
}

function updateStatus() {
  const { open, label } = openingStatus();
  for (const element of document.querySelectorAll("[data-status]")) {
    element.textContent = label;
    element.classList.toggle("is-open", open);
  }
}

updateStatus();
setInterval(updateStatus, 60000);

/* ---------- Menu ---------- */

const menuButton = $("menu-button");
const mainNav = $("main-nav");

function setMenu(open) {
  mainNav.classList.toggle("is-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.textContent = open ? "Fermer" : "Menu";
}

menuButton.addEventListener("click", () => setMenu(!mainNav.classList.contains("is-open")));
mainNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});

/* ---------- Formulaire de devis ---------- */

const quoteForm = $("quote-form");
const fields = quoteForm.elements;

function setFieldError(field, hasError) {
  const error = field.parentElement.querySelector(".error");
  field.setAttribute("aria-invalid", hasError ? "true" : "false");
  if (error) error.hidden = !hasError;
}

function validPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function checkField(field) {
  const value = field.value.trim();
  const valid = field.name === "phone" ? validPhone(value) : value.length > 1;
  setFieldError(field, !valid);
  return valid;
}

function isMechanicRequest() {
  return fields.requestType.value === "Mécanique";
}

function setRequestType(type) {
  fields.requestType.value = type;
  $("fields-tires").hidden = type !== "Pneus";
  $("fields-mechanic").hidden = type !== "Mécanique";
  $("more-tires").hidden = type !== "Pneus";
}

function setUnknownSize(unknown) {
  $("q-unknown").checked = unknown;
  fields.size.disabled = unknown;
  if (unknown) setFieldError(fields.size, false);
}

quoteForm.addEventListener("change", (event) => {
  if (event.target.name === "requestType") setRequestType(event.target.value);
  if (event.target.name === "unknownSize") setUnknownSize(event.target.checked);
});

$("finder-cta").addEventListener("click", () => {
  setRequestType("Pneus");
  setUnknownSize(false);
});

$("unknown-link").addEventListener("click", () => {
  setRequestType("Pneus");
  setUnknownSize(true);
});

for (const link of document.querySelectorAll("[data-request]")) {
  link.addEventListener("click", () => {
    setRequestType(link.dataset.request);
    if (link.dataset.works) fields.works.value = link.dataset.works;
    if (link.dataset.request === "Pneus") setUnknownSize(false);
  });
}

for (const name of ["size", "works", "name", "phone"]) {
  fields[name].addEventListener("blur", (event) => {
    if (!event.target.disabled) checkField(event.target);
  });
}

function optionalLine(label, value) {
  const text = value.trim();
  return text ? [`${label} : ${text}`] : [];
}

// Contenu de la demande de devis, commun à l'envoi en ligne et au repli par e-mail.
function buildQuote() {
  const mechanic = isMechanicRequest();
  const sizeText = $("q-unknown").checked ? "à déterminer" : fields.size.value.trim();
  const details = mechanic
    ? { besoin: fields.works.value.trim() }
    : {
        taille: sizeText,
        indices: fields.indices.value.trim() || undefined,
        saison: fields.season.value,
        quantite: fields.quantity.value,
        gamme: fields.range.value,
        type: fields.tireType.value,
      };
  details.vehicule = fields.vehicle.value.trim() || undefined;
  details.immatriculation = fields.plate.value.trim() || undefined;

  const labels = { besoin: "Besoin", taille: "Taille", indices: "Indices", saison: "Saison", quantite: "Quantité", gamme: "Gamme", type: "Type de pneu", vehicule: "Véhicule", immatriculation: "Immatriculation" };
  const lines = Object.entries(details).filter(([, v]) => v).map(([k, v]) => `${labels[k]} : ${v}`);
  lines.push(`Nom : ${fields.name.value.trim()}`, `Téléphone : ${fields.phone.value.trim()}`);

  return {
    kind: mechanic ? "mecanique" : "pneus",
    subject: mechanic ? "Demande de devis mécanique" : `Demande de devis pneus : ${sizeText}`,
    details,
    lines,
    name: fields.name.value.trim(),
    phone: fields.phone.value.trim(),
  };
}

function buildMailto(quote = buildQuote()) {
  return `mailto:${SHOP_EMAIL}?subject=${encodeURIComponent(quote.subject)}&body=${encodeURIComponent(quote.lines.join("\n"))}`;
}

const booking = window.BookingAPI;
const sendOnline = Boolean(booking && !booking.isDemo);
if (sendOnline) $("quote-hint").textContent = "Le garage reçoit votre demande et vous rappelle, en général dans la journée.";

let quoteSending = false;
quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (quoteSending) return;

  const mainField = isMechanicRequest() ? fields.works : $("q-unknown").checked ? null : fields.size;
  const required = [mainField, fields.name, fields.phone].filter(Boolean);
  const invalid = required.filter((field) => !checkField(field));
  if (invalid.length) {
    invalid[0].focus();
    return;
  }

  const quote = buildQuote();
  const status = $("form-fallback");
  if (!sendOnline) {
    window.location.href = buildMailto(quote);
    status.innerHTML = `Votre messagerie ne s'est pas ouverte ? Appelez-nous au <a href="tel:+33468505068">04 68 50 50 68</a>.`;
    status.hidden = false;
    return;
  }

  const button = quoteForm.querySelector('[type="submit"]');
  quoteSending = true;
  button.disabled = true;
  button.textContent = "Envoi…";
  try {
    await booking.api.createQuote({ kind: quote.kind, details: quote.details, name: quote.name, phone: quote.phone });
    const first = quote.name.split(/\s+/)[0];
    status.textContent = `Merci ${first}, c'est envoyé. Le garage vous rappelle au ${quote.phone}.`;
    status.hidden = false;
    quoteForm.reset();
    setRequestType("Pneus");
    updateFinder();
  } catch (error) {
    // Plan B : la demande part par e-mail.
    window.location.href = buildMailto(quote);
    status.innerHTML = `L'envoi en ligne n'a pas abouti : votre messagerie s'ouvre avec la demande. Sinon, appelez le <a href="tel:+33468505068">04 68 50 50 68</a>.`;
    status.hidden = false;
  } finally {
    quoteSending = false;
    button.disabled = false;
    button.textContent = "Envoyer ma demande";
  }
});

$("year").textContent = new Date().getFullYear();

/* ---------- Démarrage ---------- */

updateFinder();
refreshLayout();
