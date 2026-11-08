// Boutique pneus : le défilé 3D, la collection, le panier (réservation, paiement au garage).
import { initUI, makeSheet, openSheet, parseSize } from "./ui.js?v=6";
import { CATEGORIES, PRODUCTS, catOf, priceLabel } from "./catalogue.js?v=3";

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
// Photos de pneus déjà calculées : aucune 3D à fabriquer pour afficher la collection.
const imgFor = (p) => `<img src="assets/tires/${p.id}.webp?v=1" srcset="assets/tires/${p.id}-480.webp?v=1 480w, assets/tires/${p.id}.webp?v=1 800w" sizes="(max-width: 760px) 46vw, 50vw" alt="Pneu ${esc(p.brand)} ${esc(p.model)}" width="800" height="600" loading="lazy" decoding="async">`;
const whenIdle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 800 }) : setTimeout(f, 60));

/* ---------------- Dimension recherchée ---------------- */
const sizeKey = (p) => parseSize(p.size)?.short || "";
const isMatch = (p) => Boolean(prefSize) && sizeKey(p) === prefSize;
let prefSize = null, sizeOnly = false;
{
  const q = parseSize(new URLSearchParams(location.search).get("taille") || "");
  const saved = (() => { try { return sessionStorage.getItem("pp-size"); } catch (e) { return null; } })();
  prefSize = q ? q.short : saved;
  if (prefSize) $("size-in").value = prefSize;
}
function renderQuick() {
  const sizes = [...new Set(PRODUCTS.map(sizeKey).filter(Boolean))];
  $("size-quick").innerHTML = sizes.map((s) => `<button class="sz" type="button" data-sz="${esc(s)}" aria-pressed="${s === prefSize}">${esc(s)}</button>`).join("");
}
function showSizeMsg() {
  const m = $("size-msg");
  m.classList.remove("bad");
  if (!prefSize) { m.innerHTML = 'Pas sûr de votre dimension ? <button class="link-arrow" type="button" data-open="reader">Lire son pneu</button>'; return; }
  const n = PRODUCTS.filter(isMatch).length;
  const text = n ? `<span><b>${n} pneu${n > 1 ? "s" : ""}</b> en vitrine en <b>${esc(prefSize)}</b>.</span>` : `<span>Aucune fiche en <b>${esc(prefSize)}</b> pour l'instant. Votre dimension reste notée au panier, le garage confirme le prix et la disponibilité.</span>`;
  const only = n ? `<button class="size-act" type="button" data-size-only>${sizeOnly ? "Tout afficher" : "Voir seulement ceux-là"}</button>` : "";
  m.innerHTML = `${text}${only}<button class="size-act" type="button" data-size-clear>Effacer</button>`;
}
function setSize(value) {
  prefSize = value;
  try { if (value) sessionStorage.setItem("pp-size", value); else sessionStorage.removeItem("pp-size"); } catch (x) { /* rien */ }
  $("size-in").value = value || "";
  if (!value) sizeOnly = false;
  const cart = store.get("pp-cart", []);
  if (value) { cart.forEach((it) => { const p = byId.get(it.id); if (p && !p.unit && !it.sizeEdited) it.size = value; }); store.set("pp-cart", cart); }
  showSizeMsg(); renderQuick(); renderGrid();
  if (list.length) show(index, 0, true);
}
$("size-box").addEventListener("submit", (e) => {
  e.preventDefault();
  const s = parseSize($("size-in").value);
  if (!s) {
    const m = $("size-msg");
    m.classList.add("bad");
    m.innerHTML = 'Format attendu : 205/55 R16. <button class="link-arrow" type="button" data-open="reader">Lire son pneu</button>';
    $("size-in").focus();
    return;
  }
  setSize(s.short);
});
$("size-quick").addEventListener("click", (e) => {
  const q = e.target.closest("[data-sz]");
  if (q) setSize(q.dataset.sz === prefSize ? null : q.dataset.sz);
});
$("size-box").addEventListener("click", (e) => {
  if (e.target.closest("[data-size-only]")) { sizeOnly = !sizeOnly; showSizeMsg(); renderGrid(); return; }
  if (e.target.closest("[data-size-clear]")) { setSize(null); $("finder-result").hidden = true; $("size-in").focus(); }
});

