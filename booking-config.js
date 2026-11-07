/*
 * Réglages de la prise de rendez-vous en ligne.
 * C'est le seul fichier à modifier pour passer de la démo au vrai système (voir GUIDE-RESERVATION.md).
 */
window.BOOKING_CONFIG = {
  // "demo" : tout reste dans le navigateur, rien n'est envoyé au garage.
  // "supabase" : vraies réservations, comptes et connexion Google.
  mode: "demo",
  supabaseUrl: "",       // ex. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",   // clé publique « anon » (jamais la clé « service_role »)

  // Horaires d'ouverture (1 = lundi … 7 = dimanche), heure de Perpignan.
  hours: {
    1: [["08:00", "12:00"], ["14:00", "18:30"]],
    2: [["08:00", "12:00"], ["14:00", "18:30"]],
    3: [["08:00", "12:00"], ["14:00", "18:30"]],
    4: [["08:00", "12:00"], ["14:00", "18:30"]],
    5: [["08:00", "12:00"], ["14:00", "18:30"]],
  },
  slotStep: 30,          // un créneau toutes les 30 minutes
  daysAhead: 15,         // nombre de jours ouvrés proposés
  minLeadMinutes: 90,    // délai minimum avant un rendez-vous pris en ligne
  capacity: 2,           // voitures prises en même temps (en mode démo ; en vrai, réglé dans Supabase)
  closedDates: [],       // congés du garage, ex. ["2026-12-24", "2026-12-31"]

  // Prestations proposées. Les durées sont des estimations à faire valider par le garage.
  services: [
    {
      id: "pneus",
      title: "Changer des pneus",
      desc: "Montage, équilibrage et valves inclus.",
      priceLabel: "Pneus sur devis",
      kind: "tires",
      minutesByQty: { 1: 20, 2: 30, 4: 45 },
    },
    {
      id: "crevaison",
      title: "Réparer une crevaison",
      desc: "Réparation à la mèche si le pneu est réparable. Sinon, on vous propose un pneu.",
      price: 15,
      minutes: 30,
    },
    {
      id: "geometrie",
      title: "Géométrie 3D",
      desc: "Pneus usés d'un seul côté, volant de travers, voiture qui tire.",
      minutes: 60,
      options: [
        { id: "avant", label: "Parallélisme avant", price: 65 },
        { id: "complete", label: "Avant, arrière et carrossage", price: 85 },
        { id: "utilitaire", label: "4x4 ou camionnette", price: 100 },
      ],
    },
    {
      id: "clim",
      title: "Recharge de climatisation",
      desc: "Contrôle, tirage au vide, recharge et test.",
      minutes: 60,
      options: [
        { id: "r134a", label: "Gaz R134a", hint: "véhicules plus anciens", price: 65 },
        { id: "r1234yf", label: "Gaz R1234yf", hint: "la plupart des véhicules depuis 2017", price: 110 },
      ],
    },
    { id: "vidange", title: "Vidange et entretien", desc: "Huile, filtres, contrôle des niveaux.", priceLabel: "Sur devis", minutes: 60 },
    { id: "freins", title: "Freins", desc: "Plaquettes, disques, bruit au freinage.", priceLabel: "Sur devis", minutes: 90 },
    { id: "autre", title: "Autre besoin ou diagnostic", desc: "Bruit, voyant allumé, autre réparation.", priceLabel: "Sur devis", minutes: 60, needsNote: true },
  ],
};
