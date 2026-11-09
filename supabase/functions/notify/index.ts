// Fonction serveur Supabase : e-mails (et SMS facultatif) envoyés via Brevo.
// Appelée par deux « Database Webhooks » Supabase :
//   - table bookings, événements INSERT et UPDATE
//   - table quote_requests, événement INSERT
//   - table dev_requests, événement INSERT (Qamar : e-mail aux développeurs, à l'adresse DEV_EMAIL)
//
// Ce qu'elle envoie :
//   - nouveau rendez-vous  → e-mail au garage (+ SMS si GARAGE_SMS est rempli) et accusé de réception au client
//   - rendez-vous confirmé ou annulé par le garage → e-mail au client
//   - nouvelle demande de devis → e-mail au garage (+ SMS si GARAGE_SMS est rempli)
//
// Secrets (Supabase > Edge Functions > Secrets) :
//   BREVO_API_KEY    clé API Brevo (brevo.com > SMTP & API > Clés API)
//   SENDER_EMAIL     adresse d'expédition validée dans Brevo, ex. rdv@point-pneus-guerido.com
//   GARAGE_EMAIL     adresse qui reçoit les alertes, ex. pointpneusguerido@free.fr
//   DEV_EMAIL        adresse des développeurs, qui reçoit les demandes Qamar
//   GARAGE_SMS       (facultatif) portable du garage au format 33612345678
//   WEBHOOK_SECRET   mot de passe choisi, recopié dans l'en-tête des webhooks : Authorization: Bearer <secret>
//   SITE_URL         ex. https://www.point-pneus-guerido.com

const BREVO = "https://api.brevo.com/v3";
const env = (k: string) => Deno.env.get(k) ?? "";
const SITE = env("SITE_URL") || "https://www.point-pneus-guerido.com";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const paris = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...opts }).format(new Date(iso));
const when = (iso: string) => {
  const d = paris(iso, { weekday: "long", day: "numeric", month: "long" });
  const h = paris(iso, { hour: "numeric", minute: "2-digit" }).replace(":", " h ");
  return `${d.charAt(0).toUpperCase()}${d.slice(1)} à ${h}`;
};

type Row = Record<string, any>;

function layout(title: string, body: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#FFD600;font-family:Arial,sans-serif;color:#000">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <p style="font-weight:bold;font-size:20px;margin:0 0 16px">POINT PNEUS GUERIDO</p>
    <div style="background:#fff;border-radius:12px;padding:24px">
      <h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${body}
    </div>
    <p style="font-size:13px;margin:16px 0 0">9 Rue Henri Becquerel, 66330 Cabestany · 04 68 50 50 68</p>
  </div></body></html>`;
}

function servicesList(b: Row) {
  const items = (b.services ?? []).map((s: Row) => `<li>${esc(s.label ?? s.title ?? s.id)}${s.note ? ` : ${esc(s.note)}` : ""}</li>`).join("");
  return `<ul style="padding-left:18px">${items}</ul>`;
}

function vehicleText(b: Row) {
  const v = b.vehicle ?? {};
  return [v.brand, v.model, v.version, v.year].filter(Boolean).join(" ") + (b.plate ? ` · ${b.plate}` : "");
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  if (!to) return;
  const res = await fetch(`${BREVO}/smtp/email`, {
    method: "POST",
    headers: { "api-key": env("BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Point Pneus Guerido", email: env("SENDER_EMAIL") },
      to: [{ email: to }],
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) console.error("brevo email", res.status, await res.text());
}

async function sendSms(content: string) {
  const to = env("GARAGE_SMS");
  if (!to) return;
  const res = await fetch(`${BREVO}/transactionalSMS/sms`, {
    method: "POST",
    headers: { "api-key": env("BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: "PointPneus", recipient: to, content: content.slice(0, 300), type: "transactional" }),
  });
  if (!res.ok) console.error("brevo sms", res.status, await res.text());
}

async function newBooking(b: Row) {
  const garage = layout("Nouveau rendez-vous à confirmer", `
    <p style="font-size:18px;font-weight:bold">${esc(when(b.start_at))}</p>
    <p>${esc(b.customer_name)} · <a href="tel:${esc(b.customer_phone)}">${esc(b.customer_phone)}</a>${b.customer_email ? ` · ${esc(b.customer_email)}` : ""}</p>
    <p>${esc(vehicleText(b))}</p>${servicesList(b)}
    ${b.note ? `<p><em>« ${esc(b.note)} »</em></p>` : ""}
    <p><a href="${SITE}/garage.html" style="display:inline-block;background:#000;color:#FFD600;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmer dans l'espace garage</a></p>`);
  await sendEmail(env("GARAGE_EMAIL"), `RDV ${when(b.start_at)} · ${b.customer_name}`, garage, b.customer_email || undefined);
  await sendSms(`Nouveau RDV ${when(b.start_at)} : ${b.customer_name} ${b.customer_phone}. A confirmer sur ${SITE}/garage.html`);

  if (b.customer_email) {
    const client = layout("Demande de rendez-vous bien reçue", `
      <p>Bonjour ${esc(String(b.customer_name).split(" ")[0])},</p>
      <p>Nous avons bien reçu votre demande pour le <b>${esc(when(b.start_at))}</b>.</p>
      <p>${esc(vehicleText(b))}</p>${servicesList(b)}
      <p>Le garage vous confirme le rendez-vous très vite. Paiement sur place.</p>
      <p>Pour modifier ou annuler : <a href="${SITE}/reserver.html">vos rendez-vous en ligne</a> ou le 04 68 50 50 68.</p>`);
    await sendEmail(b.customer_email, "Votre demande de rendez-vous chez Point Pneus Guerido", client);
  }
}

