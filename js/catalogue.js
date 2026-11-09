// Catalogue de la boutique pneus.
// Catalogue de départ : le gérant le modifie ensuite depuis l'espace gérant, onglet Nos pneus.
// Prix indicatifs TTC par pneu, dans la taille de référence indiquée,
// montage, équilibrage et valves inclus. Le prix exact est confirmé au client avant la pose.

export const CATEGORIES = [
  { id: "ete", code: "#f2b84b", label: "Été", accent: "#8a4dff", pattern: null, paint: "#ece8df", season: "Été", pitch: "Pour rouler au chaud, du printemps à l'automne." },
  { id: "4saisons", code: "#7fd8a8", label: "Quatre saisons", accent: "#8a4dff", pattern: "allseason", paint: "#ece8df", season: "4 saisons", pitch: "Un seul train de pneus toute l'année, marqué 3PMSF." },
  { id: "hiver", code: "#82c8f7", label: "Hiver", accent: "#8a4dff", pattern: "winter", paint: "#ece8df", season: "Hiver", pitch: "Gomme tendre et lamelles pour le froid, la neige et la loi Montagne." },
  { id: "sport", code: "#ff7a6b", label: "Sport", accent: "#8a4dff", pattern: "sport", paint: "#ece8df", season: "Été", pitch: "Précision et adhérence pour les voitures puissantes." },
  { id: "competition", code: "#b596ff", label: "Compétition", accent: "#8a4dff", pattern: "slick", paint: "#ece8df", season: "Été", pitch: "Semi-slicks homologués route, pour la piste et les journées circuit." },
  { id: "drift", code: "#f08cc8", label: "Drift", accent: "#8a4dff", pattern: "drift", paint: "#ece8df", season: "Été", pitch: "De la fumée, de la tenue, et des prix pour en user beaucoup." },
  { id: "occasion", code: "#bdb7aa", label: "Occasion", accent: "#8a4dff", pattern: null, paint: "#ece8df", season: "Été", pitch: "Grandes marques peu usées, testées par une entreprise agréée et garanties." },
];

