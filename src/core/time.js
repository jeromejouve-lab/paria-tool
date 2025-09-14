// src/core/time.js — utilitaires temps compatibles avec l'UI

export const now = () => Date.now();

// horodatage lisible (FR)
export const ts = (n) => new Date(n ?? Date.now()).toLocaleString('fr-FR');

// jours / semaines
export function addDays(date, days = 0) {
  const base = (date instanceof Date) ? new Date(date) : new Date(date ?? Date.now());
  base.setDate(base.getDate() + days);
  return base;
}
export function addWeeks(date, weeks = 0) {
  return addDays(date, weeks * 7);
}

// semaine ISO (lundi = début de semaine)
export function startOfWeek(date) {
  const d = (date instanceof Date) ? new Date(date) : new Date(date ?? Date.now());
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
  const src = (date instanceof Date) ? new Date(date) : new Date(date ?? Date.now());
  const d = new Date(Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()));
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
export const isoWeekString = weekId; // alias attendu par l'UI
export function isoWeekNumber(date = new Date()) {
  return isoWeekParts(new Date(date)).week;
}

// formats pratiques
export function formatISODate(date = new Date()) {
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * listWeekDays(date?, locale?) -> renvoie les 7 jours de la semaine (lundi..dimanche)
 * Chaque élément: { date:Date, iso:'YYYY-MM-DD', label:'lun 16/09', index:0..6, dow:1..7, week:'YYYY-Www' }
 * - UI friendly: tu peux afficher label, ou utiliser iso/date selon besoin.
 */
export function listWeekDays(date = new Date(), locale = 'fr-FR') {
  const start = startOfWeek(date);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    days.push({
      date: d,
      iso: formatISODate(d),
      label: d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }),
      index: i,
      dow: i + 1,                // 1=lundi ... 7=dimanche
      week: weekId(d),
    });
  }
  return days;
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
- isoWeekNumber(date)
- formatISODate(date)
- listWeekDays(date?, locale?)
*/
