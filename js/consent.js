// Bannière de cookies et mesure d'audience du site.
// Rien n'est compté sans l'accord du visiteur. Aucun identifiant, aucune adresse IP, aucun suivi d'un site à l'autre :
// seulement « une visite, telle page, depuis Google, sur téléphone ».
(function () {
  "use strict";
  const KEY = "pp-consent", KEEP = 182 * 864e5;   // le choix est redemandé au bout de six mois
  const cfg = window.BOOKING_CONFIG || {};
  const live = cfg.mode === "supabase" && cfg.supabaseUrl && cfg.supabaseAnonKey;

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } },
  };
  const choice = () => { const c = ls.get(KEY); return c && Date.now() - c.t < KEEP ? c.v : null; };
  const device = () => (innerWidth < 768 ? "mobile" : innerWidth < 1100 ? "tablette" : "ordinateur");
  const path = () => { const p = location.pathname.replace(/\/index\.html$/, "/"); return p.slice(0, 80) || "/"; };
  function source() {
    let h = "";
    try { h = new URL(document.referrer).hostname.replace(/^www\./, ""); } catch (e) { return "Accès direct"; }
    if (h === location.hostname.replace(/^www\./, "")) return "";
    if (/google\./.test(h)) return "Google";
    if (/bing\.|duckduckgo|qwant|ecosia|yahoo\./.test(h)) return "Autre moteur";
    if (/facebook|instagram|fb\.|tiktok|t\.co|twitter|x\.com|snapchat|youtube/.test(h)) return "Réseaux sociaux";
    if (/waze|maps\.apple|pagesjaunes|mappy/.test(h)) return "Annuaires et GPS";
    return h.slice(0, 40);
  }

  function send(kind, src) {
    if (choice() !== "oui") return;
    const row = { kind, path: path(), source: src || null, device: device() };
    if (live) {
      fetch(`${cfg.supabaseUrl}/rest/v1/rpc/track_event`, {
        method: "POST", keepalive: true,
        headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_kind: row.kind, p_path: row.path, p_source: row.source, p_device: row.device }),
      }).catch(() => {});
      return;
    }
    // Mode démo : tout reste dans ce navigateur.
    const list = ls.get("pp-demo-events") || [], d = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const same = list.find((r) => r.d === d && r.kind === row.kind && r.path === row.path && r.source === row.source && r.device === row.device);
    if (same) same.n += 1; else list.push({ d, ...row, n: 1 });
    ls.set("pp-demo-events", list.slice(-6000));
  }
  window.ppTrack = send;

  function pageview() {
    if (choice() !== "oui") return;
    let seen = false;
    try { seen = sessionStorage.getItem("pp-vu") === "1"; sessionStorage.setItem("pp-vu", "1"); } catch (e) { /* rien */ }
    if (!seen) send("visite", source() || "Accès direct");
    send("page");
  }

  // Ce qui compte vraiment pour le garage : qui appelle, qui cherche la route, qui va réserver.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a, button");
    if (!a) return;
    if (a.dataset.track) { send(a.dataset.track); return; }
    const href = a.getAttribute("href") || "";
    if (href.startsWith("tel:")) send("appel");
    else if (a.dataset.open === "route") send("itineraire");
    else if (/reserver\.html/.test(href)) send("rdv");
  }, true);

  /* ---------------- La bannière ---------------- */
  let box = null;
  function close() { if (box) { box.remove(); box = null; } }
  function decide(v) {
    ls.set(KEY, { v, t: Date.now() });
    close();
    if (v === "oui") pageview();
  }
  function open() {
    if (box) return;
    box = document.createElement("div");
    box.className = "ck";
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", "Mesure d'audience");
    box.innerHTML = '<p>Avec votre accord, on compte les visites de façon anonyme, pour savoir ce qui sert sur le site. Pas de publicité, pas de suivi ailleurs. <a href="confidentialite.html#cookies">En savoir plus</a></p>'
      + '<div class="ck-a"><button class="btn btn-ghost btn-sm" type="button" data-ck="non">Refuser</button><button class="btn btn-ghost btn-sm" type="button" data-ck="oui">Accepter</button></div>';
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-ck]"); if (b) decide(b.dataset.ck); });
    document.body.appendChild(box);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-consent]");
    if (a) { e.preventDefault(); open(); }
  });

  if (choice() === null) setTimeout(open, 700); else pageview();
})();
