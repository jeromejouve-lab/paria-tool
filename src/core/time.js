// src/core/time.js — utilitaires temps (superset compatible UI)

export const now = () => Date.now();
export const ts  = (n) => new Date(n ?? Date.now()).toLocaleString('fr-FR');

// --- jours / semaines ---
export function addDays(date, days = 0) {
  const base = (date instanceof Date) ? new Date(date) : new Date(date ?? Date.now());
  base.setDate(base.getDate() + days);
  return base;
}
export function addWeeks(date, weeks = 0) { return addDays(date, weeks * 7); }
// alias ISO (souvent importés)
export const addISOWeeks = addWeeks;

// --- semaine ISO (lundi = début de semaine) ---
export function startOfWeek(date) {
  const d = (date instanceof Date) ? new Date(date) : new Date(date ?? Date.now());
  const day = (d.getDay() + 6) % 7; // 0 (dim) → 6
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
// alias ISO attendus par certaines UIs
export const startOfISOWeek = startOfWeek;
export const endOfISOWeek   = endOfWeek;

// --- ISO week parts / ids ---
function isoWeekParts(date) {
  const src = (date instanceof Date) ? new Date(date) : new Date(date ?? Date.now());
  const d = new Date(Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7 (lun..dim)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}
export function weekId(date = new Date()) {
  const { year, week } = isoWeekParts(new Date(date));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
export const isoWeekString = weekId;
export function isoWeekNumber(date = new Date()) { return isoWeekParts(new Date(date)).week; }
export function isoWeekYear(date = new Date())   { return isoWeekParts(new Date(date)).year; }

// alias noms “get*” parfois utilisés
export const getISOWeek = isoWeekNumber;
export const getISOWeekYear = isoWeekYear;

// --- formats pratiques ---
export function formatISODate(date = new Date()) {
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * listWeekDays(date?, locale?) -> 7 jours de la semaine (lun..dim)
 * Chaque élément: { date:Date, iso:'YYYY-MM-DD', label:'lun 16/09', index:0..6, dow:1..7, week:'YYYY-Www' }
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
      dow: i + 1, // 1=lundi ... 7=dimanche
      week: weekId(d),
    });
  }
  return days;
}

// helpers éventuels
export function thisMonday(date = new Date()) { return startOfWeek(date); }
export function nextMonday(date = new Date()) { return startOfWeek(addWeeks(date, 1)); }
export function prevMonday(date = new Date()) { return startOfWeek(addWeeks(date, -1)); }

/*
INDEX time.js:
- now, ts
- addDays, addWeeks, addISOWeeks
- startOfWeek, endOfWeek, startOfISOWeek, endOfISOWeek
- weekId, isoWeekString, isoWeekNumber, isoWeekYear, getISOWeek, getISOWeekYear
- formatISODate
- listWeekDays
- thisMonday, nextMonday, prevMonday
*/