/* ---------------- « Je ne connais pas mes dimensions » : la plaque remplit la taille ---------------- */
let foundCar = null;
$("find-plate").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { api, plate: P, isDemo } = window.BookingAPI;
  const inp = $("find-plate-in"), msg = $("find-plate-msg"), box = $("finder-result"), go = $("find-plate-go");
  const raw = P.normalize(inp.value);
  msg.classList.remove("bad"); msg.textContent = ""; box.hidden = true;
  if (!P.isValid(raw)) {
    msg.classList.add("bad"); msg.textContent = "Plaque non reconnue. Format attendu : AB-123-CD ou 1234 AB 66.";
    inp.setAttribute("aria-invalid", "true"); inp.focus();
    return;
  }
  inp.removeAttribute("aria-invalid");
  go.disabled = true; msg.textContent = "Recherche de votre voiture…";
  try {
    const v = await api.lookupPlate(raw);
    window.ppTrack?.("plaque");
    msg.textContent = "";
    foundCar = { ...v, plate: P.format(raw) };
    const name = [v.brand, v.model].filter(Boolean).join(" ");
    const meta = [v.year, v.fuel].filter(Boolean).join(" · ");
    const s = v.tire ? parseSize(v.tire) : null;
    const alts = (v.tireAlt || []).map((a) => parseSize(a)).filter(Boolean);
    const car = `<p class="fr-car"><b>${esc(name)}</b>${meta ? `<span>${esc(meta)}</span>` : ""}<span>${esc(P.format(raw))}</span></p>`;
    const demoNote = v.demo ? '<p class="fr-demo">Démo : véhicule fictif. Les vraies plaques fonctionneront une fois le service de recherche activé.</p>' : "";
    if (s) {
      box.innerHTML = `${car}<p class="fr-big">Les dimensions de votre voiture sont <b>${esc(s.short)}</b></p>
        ${alts.length ? `<p class="fr-alt">Selon la finition, elle peut aussi être en ${alts.map((a) => `<button class="sz" type="button" data-sz="${esc(a.short)}">${esc(a.short)}</button>`).join(" ")}. Vérifiez sur le flanc d'un pneu. <button class="link-arrow" type="button" data-open="reader">Lire son pneu</button></p>` : ""}${demoNote}`;
      box.hidden = false;
      setSize(s.short);
    } else {
      box.innerHTML = `${car}<p class="fr-big">Voiture trouvée, mais sa taille de pneus n'est pas communiquée.</p><p class="fr-alt">Elle est écrite sur le flanc de vos pneus. <button class="link-arrow" type="button" data-open="reader">Lire son pneu</button></p>${demoNote}`;
      box.hidden = false;
    }
  } catch (err) {
    msg.classList.add("bad");
    msg.textContent = err.code === "plate_not_found" ? "Véhicule introuvable. Vérifiez la plaque, ou tapez la dimension à côté."
      : err.code === "too_many" ? "Trop de recherches d'affilée. Réessayez dans un moment, ou tapez la dimension à côté."
      : "La recherche ne répond pas pour le moment. Tapez la dimension à côté, ou appelez le 04 68 50 50 68.";
  } finally {
    go.disabled = false;
  }
});
$("finder-result").addEventListener("click", (e) => { const q = e.target.closest("[data-sz]"); if (q) setSize(q.dataset.sz); });

