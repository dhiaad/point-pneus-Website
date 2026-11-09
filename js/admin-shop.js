// Espace gérant : les produits de la boutique (ajouter, modifier, masquer, supprimer, changer un prix).
import { CATEGORIES, BASE_PRODUCTS, photoOf, priceLabel } from "./catalogue.js?v=4";
import { shrinkImage } from "./image-file.js?v=1";

const { api, isDemo, store } = window.BookingAPI;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;
const toPrice = (v) => { const n = Number(String(v).replace(/[\s€]/g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const okPrice = (n) => n > 0 && n <= 9999;
const OK_SIZE = /^\d{3}\/\d{2}\s*Z?R\s*\d{2}/i;
const LOT = "le lot de 4";

let items = [], query = "", cat = "all", built = false, editing = null, photo = null;

const visibleCount = (list) => list.filter((p) => !p.hidden).length;
function say(text, bad = false) {
  const el = $("pa-status");
  el.textContent = text;
  el.classList.toggle("bad", bad);
  clearTimeout(say.t);
  say.t = setTimeout(() => { el.textContent = ""; }, 5000);
}

async function persist(next, done, { rerender = true } = {}) {
  const before = items;
  items = next;
  if (rerender) render();
  try {
    await api.adminSaveProducts(next);
    say(done);
    renderSum();
    return true;
  } catch (x) {
    items = before;
    render();
    say(x?.code === "storage_full" ? "Plus de place dans ce navigateur. Retirez quelques photos." : "L'enregistrement a échoué. Réessayez.", true);
    return false;
  }
}

function renderSum() {
  const v = visibleCount(items), n = items.length;
  $("pa-sum").innerHTML = `<b>${n} produit${n > 1 ? "s" : ""}</b>, dont ${v} en vitrine.`;
}

function rowHtml(p) {
  const ph = photoOf(p);
  return `<article class="pa-row${p.hidden ? " off" : ""}" data-id="${esc(p.id)}">
    <span class="pa-img"><img src="${esc(ph.small || ph.src)}" alt="" width="64" height="48" loading="lazy" decoding="async"></span>
    <div class="pa-name">
      <p class="pa-b">${esc(p.brand)}</p>
      <p class="pa-m">${esc(p.model)}</p>
      <p class="pa-s">${esc(p.size)} · ${esc(catLabel(p.cat))}</p>
    </div>
    <label class="pa-price"><span class="sr-only">Prix de ${esc(p.brand)} ${esc(p.model)}, en euros</span><input type="text" inputmode="decimal" autocomplete="off" value="${esc(String(p.price).replace(".", ","))}" data-price><span aria-hidden="true">€</span><small>${esc(p.unit || "le pneu, posé")}</small></label>
    <label class="pa-vis"><input type="checkbox" role="switch" data-vis${p.hidden ? "" : " checked"}><span>${p.hidden ? "Masqué" : "En vitrine"}</span></label>
    <div class="pa-act"><button class="d-btn d-btn-line" type="button" data-edit>Modifier</button><button class="d-btn d-btn-text" type="button" data-del>Supprimer</button></div>
  </article>`;
}

function render() {
  renderSum();
  const q = query.trim().toLowerCase();
  const shown = items.filter((p) => (cat === "all" || p.cat === cat) && (!q || `${p.brand} ${p.model} ${p.size}`.toLowerCase().includes(q)));
  $("pa-list").innerHTML = shown.length ? shown.map(rowHtml).join("") : '<p class="empty">Aucun produit ne correspond à cette recherche.</p>';
}

function slug(brand, model) {
  const base = `${brand}-${model}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "produit";
  let id = base, k = 2;
  while (items.some((p) => p.id === id)) id = `${base}-${k++}`;
  return id;
}

/* ---------------- Fiche produit ---------------- */
function showPhoto() {
  const box = $("pa-photo-view");
  const current = photo === null ? null : photo;
  box.hidden = !current;
  if (current) box.querySelector("img").src = current;
}
function openForm(p) {
  editing = p;
  photo = p ? photoOf(p).small || photoOf(p).src : null;
  if (p && !p.image && photo.includes("generique")) photo = null;
  const f = $("pa-form");
  f.reset();
  $("pa-form-t").textContent = p ? "Modifier le produit" : "Ajouter un produit";
  $("pa-form-err").hidden = true;
  $("pa-save").textContent = p ? "Enregistrer" : "Ajouter ce produit";
  f.elements.brand.value = p?.brand || "";
  f.elements.model.value = p?.model || "";
  f.elements.cat.value = p?.cat || CATEGORIES[0].id;
  f.elements.size.value = p?.size || "";
  f.elements.price.value = p ? String(p.price).replace(".", ",") : "";
  f.elements.unit.value = p?.unit === LOT ? "lot" : "pneu";
  f.elements.desc.value = p?.desc || "";
  f.elements.tags.value = (p?.tags || []).join(", ");
  f.elements.shown.checked = !p?.hidden;
  showPhoto();
  $("pa-dlg").showModal();
  f.elements.brand.focus();
}
function formError(msg, field) {
  const e = $("pa-form-err");
  e.textContent = msg;
  e.hidden = false;
  field?.focus();
}
async function submitForm(ev) {
  ev.preventDefault();
  const f = ev.target, g = f.elements;
  const brand = g.brand.value.trim(), model = g.model.value.trim(), size = g.size.value.trim().toUpperCase().replace(/\s+/g, " "), price = toPrice(g.price.value);
  if (brand.length < 2) return formError("Indiquez la marque.", g.brand);
  if (model.length < 1) return formError("Indiquez le modèle.", g.model);
  if (!OK_SIZE.test(size)) return formError("Dimension attendue : 205/55 R16, avec les indices si vous les avez.", g.size);
  if (!okPrice(price)) return formError("Indiquez un prix entre 1 et 9 999 €.", g.price);
  const shown = g.shown.checked;
  if (!shown && visibleCount(items.filter((p) => p !== editing)) === 0) return formError("Gardez au moins un produit en vitrine : la boutique ne peut pas être vide.", g.shown);
  const tags = g.tags.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 4);
  const base = { brand, model, cat: g.cat.value, size, price, tags, desc: g.desc.value.trim() };
  if (g.unit.value === "lot") base.unit = editing?.unit && editing.unit !== LOT ? editing.unit : LOT;
  if (!shown) base.hidden = true;
  const had = editing ? photoOf(editing) : null;
  const kept = photo && had && photo === (had.small || had.src);
  if (photo && !kept) base.image = photo;
  else if (kept && editing.image) base.image = editing.image;
  const removing = editing && !photo && editing.image;
  const product = editing ? { id: editing.id, ...base } : { id: slug(brand, model), ...base };
  if (removing) delete product.image;
  const next = editing ? items.map((p) => (p.id === editing.id ? product : p)) : [product, ...items];
  $("pa-save").disabled = true;
  const ok = await persist(next, editing ? `${brand} ${model} enregistré.` : `${brand} ${model} ajouté.`);
  $("pa-save").disabled = false;
  if (ok) $("pa-dlg").close();
}

/* ---------------- Mise en place ---------------- */
function build() {
  built = true;
  $("pa-demo").hidden = !isDemo;
  $("pa-reset-row").hidden = !isDemo;
  $("pa-cat").innerHTML = `<option value="all">Toutes les catégories</option>${CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("")}`;
  $("pa-form").elements.cat.innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("");

  $("pa-q").addEventListener("input", (e) => { query = e.target.value; render(); });
  $("pa-cat").addEventListener("change", (e) => { cat = e.target.value; render(); });
  $("pa-add").addEventListener("click", () => openForm(null));
  $("pa-form").addEventListener("submit", submitForm);
  $("pa-dlg").addEventListener("click", (e) => { if (e.target.closest("[data-pa-close]") || e.target === $("pa-dlg")) $("pa-dlg").close(); });
  $("pa-photo").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return formError("Choisissez une image (JPG, PNG ou WebP).");
    try { photo = await shrinkImage(file, { max: 800 }); $("pa-form-err").hidden = true; showPhoto(); }
    catch (x) { formError("Cette image n'a pas pu être lue."); }
  });
  $("pa-photo-rm").addEventListener("click", () => { photo = null; showPhoto(); });

  $("pa-list").addEventListener("change", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const p = items.find((x) => x.id === row.dataset.id);
    if (e.target.matches("[data-price]")) {
      const n = toPrice(e.target.value);
      if (!okPrice(n)) { e.target.value = String(p.price).replace(".", ","); say("Prix non valide : indiquez un montant entre 1 et 9 999 €.", true); return; }
      if (n === p.price) return;
      e.target.value = String(n).replace(".", ",");
      persist(items.map((x) => (x.id === p.id ? { ...x, price: n } : x)), `${p.model} : ${priceLabel(n)}.`, { rerender: false });
    }
    if (e.target.matches("[data-vis]")) {
      const show = e.target.checked;
      if (!show && visibleCount(items) === 1) { e.target.checked = true; say("Gardez au moins un produit en vitrine.", true); return; }
      persist(items.map((x) => { if (x.id !== p.id) return x; const c = { ...x }; if (show) delete c.hidden; else c.hidden = true; return c; }), show ? `${p.model} est en vitrine.` : `${p.model} est masqué.`);
    }
  });
  $("pa-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const p = items.find((x) => x.id === row.dataset.id);
    if (e.target.closest("[data-edit]")) { openForm(p); return; }
    const del = e.target.closest("[data-del]");
    if (!del) return;
    if (del.dataset.sure !== "1") {
      del.dataset.sure = "1"; del.textContent = "Vraiment supprimer ?"; del.classList.add("sure");
      setTimeout(() => { if (del.isConnected) { del.dataset.sure = ""; del.textContent = "Supprimer"; del.classList.remove("sure"); } }, 4000);
      return;
    }
    const next = items.filter((x) => x.id !== p.id);
    if (!visibleCount(next)) { say("Gardez au moins un produit en vitrine.", true); return; }
    persist(next, `${p.brand} ${p.model} supprimé.`);
  });
  $("pa-reset").addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tout remettre comme au départ ?"; setTimeout(() => { b.dataset.sure = ""; b.textContent = "Rétablir le catalogue d'origine"; }, 4000); return; }
    b.dataset.sure = ""; b.textContent = "Rétablir le catalogue d'origine";
    store("local", "pp-demo-products", null);
    load().then(() => say("Catalogue d'origine rétabli."));
  });
}

async function load() {
  const got = await api.products().catch(() => null);
  items = got && got.length ? got : BASE_PRODUCTS.map((p) => ({ ...p }));
  render();
}

export function openShopAdmin() {
  if (!built) build();
  load();
}
