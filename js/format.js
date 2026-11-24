// Formátování čísel a dat (česky).

const nf = new Map();
function fmt(des) {
  if (!nf.has(des)) nf.set(des, new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: des, maximumFractionDigits: des }));
  return nf.get(des);
}

export const jeSazba = t => t?.jednotka === "%";

export function cislo(v, des = 2) {
  return v == null || !Number.isFinite(v) ? "–" : fmt(des).format(v).replace("-", "−");
}

export function hodnota(t, v) {
  if (v == null) return "–";
  return cislo(v, t?.des ?? 2) + (jeSazba(t) ? " %" : "");
}

function znamenko(v, text) {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + text.replace("-", "").replace("−", "");
}

export function procenta(rel, des = 2) {
  if (rel == null || !Number.isFinite(rel)) return "–";
  return znamenko(rel, fmt(des).format(Math.abs(rel * 100))) + " %";
}

// změna: u sazeb v bazických bodech, jinak v jednotkách titulu
export function zmenaAbs(t, abs) {
  if (abs == null || !Number.isFinite(abs)) return "–";
  if (jeSazba(t)) return znamenko(abs, fmt(0).format(Math.abs(abs * 100))) + " bp";
  return znamenko(abs, fmt(t?.des ?? 2).format(Math.abs(abs)));
}

// hlavní údaj o změně: sazby v bp, ostatní v %
export function zmenaHlavni(t, z) {
  if (!z) return "–";
  return jeSazba(t) ? zmenaAbs(t, z.abs) : procenta(z.rel);
}

export function smer(v) {
  return v > 0 ? "up" : v < 0 ? "down" : "flat";
}

export function datum(iso) {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

export function datumKratce(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}. ${y.slice(2)}`;
}

export function casRelativne(iso) {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return "právě teď";
  if (s < 3600) return `před ${Math.round(s / 60)} min`;
  if (s < 86400) return `před ${Math.round(s / 3600)} h`;
  return datum(new Date(iso).toISOString());
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
