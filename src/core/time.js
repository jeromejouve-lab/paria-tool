// src/core/time.js — utilitaires temps compatibles avec l'UI

export const now = () => Date.now();

// horodatage lisible (FR)
export const ts = (n) => new Date(n ?? Date.now()).toLocaleString('fr-FR');

// jours / semaines
export function addDays(date, days = 0) {
  const d = new Date(date ?? Date.now());
  d.setDate(d.getDate() + days);
  return d;
}
export function addWeeks(date, weeks = 0) {
  return addDays(date, weeks * 7);
}

// semaine ISO (lundi = début de semaine)
export function startOfWeek(date) {
  const d = new Date(date ?? Date.now());
  const day = (d.getDay() + 6) % 7; // 0=>dimanche => 6
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}
export function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

// numéro & libellé de semaine ISO
function isoWeekParts(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7 (lundi..dimanche)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}
export function weekId(date = new Date()) {
  const { year, week } = isoWeekParts(new Date(date));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
// alias attendu par l'UI
export const isoWeekString = weekId;

// formats pratiques
export function formatISODate(date = new Date()) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/*
INDEX time.js:
- now()
- ts(n?)
- addDays(date, days)
- addWeeks(date, weeks)
- startOfWeek(date)
- endOfWeek(date)
- weekId(date)
- isoWeekString(date)  // alias de weekId
- formatISODate(date)
*/