export const BASE_PRODUCTS = [
  { id: "primacy-4p", brand: "Michelin", model: "Primacy 4+", cat: "ete", size: "205/55 R16 91V", price: 109, tags: ["Confort", "Longévité"], desc: "Un pneu été calme et durable, pensé pour les trajets du quotidien et les longues distances." },
  { id: "premiumcontact-7", brand: "Continental", model: "PremiumContact 7", cat: "ete", size: "205/55 R16 91V", price: 104, tags: ["Freinage", "Polyvalent"], desc: "L'équilibre entre précision de conduite et confort, sur le sec comme sous la pluie." },
  { id: "ventus-prime-4", brand: "Hankook", model: "Ventus Prime 4", cat: "ete", size: "205/55 R16 91V", price: 78, tags: ["Qualité-prix"], desc: "Une marque reconnue à prix serré : le bon choix pour une citadine ou une compacte." },
  { id: "roadhawk-2", brand: "Firestone", model: "Roadhawk 2", cat: "ete", size: "205/55 R16 91V", price: 72, tags: ["Petit budget"], desc: "Le pneu été raisonnable pour rouler tranquille sans se ruiner." },
  { id: "crossclimate-2", brand: "Michelin", model: "CrossClimate 2", cat: "4saisons", size: "205/55 R16 94V", price: 126, tags: ["3PMSF", "Toute l'année"], desc: "Été comme hiver, sans changer de pneus. Accepté par la loi Montagne." },
  { id: "vector-4s-g3", brand: "Goodyear", model: "Vector 4Seasons Gen-3", cat: "4saisons", size: "205/55 R16 94V", price: 108, tags: ["3PMSF", "Toute l'année"], desc: "Le 4 saisons sûr et silencieux, pour ceux qui montent parfois en montagne." },
  { id: "alpin-6", brand: "Michelin", model: "Alpin 6", cat: "hiver", size: "205/55 R16 91H", price: 121, tags: ["3PMSF", "Neige"], desc: "Pour les hivers pyrénéens : motricité sur neige et freinage sur route froide." },
  { id: "wintercontact-ts870", brand: "Continental", model: "WinterContact TS 870", cat: "hiver", size: "205/55 R16 91H", price: 112, tags: ["3PMSF", "Verglas"], desc: "Un pneu hiver complet, de la gadoue au verglas, pour rouler serein jusqu'en mars." },
  { id: "pilot-sport-5", brand: "Michelin", model: "Pilot Sport 5", cat: "sport", size: "225/45 R17 94Y", price: 159, tags: ["Précision", "Hautes perf."], desc: "Direction précise et grip constant, pour les sportives et les compactes musclées." },
  { id: "potenza-sport", brand: "Bridgestone", model: "Potenza Sport", cat: "sport", size: "225/45 R17 94Y", price: 139, tags: ["Précision"], desc: "Un pneu sport franc, qui garde la ligne dans les courbes rapides." },
  { id: "pilot-sport-cup-2", brand: "Michelin", model: "Pilot Sport Cup 2", cat: "competition", size: "245/40 ZR18 97Y", price: 289, tags: ["Circuit", "Homologué route"], desc: "La référence des journées circuit, utilisable pour rejoindre la piste par la route." },
  { id: "proxes-r888r", brand: "Toyo", model: "Proxes R888R", cat: "competition", size: "205/50 ZR15 89W", price: 168, tags: ["Semi-slick", "Track day"], desc: "Un semi-slick très apprécié en club, du slalom au circuit." },
  { id: "ns-2r", brand: "Nankang", model: "NS-2R", cat: "drift", size: "225/45 R17 94W", price: 98, tags: ["Drift", "Track day"], desc: "Le pneu des débuts et des entraînements : de la tenue, et une usure qui reste raisonnable." },
  { id: "595-rs-rr", brand: "Federal", model: "595 RS-RR", cat: "drift", size: "225/45 R17 94W", price: 112, tags: ["Drift", "Semi-slick"], desc: "Plus d'accroche à l'avant, pour placer la voiture avec précision." },
  { id: "lot-drift", brand: "Lot drift", model: "4 pneus d'occasion", cat: "drift", size: "225/45 R17", price: 120, unit: "le lot de 4", tags: ["Occasion", "Arrière"], desc: "Quatre pneus d'occasion triés pour l'essieu arrière : de quoi faire de la fumée à petit prix." },
  { id: "occ-primacy-4", brand: "Michelin", model: "Primacy 4 · occasion", cat: "occasion", size: "205/55 R16 91V", price: 45, tags: ["Usure 10 %", "Garanti"], desc: "Grande marque, peu usée, contrôlée et garantie. Dans la limite des stocks." },
  { id: "occ-ecocontact-6", brand: "Continental", model: "EcoContact 6 · occasion", cat: "occasion", size: "195/65 R15 91H", price: 35, tags: ["Usure 15 %", "Garanti"], desc: "Un pneu économique en carburant, à prix discount. Dans la limite des stocks." },
];

// Le catalogue enregistré par le gérant passe avant la liste de départ. S'il ne répond pas vite, la boutique s'affiche quand même.
async function loadProducts() {
  try {
    const saved = await Promise.race([window.BookingAPI?.api.products?.(), new Promise((done) => setTimeout(done, 2500))]);
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (e) { /* liste de départ */ }
  return BASE_PRODUCTS;
}
const ALL = await loadProducts();
export const PRODUCTS = ALL.filter((p) => !p.hidden);

const BASE_IDS = new Set(BASE_PRODUCTS.map((p) => p.id));
export const photoOf = (p) => (p.image ? { src: p.image }
  : BASE_IDS.has(p.id) ? { src: `assets/tires/${p.id}.webp?v=1`, small: `assets/tires/${p.id}-480.webp?v=1` }
  : { src: "assets/tires/generique.svg?v=1" });

export const catOf = (p) => CATEGORIES.find((c) => c.id === p.cat);
export const priceLabel = (n) => `${n.toLocaleString("fr-FR")} €`;