/* ---------------- Filtres ---------------- */
let filter = "all", list = PRODUCTS.slice(), index = 0;
const FILTER_ORDER = ["ete", "hiver", "4saisons", "sport", "competition", "drift", "occasion"];
const FILTERS = [{ id: "all", label: "Tout", pitch: "Tous nos pneus en vitrine, neufs et d'occasion." }, ...FILTER_ORDER.map((id) => CATEGORIES.find((c) => c.id === id))];
const countOf = (id) => (id === "all" ? PRODUCTS.length : PRODUCTS.filter((p) => p.cat === id).length);
function renderFilters() {
  const dot = (c) => (c.code ? `<i style="--c:${c.code}"></i>` : "");
  $("rw-filters").innerHTML = FILTERS.map((c) => `<button class="chip" type="button" data-f="${c.id}" aria-pressed="${c.id === filter}">${dot(c)}${esc(c.label)}</button>`).join("");
  $("coll-filters").innerHTML = FILTERS.map((c) => `<button class="cf" type="button" data-f="${c.id}" aria-pressed="${c.id === filter}">${dot(c)}${esc(c.label)}<sup aria-label="${countOf(c.id)} pneus">${countOf(c.id)}</sup></button>`).join("");
  $("coll-pitch").textContent = FILTERS.find((c) => c.id === filter).pitch;
}
function setFilter(f) {
  filter = f; expanded = false;
  list = f === "all" ? PRODUCTS.slice() : PRODUCTS.filter((p) => p.cat === f);
  renderFilters(); renderList(); renderGrid();
  show(0, 1, true);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  setFilter(b.dataset.f);
  // Depuis la grille ou les pastilles : on revient au début des résultats.
  if (b.closest(".pc-cat")) scrollTo({ top: $("coll-grid").getBoundingClientRect().top + scrollY - 110, behavior: reduce ? "auto" : "smooth" });
});
/* ---------------- Le défilé ---------------- */
const runway = $("runway"), info = $("rw-info"), buyBox = $("rw-buy");
function renderList() {
  $("rw-list").innerHTML = list.map((p, i) => `<li><button type="button" data-i="${i}" style="--c:${catOf(p).code}" class="${i === index ? "on" : ""}" aria-label="${esc(p.brand)} ${esc(p.model)}, ${priceLabel(p.price)}"><span class="br">${esc(p.brand)}</span><span class="nm">${esc(p.model)}</span><span class="pr">${priceLabel(p.price)}</span></button></li>`).join("");
}
$("rw-list").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { const i = Number(b.dataset.i); show(i, i >= index ? 1 : -1); } });

let swapTimer;
function show(i, dir = 1, instant = false) {
  if (!list.length) return;
  index = (i + list.length) % list.length;
  const p = list[index], c = catOf(p);
  runway.style.setProperty("--code", c.code);
  $("rw-count").textContent = `${String(index + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`;
  $("rw-list").querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === index));
  const rail = $("rw-list"), active = rail.querySelector(".on")?.parentElement;
  if (active) rail.scrollTo({ left: active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  const ghost = $("rw-ghost");
  const apply = () => {
    $("rw-cat").textContent = `Collection ${c.label}`;
    $("rw-brand").textContent = p.brand;
    $("rw-model").textContent = p.model;
    $("rw-model").classList.toggle("long", longName(p.model));
    $("rw-size").textContent = p.size;
    $("rw-desc").textContent = p.desc;
    $("rw-tags").innerHTML = p.tags.map((t) => `<li>${esc(t)}</li>`).join("");
    $("rw-price").textContent = priceLabel(p.price);
    $("rw-pl").textContent = p.unit ? "Prix du lot" : "Prix posé";
    $("rw-unit").textContent = p.unit || "le pneu, posé";
    $("rw-total").hidden = Boolean(p.unit);
    if (!p.unit) {
      const n = qty();
      $("rw-total-l").textContent = `Total indicatif, ${n} pneu${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}`;
      $("rw-total-v").textContent = priceLabel(p.price * n);
    }
    $("rw-cmp").dataset.cmp = p.id;
    syncCompare();
    const s = parseSize(prefSize || p.size);
    $("rw-rdv").href = `reserver.html?prestation=pneus${s ? `&taille=${encodeURIComponent(s.short)}` : ""}&saison=${encodeURIComponent(c.season)}&qte=${qty()}`;
    $("rw-qty-row").hidden = Boolean(p.unit);
    ghost.textContent = c.label;
    info.classList.remove("out"); buyBox.classList.remove("out"); ghost.classList.remove("swap");
  };
  clearTimeout(swapTimer); clearTimeout(warmTimer);
  if (instant) { apply(); stage?.present(p, dir); }
  else {
    // le texte sort d'abord, le pneu se construit, puis le texte revient pendant que le pneu roule au centre
    info.classList.add("out"); buyBox.classList.add("out"); ghost.classList.add("swap");
    swapTimer = setTimeout(() => { stage?.present(p, dir); swapTimer = setTimeout(apply, 170); }, 70);
  }
  // on prépare le pneu suivant pendant que celui-ci est à l'arrêt
  warmTimer = setTimeout(() => whenIdle(() => { stage?.warm(list[(index + 1) % list.length]); whenIdle(() => stage?.warm(list[(index - 1 + list.length) % list.length])); }), 900);
}
let warmTimer;
const qty = () => Number(document.querySelector('input[name="rw-qty"]:checked')?.value || 4);
$("rw-prev").addEventListener("click", () => { show(index - 1, -1); });
$("rw-next").addEventListener("click", () => { show(index + 1, 1); });
$("rw-add").addEventListener("click", () => addToCart(list[index], list[index].unit ? 1 : qty()));
document.querySelectorAll('input[name="rw-qty"]').forEach((r) => r.addEventListener("change", () => show(index, 0, true)));
addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]") || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const r = runway.getBoundingClientRect();
  if (r.bottom < innerHeight * 0.4) return;
  if (e.key === "ArrowRight") { show(index + 1, 1); }
  if (e.key === "ArrowLeft") { show(index - 1, -1); }
});

