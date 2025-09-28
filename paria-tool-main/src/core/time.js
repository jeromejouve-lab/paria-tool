// src/core/time.js — SUPERCET compatible UI + domaine

// Base
export const now = () => Date.now();
export const ts  = (n) => new Date(n ?? Date.now()).toLocaleString('fr-FR');

// Composeurs date/heure (Réglages)
export function toISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s||'') ? s : ''; }
// combineAt('YYYY-MM-DD','HH:mm') -> 'YYYY-MM-DDTHH:mm'
export function combineAt(dateISO, hhmm){
  const d = toISODate(dateISO); if(!d) return dateISO;
  const t = (hhmm||'').trim();  if(!t) return d;
  const m = /^(\d{2}):(\d{2})$/.exec(t); if(!m) return d;
  return `${d}T${m[1]}:${m[2]}`;
}

// Jours / Semaines
export function addDays(date, days=0){ const base=(date instanceof Date)?new Date(date):new Date(date??Date.now()); base.setDate(base.getDate()+days); return base; }
export function addWeeks(date, weeks=0){ return addDays(date, weeks*7); }
export const addISOWeeks = addWeeks; // alias

// Semaine ISO (lundi = début)
export function startOfWeek(date){ const d=(date instanceof Date)?new Date(date):new Date(date??Date.now()); const day=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d; }
export function endOfWeek(date){ const d=startOfWeek(date); d.setDate(d.getDate()+6); d.setHours(23,59,59,999); return d; }
export const startOfISOWeek = startOfWeek; // alias
export const endOfISOWeek   = endOfWeek;   // alias

// ISO week parts / id
function isoWeekParts(date){
  const src=(date instanceof Date)?new Date(date):new Date(date??Date.now());
  const d=new Date(Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()));
  const dayNum=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-dayNum);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo=Math.ceil((((d-yearStart)/86400000)+1)/7);
  return { year:d.getUTCFullYear(), week:weekNo };
}
export function weekId(date=new Date()){ const {year,week}=isoWeekParts(new Date(date)); return `${year}-W${String(week).padStart(2,'0')}`; }
export const isoWeekString = weekId;
export function isoWeekNumber(date=new Date()){ return isoWeekParts(new Date(date)).week; }
export function isoWeekYear(date=new Date()){ return isoWeekParts(new Date(date)).year; }
export const getISOWeek = isoWeekNumber;
export const getISOWeekYear = isoWeekYear;

// Formats
export function formatISODate(date=new Date()){ const d=(date instanceof Date)?date:new Date(date); return d.toISOString().slice(0,10); }

// Semaine → 7 jours (lun..dim)
export function listWeekDays(date=new Date(), locale='fr-FR'){
  const start=startOfWeek(date), out=[];
  for(let i=0;i<7;i++){
    const d=addDays(start,i);
    out.push({ date:d, iso:formatISODate(d), label:d.toLocaleDateString(locale,{weekday:'short', day:'2-digit'}), index:i, dow:i+1, week:weekId(d) });
  }
  return out;
}

// Helpers pratiques
export function thisMonday(date=new Date()){ return startOfWeek(date); }
export function nextMonday(date=new Date()){ return startOfWeek(addWeeks(date,1)); }
export function prevMonday(date=new Date()){ return startOfWeek(addWeeks(date,-1)); }

/*
INDEX time.js:
- now, ts, toISODate, combineAt
- addDays, addWeeks, addISOWeeks
- startOfWeek, endOfWeek, startOfISOWeek, endOfISOWeek
- weekId, isoWeekString, isoWeekNumber, isoWeekYear, getISOWeek, getISOWeekYear
- formatISODate, listWeekDays, thisMonday, nextMonday, prevMonday
*/
