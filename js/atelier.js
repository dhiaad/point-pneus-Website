// L'atelier interactif : on choisit une zone du véhicule, elle s'allume, sa ligne ressort,
// la prestation s'affiche avec ses tarifs et l'accès au rendez-vous.
// Ce module marche seul (plan fixe) ; la scène 3D du grand écran s'y abonne.

export function initAtelier() {
  const root = document.getElementById("atelier");
  const zones = [...root.querySelectorAll(".co[data-z]")];
  const spots = [...root.querySelectorAll(".hs[data-z]")];
  const cards = [...root.querySelectorAll(".ap-card[data-z]")];
  const lit = [...root.querySelectorAll(".ap-lit g[data-z]")];
  const link = root.querySelector(".ap-link");
  const panel = document.getElementById("ap-panel");
  const VIEW_H = 734;
  const listeners = { change: [], hot: [] };
  let current = zones[0].dataset.z;

  spots.forEach((s) => { s.style.setProperty("--x", `${(Number(s.dataset.x) / 12.8).toFixed(2)}%`); s.style.setProperty("--y", `${(Number(s.dataset.y) / 7.34).toFixed(2)}%`); });

  function paint() {
    zones.forEach((el) => {
      const on = el.dataset.z === current;
      el.setAttribute("aria-pressed", String(on));
      el.classList.toggle("on", on);
    });
    spots.forEach((el) => el.classList.toggle("on", el.dataset.z === current));
    lit.forEach((el) => el.classList.toggle("on", el.dataset.z === current));
    cards.forEach((el) => { el.hidden = el.dataset.z !== current; });
    const spot = spots.find((s) => s.dataset.z === current);
    if (link && spot) link.setAttribute("d", `M${spot.dataset.x} ${spot.dataset.y}V${VIEW_H}`);
  }

  function select(z, { reveal = false } = {}) {
    if (!cards.some((c) => c.dataset.z === z)) return;
    if (z !== current) {
      current = z;
      paint();
      listeners.change.forEach((f) => f(current));
    }
    // Sur téléphone, le détail est sous le plan : on s'assure qu'il est à l'écran.
    if (reveal && root.ownerDocument.documentElement.classList.contains("static")) {
      const r = panel.getBoundingClientRect();
      if (r.bottom > innerHeight - 72 || r.top < 0) panel.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }

  const setHot = (z) => {
    zones.forEach((el) => el.classList.toggle("hot", el.dataset.z === z));
    spots.forEach((el) => el.classList.toggle("hot", el.dataset.z === z));
    listeners.hot.forEach((f) => f(z));
  };

  [...zones, ...spots].forEach((el) => {
    el.addEventListener("click", () => select(el.dataset.z, { reveal: true }));
    el.addEventListener("pointerenter", () => setHot(el.dataset.z));
    el.addEventListener("pointerleave", () => setHot(null));
    el.addEventListener("focus", () => setHot(el.dataset.z));
    el.addEventListener("blur", () => setHot(null));
  });

  // Flèches du clavier : on parcourt les zones sans repasser par chaque bouton.
  root.querySelector(".callouts").addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const i = zones.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = zones[(i + step + zones.length) % zones.length];
    next.focus();
    select(next.dataset.z);
  });

  paint();
  return {
    select,
    get current() { return current; },
    onChange: (f) => listeners.change.push(f),
    onHot: (f) => listeners.hot.push(f),
  };
}