// On fait défiler soi-même : flèches, clavier, ou glissé sur le pneu.
{
  const gl = $("gl-shop");
  let startX = null;
  gl.addEventListener("pointerdown", (e) => { startX = e.clientX; });
  addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const d = e.clientX - startX; startX = null;
    if (Math.abs(d) > 48) { const dir = d < 0 ? 1 : -1; show(index + dir, dir); }
  });
  addEventListener("pointercancel", () => { startX = null; });
}

/* ---------------- La collection ---------------- */
function gridItems() {
  const items = list.slice();
  if (!prefSize) return items;
  if (sizeOnly) return items.filter(isMatch);
  return items.sort((a, b) => Number(isMatch(b)) - Number(isMatch(a)));
}
const longName = (m) => m.split(/\s+/).some((w) => w.length >= 12);
const PHONE = matchMedia("(max-width: 760px)");
let expanded = false;
function addLabel(p) { return p.unit ? "+ Le lot" : "+ 4"; }
function renderGrid() {
  const items = gridItems();
  const grid = $("coll-grid");
  const shown = PHONE.matches && !expanded ? items.slice(0, 8) : items;
  const rest = items.length - shown.length;
  grid.classList.toggle("feat", items.length >= 5);
  $("coll-count").textContent = `${items.length} pneu${items.length > 1 ? "s" : ""}`;
  if (!items.length) {
    grid.innerHTML = `<div class="coll-empty"><p>Aucune fiche de cette catégorie en ${esc(prefSize || "")}. Le garage peut vous renseigner au 04 68 50 50 68.</p><button class="btn btn-ghost" type="button" data-size-all>Tout afficher</button></div>`;
    return;
  }
  grid.innerHTML = shown.map((p, i) => {
    const c = catOf(p), at = list.indexOf(p);
    return `<article class="pc" style="--c:${c.code};animation-delay:${Math.min(i, 8) * 40}ms" data-id="${p.id}">
      <button class="pc-img" type="button" data-show="${at}" aria-label="Voir ${esc(p.brand)} ${esc(p.model)} sur le podium">${imgFor(p)}</button>
      <button class="pc-cat" type="button" data-f="${c.id}" aria-label="Voir tous les pneus ${esc(c.label)}"><i></i>${esc(c.label)}</button>
      <button class="pc-cmp" type="button" data-cmp="${p.id}" aria-pressed="false" aria-label="Comparer ${esc(p.brand)} ${esc(p.model)}">Comparer</button>
      <div class="pc-body">
        <p class="pc-brand">${esc(p.brand)}</p>
        <h3 class="pc-model${longName(p.model) ? " long" : ""}">${esc(p.model)}</h3>
        <p class="pc-size">${esc(p.size)}${isMatch(p) ? "<em>Votre dimension</em>" : ""}</p>
        <div class="pc-foot"><p class="pc-price">${priceLabel(p.price)}<small>${esc(p.unit || "le pneu, posé")}</small></p>
        <button class="pc-add" type="button" data-track="panier" data-add="${p.id}" aria-label="Ajouter ${p.unit ? "le lot" : "4 pneus"} ${esc(p.brand)} ${esc(p.model)} au panier">${addLabel(p)}</button></div>
      </div></article>`;
  }).join("") + (rest ? `<button class="btn btn-ghost coll-more" type="button" data-more>Voir les ${rest} autres pneus</button>` : "");
  syncCompare();
}
$("coll-grid").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    const p = byId.get(add.dataset.add);
    addToCart(p, p.unit ? 1 : 4);
    add.classList.add("added"); add.textContent = "Ajouté";
    setTimeout(() => { add.classList.remove("added"); add.textContent = addLabel(p); }, 1400);
    return;
  }
  if (e.target.closest("[data-more]")) { expanded = true; renderGrid(); return; }
  if (e.target.closest("[data-size-all]")) { sizeOnly = false; showSizeMsg(); renderGrid(); return; }
  const sh = e.target.closest("[data-show]");
  if (sh) { show(Number(sh.dataset.show), 1); runway.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }
});

