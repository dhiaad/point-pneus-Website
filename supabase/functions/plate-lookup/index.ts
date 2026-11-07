// Fonction serveur Supabase : recherche d'un véhicule à partir de sa plaque.
// La clé du fournisseur reste ici, côté serveur : elle n'apparaît jamais dans le navigateur.
//
// Secrets à définir (Supabase > Edge Functions > Secrets) :
//   PLATE_API_URL         adresse du fournisseur, avec {plate} à la place de la plaque
//                         ex. https://api.fournisseur.fr/v1/vehicule?immat={plate}
//   PLATE_API_KEY         clé fournie par le fournisseur
//   PLATE_API_KEY_HEADER  nom de l'en-tête qui porte la clé (par défaut : Authorization)
//   PLATE_API_KEY_PREFIX  préfixe éventuel de la clé (ex. "Bearer ")
//   ALLOWED_ORIGIN        adresse du site, ex. https://www.point-pneus-guerido.com
//   SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
//
// Les fournisseurs ne nomment pas leurs champs de la même façon : adaptez mapVehicle()
// au format de celui qui sera choisi (sa documentation donne un exemple de réponse).

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const MAX_PER_HOUR = 10;          // recherches par visiteur et par heure
const CACHE_DAYS = 90;            // une plaque déjà cherchée n'est pas refacturée

const SIV = /^[A-HJ-NP-TV-Z]{2}\d{3}[A-HJ-NP-TV-Z]{2}$/;
const FNI = /^\d{1,4}[A-Z]{1,3}(\d{2}|2A|2B)$/;

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cherche une valeur parmi plusieurs noms de champs possibles (même imbriqués).
function pick(obj: Record<string, unknown>, names: string[]): unknown {
  const lower = names.map((n) => n.toLowerCase());
  const stack: unknown[] = [obj];
  while (stack.length) {
    const cur = stack.shift();
    if (!cur || typeof cur !== "object") continue;
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (lower.includes(k.toLowerCase()) && v !== null && v !== "" && typeof v !== "object") return v;
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return undefined;
}

function mapVehicle(raw: Record<string, unknown>) {
  const str = (v: unknown) => (v === undefined ? undefined : String(v).trim());
  const brand = str(pick(raw, ["marque", "brand", "make", "manufacturer"]));
  const model = str(pick(raw, ["modele", "modèle", "model", "commercial_name", "denomination"]));
  if (!brand && !model) return null;
  const dateRaw = str(pick(raw, ["date1erCir_fr", "date1ercir", "date_mise_circulation", "first_registration", "registration_date", "date1ercir_us", "annee", "year"]));
  const yearMatch = dateRaw?.match(/(19|20)\d{2}/);
  const tireRaw = str(pick(raw, ["pneus", "pneu", "tyre", "tire", "tyre_size", "tire_size", "dimension_pneu"]));
  const tire = tireRaw?.toUpperCase().replace(/\s+/g, " ").match(/(\d{3})\s*\/\s*(\d{2})\s*Z?R\s*(\d{2})/);
  return {
    brand,
    model,
    version: str(pick(raw, ["version", "finition", "variant", "sra_commercial"])),
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    fuel: str(pick(raw, ["energie", "énergie", "energy", "fuel", "fuel_type", "energienggo"])),
    tire: tire ? `${tire[1]}/${tire[2]} R${tire[3]}` : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let plate = "";
  try {
    const body = await req.json();
    plate = String(body?.plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!SIV.test(plate) && !FNI.test(plate)) return json({ error: "invalid_plate" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // 1. Cache
  const plateHash = await sha256("plate:" + plate);
  const { data: cached } = await db.from("plate_cache").select("data, fetched_at").eq("plate_hash", plateHash).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_DAYS * 864e5) {
    return json({ vehicle: cached.data });
  }

  // 2. Limite par visiteur (adresse IP hachée, jamais stockée en clair)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "inconnu";
  const ipHash = await sha256("ip:" + ip + new Date().toISOString().slice(0, 10));
  const since = new Date(Date.now() - 36e5).toISOString();
  const { count } = await db.from("plate_lookups").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) return json({ error: "too_many" }, 429);
  await db.from("plate_lookups").insert({ ip_hash: ipHash });
  await db.from("plate_lookups").delete().lt("created_at", new Date(Date.now() - 864e5).toISOString());

  // 3. Appel du fournisseur
  const url = Deno.env.get("PLATE_API_URL");
  const key = Deno.env.get("PLATE_API_KEY");
  if (!url || !key) return json({ error: "not_configured" }, 503);
  const headerName = Deno.env.get("PLATE_API_KEY_HEADER") ?? "Authorization";
  const prefix = Deno.env.get("PLATE_API_KEY_PREFIX") ?? "";

  let raw: Record<string, unknown>;
  try {
    const res = await fetch(url.replace("{plate}", encodeURIComponent(plate)), {
      headers: { [headerName]: prefix + key, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return json({ error: "not_found" }, 404);
    if (!res.ok) return json({ error: "provider_error" }, 502);
    raw = await res.json();
  } catch {
    return json({ error: "provider_unreachable" }, 502);
  }

  const vehicle = mapVehicle(raw);
  if (!vehicle) return json({ error: "not_found" }, 404);

  await db.from("plate_cache").upsert({ plate_hash: plateHash, data: vehicle, fetched_at: new Date().toISOString() });
  return json({ vehicle });
});
