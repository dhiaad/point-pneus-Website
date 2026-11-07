/* Espace garage : rendez-vous à venir, changement de statut, blocage de créneaux. */
(function () {
  "use strict";

  const { api, isDemo, time: T } = window.BookingAPI;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STATUS = { en_attente: "À confirmer", confirme: "Confirmé", annule: "Annulé", termine: "Terminé" };
  const hour = (d) => { const p = T.parisParts(new Date(d)); return `${p.h} h ${T.pad(p.min)}`; };
  const day = (d) => { const s = T.dateLabel.format(new Date(d)); return s.charAt(0).toUpperCase() + s.slice(1); };
  const back = location.origin + location.pathname;

  $("demo-banner").hidden = !isDemo;

  async function start() {
    const user = await api.getUser().catch(() => null);
    $("login").hidden = Boolean(user);
    $("garage-user").hidden = !user;
    $("dashboard").hidden = true;
    $("denied").hidden = true;
    if (!user) return;
    $("admin-email").textContent = user.email;
    if (!(await api.isAdmin())) { $("denied").hidden = false; return; }
    $("dashboard").hidden = false;
    const now = T.parisParts(new Date());
    $("b-day").value = T.dayKey(now.y, now.m, now.d);
    loadBookings();
    loadQuotes();
    loadBlocks();
  }

  const QUOTE_LABELS = { besoin: "Besoin", taille: "Taille", indices: "Indices", saison: "Saison", quantite: "Quantité", gamme: "Gamme", type: "Type", vehicule: "Véhicule", immatriculation: "Plaque" };

  async function loadQuotes() {
    const box = $("quotes");
    let list;
    try { list = await api.adminQuotes(); } catch (e) { box.innerHTML = "<p>Chargement impossible.</p>"; return; }
    if (!list.length) { box.innerHTML = `<p class="loading">Aucune demande pour le moment.</p>`; return; }
    box.innerHTML = list.map((q) => {
      const phone = String(q.customer_phone || q.phone || "").replace(/[^\d+]/g, "");
      const name = q.customer_name || q.name;
      const details = Object.entries(q.details || {}).filter(([, v]) => v)
        .map(([k, v]) => `<li><b>${esc(QUOTE_LABELS[k] || k)} :</b> ${esc(v)}</li>`).join("");
      const when = `${day(q.created_at)}, ${hour(q.created_at)}`;
      return `<article class="bk ${q.status === "traite" ? "bk-termine" : ""}">
        <p class="bk-time">${q.kind === "mecanique" ? "Mécanique" : "Pneus"}</p>
        <div class="bk-main">
          <p class="bk-name">${esc(name)} · <a href="tel:${esc(phone)}">${esc(q.customer_phone || q.phone)}</a></p>
          <ul class="bk-services">${details}</ul>
          <p class="bk-car">Reçue ${esc(when)}</p>
        </div>
        <div class="bk-side">
          <p class="bk-status">${q.status === "traite" ? "Traitée" : "À rappeler"}</p>
          ${q.status === "traite" ? "" : `<div class="bk-actions"><button class="btn btn-yellow" data-quote="${esc(q.id)}">Marquer traitée</button></div>`}
        </div>
      </article>`;
    }).join("");
  }

  $("quotes").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-quote]");
    if (!b) return;
    b.disabled = true;
    try { await api.adminSetQuoteStatus(b.dataset.quote, "traite"); loadQuotes(); }
    catch (err) { b.disabled = false; b.textContent = "Échec, réessayer"; }
  });

  async function loadBookings() {
    const box = $("bookings");
    box.innerHTML = `<p class="loading">Chargement…</p>`;
    const days = Number(document.querySelector('input[name="range"]:checked').value);
    const from = new Date(Date.now() - 2 * 36e5);
    const to = new Date(Date.now() + days * 864e5);
    let list;
    try { list = await api.adminBookings(from, to); } catch (e) { box.innerHTML = "<p>Chargement impossible. Vérifiez la connexion.</p>"; return; }
    if (!list.length) { box.innerHTML = `<p class="loading">Aucun rendez-vous sur cette période.</p>`; return; }
    let current = "";
    box.innerHTML = list.map((b) => {
      const d = day(b.start_at);
      const head = d !== current ? `<h3 class="day-head">${esc(d)}</h3>` : "";
      current = d;
      const v = b.vehicle || {};
      const vehicle = [v.brand, v.model, v.version, v.year].filter(Boolean).join(" ");
      const services = (b.services || []).map((s) => `<li>${esc(s.label || s.title || s.id)}${s.note ? ` : <em>${esc(s.note)}</em>` : ""}</li>`).join("");
      const phone = String(b.customer_phone || "").replace(/[^\d+]/g, "");
      return `${head}<article class="bk bk-${b.status}">
        <p class="bk-time">${hour(b.start_at)} – ${hour(b.end_at)}</p>
        <div class="bk-main">
          <p class="bk-name">${esc(b.customer_name)} · <a href="tel:${esc(phone)}">${esc(b.customer_phone)}</a>${b.customer_email ? ` · <a href="mailto:${esc(b.customer_email)}">${esc(b.customer_email)}</a>` : ""}</p>
          <p class="bk-car">${esc(vehicle)}${b.plate ? ` · <b>${esc(b.plate)}</b>` : ""}</p>
          <ul class="bk-services">${services}</ul>
          ${b.note ? `<p class="bk-note">« ${esc(b.note)} »</p>` : ""}
        </div>
        <div class="bk-side">
          <p class="bk-status">${STATUS[b.status] || esc(b.status)}</p>
          <div class="bk-actions">
            ${b.status === "en_attente" ? `<button class="btn btn-yellow" data-id="${esc(b.id)}" data-status="confirme">Confirmer</button>` : ""}
            ${b.status === "confirme" ? `<button class="btn btn-outline" data-id="${esc(b.id)}" data-status="termine">Terminé</button>` : ""}
            ${b.status === "en_attente" || b.status === "confirme" ? `<button class="text-btn" data-id="${esc(b.id)}" data-status="annule">Annuler</button>` : ""}
          </div>
        </div>
      </article>`;
    }).join("");
  }

  $("bookings").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-status]");
    if (!b) return;
    if (b.dataset.status === "annule" && b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Confirmer l'annulation"; return; }
    b.disabled = true;
    try { await api.adminSetStatus(b.dataset.id, b.dataset.status); loadBookings(); }
    catch (err) { b.disabled = false; b.textContent = "Échec, réessayer"; }
  });
  document.querySelectorAll('input[name="range"]').forEach((r) => r.addEventListener("change", loadBookings));

  async function loadBlocks() {
    const list = await api.adminBlocks().catch(() => []);
    $("blocks").innerHTML = list.map((b) => `<li><span>${esc(day(b.start_at))}, ${hour(b.start_at)} – ${hour(b.end_at)}${b.reason ? ` · ${esc(b.reason)}` : ""}</span>
      <button class="text-btn" type="button" data-block="${esc(b.id)}">Retirer</button></li>`).join("");
  }

  $("blocks").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-block]");
    if (!b) return;
    b.disabled = true;
    await api.adminDeleteBlock(b.dataset.block).catch(() => null);
    loadBlocks();
  });

  $("block-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("block-error");
    const [y, m, d] = $("b-day").value.split("-").map(Number);
    const [fh, fm] = $("b-from").value.split(":").map(Number);
    const [th, tm] = $("b-to").value.split(":").map(Number);
    if (!y || Number.isNaN(fh) || Number.isNaN(th) || th * 60 + tm <= fh * 60 + fm) {
      err.textContent = "Vérifiez le jour et les heures (l'heure de fin doit être après l'heure de début).";
      err.hidden = false;
      return;
    }
    err.hidden = true;
    try {
      await api.adminBlock(T.parisDate(y, m, d, fh, fm), T.parisDate(y, m, d, th, tm), $("b-reason").value.trim() || null);
      $("b-reason").value = "";
      loadBlocks();
    } catch (x) {
      err.textContent = "Le blocage n'a pas été enregistré.";
      err.hidden = false;
    }
  });

  $("admin-google").addEventListener("click", async () => { await api.signInWithGoogle(back).catch(() => null); start(); });
  $("admin-email-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("admin-email-input").value.trim();
    if (!email) return;
    try {
      const r = await api.signInWithEmail(email, back);
      if (r && r.instant) start(); else $("admin-email-msg").textContent = "Lien envoyé. Ouvrez-le pour revenir ici connecté.";
    } catch (x) { $("admin-email-msg").textContent = "Envoi impossible."; }
  });
  $("admin-signout").addEventListener("click", async () => { await api.signOut(); start(); });

  start();
})();