/* ---------------- Comparateur : trois pneus au plus, avec les données du catalogue ---------------- */
const CMP_MAX = 3;
let compared = store.get("pp-compare", []).filter((id) => byId.has(id)).slice(0, CMP_MAX);
function syncCompare() {
  document.querySelectorAll("[data-cmp]").forEach((b) => {
    const on = compared.includes(b.dataset.cmp);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "Comparé" : "Comparer";
  });
  const bar = $("cmp-bar");
  bar.hidden = !compared.length;
  document.body.classList.toggle("has-cmp", compared.length > 0);
  $("cmp-names").textContent = compared.length < 2 ? "Choisissez un deuxième pneu" : compared.map((id) => byId.get(id).model).join(" · ");
  $("cmp-open").disabled = compared.length < 2;
}
function toggleCompare(id) {
  if (compared.includes(id)) compared = compared.filter((x) => x !== id);
  else if (compared.length >= CMP_MAX) { toast(`<span>${CMP_MAX} pneus au plus. Retirez-en un pour en ajouter un autre.</span>`); return; }
  else compared = [...compared, id];
  store.set("pp-compare", compared);
  syncCompare();
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-cmp]"); if (b && b.dataset.cmp && !b.closest(".cmp-t")) toggleCompare(b.dataset.cmp); });
$("cmp-clear").addEventListener("click", () => { compared = []; store.set("pp-compare", compared); syncCompare(); });
function cmpSheet() {
  const d = makeSheet("cmp-sheet", "Comparer", "Boutique pneus");
  d.querySelector(".sheet-panel").classList.add("wide");
  return d;
}
function renderCompare() {
  const body = cmpSheet().querySelector(".sheet-body");
  const items = compared.map((id) => byId.get(id));
  if (items.length < 2) { body.innerHTML = `<div class="cart-empty"><p>Choisissez au moins deux pneus à comparer.</p><button class="btn btn-light" type="button" data-close>Revenir à la collection</button></div>`; return; }
  const sizes = new Set(items.map(sizeKey));
  const sameUnit = items.every((p) => !p.unit);
  const canRank = sizes.size === 1 && sameUnit;
  const low = Math.min(...items.map((p) => p.price));
  const row = (label, cell) => `<tr><th scope="row">${label}</th>${items.map((p) => `<td>${cell(p)}</td>`).join("")}</tr>`;
  body.innerHTML = `<table class="cmp-t" style="--n:${items.length}">
    <thead><tr><th scope="col"><span class="sr-only">Critère</span></th>${items.map((p) => `<th scope="col"><div class="cmp-h"><span class="ci-img">${imgFor(p)}</span><span class="b">${esc(p.brand)}</span><strong>${esc(p.model)}</strong></div></th>`).join("")}</tr></thead>
    <tbody>
      ${row("Prix posé", (p) => `<span class="cmp-p">${priceLabel(p.price)}</span><span class="cmp-sub">${esc(p.unit || "le pneu, posé")}</span>${canRank && p.price === low ? '<span class="cmp-best">Le moins cher</span>' : ""}`)}
      ${row("Inclus", () => "Montage, équilibrage, valves")}
      ${row("Catégorie", (p) => esc(catOf(p).label))}
      ${row("Dimension", (p) => `${esc(p.size)}${isMatch(p) ? '<span class="cmp-best">Votre dimension</span>' : ""}`)}
      ${row("Points forts", (p) => p.tags.map(esc).join(", "))}
      ${row("Pour qui", (p) => esc(p.desc))}
      ${row("", (p) => `<div class="cmp-act"><button class="btn btn-light btn-sm" type="button" data-cmp-add="${p.id}">${p.unit ? "Ajouter le lot" : "Ajouter 4 pneus"}</button><button class="ci-x" type="button" data-cmp-rm="${p.id}">Retirer</button></div>`)}
    </tbody></table>
    ${sizes.size > 1 ? '<p class="cmp-note">Ces fiches sont dans des dimensions différentes : le prix change avec la taille. Le garage confirme le tarif dans la vôtre.</p>' : ""}`;
}
$("cmp-open").addEventListener("click", () => { renderCompare(); openSheet(cmpSheet()); });
document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-cmp-add]"), rm = e.target.closest("[data-cmp-rm]");
  if (add) { const p = byId.get(add.dataset.cmpAdd); addToCart(p, p.unit ? 1 : 4); }
  if (rm) { compared = compared.filter((x) => x !== rm.dataset.cmpRm); store.set("pp-compare", compared); syncCompare(); renderCompare(); }
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
      return `<div class="ci">
        <span class="ci-img">${imgFor(p)}</span>
        <div class="ci-main"><strong>${esc(p.brand)} ${esc(p.model)}</strong><span>${esc(c.label)} · ${priceLabel(p.price)} ${esc(p.unit || "le pneu, posé")}</span>
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
    <div class="cart-sum"><p><span>Pneus, au tarif posé</span><span>${priceLabel(total)}</span></p><p><span>Montage, équilibrage, valves</span><span>${mode === "pose" ? "Inclus" : "Non réalisés"}</span></p>
      <p class="tot"><span>${mode === "pose" ? "Total indicatif" : "Total indicatif, tarif posé"}</span><span>${priceLabel(total)}</span></p><small>${mode === "pose" ? "" : "Sans pose, le garage vous indique le prix du pneu seul au moment de vous rappeler. "}Rien à payer en ligne. Le garage confirme le prix dans votre taille, puis vous payez sur place, en 3 ou 4 fois sans frais si vous voulez.</small></div>
    <form class="cart-form" id="cart-form" novalidate>
      <div class="field-row">
        <label class="field">Nom<input name="name" autocomplete="name" required maxlength="100" value="${esc(saved.name || "")}"></label>
        <label class="field">Téléphone<input name="phone" type="tel" autocomplete="tel" required maxlength="20" value="${esc(saved.phone || "")}"></label>
      </div>
      <div style="position:absolute;left:-9999px" aria-hidden="true"><label>Votre site web<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <label class="field">Plaque ou message <small>(facultatif)</small><textarea name="note" maxlength="1000" placeholder="AB-123-CD, ou une précision pour le garage"></textarea></label>
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
  if (window.BookingAPI?.spam.suspect(f)) return renderCartKeep(f, "Envoi impossible. Appelez le garage au 04 68 50 50 68.");
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
    total: `${total} € (indicatif, tarif posé)`,
  };
  if (note) details.message = note;
  if (foundCar) { details.vehicule = [foundCar.brand, foundCar.model, foundCar.year].filter(Boolean).join(" "); details.immatriculation = foundCar.plate; }
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
// Arrivée depuis l'accueil avec une catégorie déjà choisie : pneus.html?cat=occasion
{
  const wanted = new URLSearchParams(location.search).get("cat");
  if (CATEGORIES.some((c) => c.id === wanted)) { filter = wanted; list = PRODUCTS.filter((p) => p.cat === wanted); }
}
showSizeMsg(); renderQuick(); renderFilters(); renderList(); renderGrid(); show(0, 1, true);
if (root.classList.contains("gl")) {
  const startStage = () => whenIdle(() => initStage().then((s) => { stage = s; stage.present(list[index], 0); warm3D(); }).catch((e) => { console.error(e); root.classList.replace("gl", "nogl"); }));
  const warm3D = () => setTimeout(() => whenIdle(() => stage?.warm(list[(index + 1) % list.length])), 900);
  if (document.readyState === "complete") startStage(); else addEventListener("load", startStage, { once: true });
}

async function initStage() {
  const THREE = await import("three");
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const { buildTire } = await import("./tire.js?v=5");
  await document.fonts.load('800 100px "Archivo"').catch(() => {});

  const canvas = $("gl-shop");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile || weak ? 1.35 : 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const key = new THREE.DirectionalLight(0xfff3e4, 0.7); key.position.set(-3, 4, 5);
  const rimL = new THREE.SpotLight(0xffffff, 120, 16, 0.7, 0.6); rimL.position.set(3.4, 2.4, -3);
  const top = new THREE.SpotLight(0xffffff, 60, 16, 0.5, 0.8); top.position.set(0, 6, 1.5);
  scene.add(key, rimL, rimL.target, top, top.target);

  let lastW = 0, lastH = 0;
  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === lastW && h === lastH) return;   // la barre d'adresse du téléphone qui bouge ne doit rien recalculer
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fill = canvas.clientWidth > 1000 ? 1.02 : 0.8;
    const d = Math.max(1.2 / (half * fill), 1.25 / (half * cam.aspect * 0.8));
    cam.position.set(0, 0.35, mobile ? d * 0.92 : d);
    cam.lookAt(0, mobile ? 0 : -0.05, 0);
  };
  size();
  addEventListener("resize", size);

  const cache = new Map();
  const keyOf = (p) => p.id;
  const build = (p, q = mobile ? 0.32 : weak ? 0.36 : 0.5, tex = mobile || weak ? 1024 : 2048) => {
    const c = catOf(p);
    return buildTire({ quality: q, textureSize: tex, pattern: c.pattern, paint: c.paint, brand: p.brand.toUpperCase(), label: p.size.toUpperCase(), line: p.model.toUpperCase() });
  };
  const get = (p) => {
    if (cache.has(keyOf(p))) { const g = cache.get(keyOf(p)); cache.delete(keyOf(p)); cache.set(keyOf(p), g); return g; }
    const g = build(p);
    cache.set(keyOf(p), g);
    while (cache.size > (mobile || weak ? 4 : 6)) {
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
    const accent = new THREE.Color(catOf(p).code);
    rimL.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.9);
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

  let last = performance.now(), spin = 0, samples = 0, spent = 0, lowered = false;
  (function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const inView = canvas.getBoundingClientRect().bottom > 0 && !document.hidden;
    if (inView && cur) {
      pointer.sx += (pointer.x - pointer.sx) * 0.05;
      if (anim) {
        anim.t = Math.min(1, anim.t + dt / 0.72);
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
      if (!lowered && dt > 0) {
        samples++; spent += dt;
        if (samples >= 40) {
          if (spent / samples > 0.03) { lowered = true; renderer.setPixelRatio(1); lastW = 0; size(); }
          samples = 0; spent = 0;
        }
      }
    }
    requestAnimationFrame(frame);
  })(last);

  return {
    present,
    // Pneu et textures envoyés à la carte graphique à l'avance : la flèche répond sans à-coup.
    warm: (p) => {
      if (!p || anim) return;
      get(p).traverse((o) => { if (o.isMesh) Object.values(o.material).forEach((v) => { if (v?.isTexture) renderer.initTexture(v); }); });
    },
  };
}
