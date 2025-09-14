// src/core/time.js — utilitaires temps alignés sur l'UI

// combineAt('YYYY-MM-DD','HH:mm') -> 'YYYY-MM-DDTHH:mm' (ou date seule si invalide)
export function toISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '';
}
export function combineAt(dateISO, hhmm) {
  const d = toISODate(dateISO);
  if (!d) return dateISO;
  const t = (hhmm || '').trim();
  if (!t) return d;
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return d;
  return `${d}T${m[1]}:${m[2]}`;
}

// lundi comme début de semaine (ISO)
export function startOfISOWeek(date = new Date()) {
  const t = new Date(date);
  const day = (t.getDay() + 6) % 7; // 0=dimanche -> 6
  t.setDate(t.getDate() - day);
  t.setHours(0, 0, 0, 0);
  return t;
}

export function addWeeks(date, n = 0) {
  const t = new Date(date);
  t.setDate(t.getDate() + n * 7);
  return t;
}

// libellé ISO de semaine: "YYYY-Www"
export function isoWeekString(date = new Date()) {
  const src = new Date(date);
  const d = new Date(Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7 (lun..dim)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const yyyy = d.getUTCFullYear();
  const ww = String(weekNo).padStart(2, '0');
  return `${yyyy}-W${ww}`;
}

// liste les 7 jours de la semaine (lun..dim) autour de "date"
export function listWeekDays(date = new Date(), locale = 'fr-FR') {
  const start = startOfISOWeek(date);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push({
      date: d,
      iso: d.toISOString().slice(0, 10), // YYYY-MM-DD
      label: d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit' }),
      index: i
    });
  }
  return out;
}

/*
INDEX time.js:
- toISODate(s)
- combineAt(dateISO, hhmm)
- startOfISOWeek(date)
- addWeeks(date, n)
- isoWeekString(date)
- listWeekDays(date?, locale?)
*/