async function statusChanged(b: Row, before: Row) {
  if (!b.customer_email || before.status === b.status) return;
  if (b.status === "confirme") {
    await sendEmail(b.customer_email, `Rendez-vous confirmé : ${when(b.start_at)}`, layout("Votre rendez-vous est confirmé", `
      <p style="font-size:18px;font-weight:bold">${esc(when(b.start_at))}</p>
      <p>${esc(vehicleText(b))}</p>${servicesList(b)}
      <p>Adresse : 9 Rue Henri Becquerel, 66330 Cabestany.
      <a href="https://www.google.com/maps/dir/?api=1&destination=9%20Rue%20Henri%20Becquerel%2C%2066330%20Cabestany">Itinéraire</a></p>
      <p>Un empêchement ? Prévenez-nous au 04 68 50 50 68.</p>`));
  } else if (b.status === "annule") {
    await sendEmail(b.customer_email, "Rendez-vous annulé", layout("Votre rendez-vous est annulé", `
      <p>Le rendez-vous du <b>${esc(when(b.start_at))}</b> est annulé.</p>
      <p>Pour en reprendre un : <a href="${SITE}/reserver.html">réserver en ligne</a> ou le 04 68 50 50 68.</p>`));
  }
}

async function newQuote(q: Row) {
  const labels: Record<string, string> = { besoin: "Besoin", taille: "Taille", indices: "Indices", saison: "Saison", quantite: "Quantité", gamme: "Gamme", type: "Type de pneu", vehicule: "Véhicule", immatriculation: "Immatriculation" };
  const rows = Object.entries(q.details ?? {}).filter(([, v]) => v && typeof v !== "object")
    .map(([k, v]) => `<li><b>${esc(labels[k] ?? k)} :</b> ${esc(v)}</li>`).join("");
  await sendEmail(env("GARAGE_EMAIL"), `Devis ${q.kind === "mecanique" ? "mécanique" : "pneus"} · ${q.customer_name}`, layout("Nouvelle demande de devis", `
    <p>${esc(q.customer_name)} · <a href="tel:${esc(q.customer_phone)}">${esc(q.customer_phone)}</a></p>
    <ul style="padding-left:18px">${rows}</ul>
    <p>À rappeler. <a href="${SITE}/garage.html">Espace garage</a></p>`));
  await sendSms(`Devis ${q.kind}: ${q.customer_name} ${q.customer_phone}`);
}

async function newDevRequest(r: Row) {
  const kinds: Record<string, string> = { demande: "Demande", amelioration: "Amélioration", probleme: "Problème" };
  await sendEmail(env("DEV_EMAIL"), `Qamar · ${kinds[r.kind] ?? r.kind} · ${r.page} · priorité ${r.priority}`, layout("Nouvelle demande Qamar", `
    <p><b>${esc(kinds[r.kind] ?? r.kind)}</b> · ${esc(r.page)} · priorité ${esc(r.priority)}</p>
    <p style="white-space:pre-line">${esc(r.description)}</p>
    ${r.attachment ? `<p>Fichier joint : ${esc(r.attachment.name)}, à voir dans Supabase &gt; dev_requests.</p>` : ""}`));
}

Deno.serve(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${env("WEBHOOK_SECRET")}` || !env("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  if (!payload?.record) return new Response("ignored", { status: 200 });
  try {
    if (payload.table === "bookings" && payload.type === "INSERT") await newBooking(payload.record);
    else if (payload.table === "bookings" && payload.type === "UPDATE") await statusChanged(payload.record, payload.old_record ?? {});
    else if (payload.table === "quote_requests" && payload.type === "INSERT") await newQuote(payload.record);
    else if (payload.table === "dev_requests" && payload.type === "INSERT") await newDevRequest(payload.record);
  } catch (e) {
    console.error(e);
  }
  return new Response("ok", { status: 200 });
});
