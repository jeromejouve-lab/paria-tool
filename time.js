export const toISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s||'') ? s : '';
export function combineAt(dateISO, hhmm){
  if (!toISODate(dateISO)) return dateISO;
  const t = (hhmm||'').trim();
  if (!t) return dateISO;
  const m = /^(\d{2}):(\d{2})$/.exec(t); if (!m) return dateISO;
  return `${dateISO}T${m[1]}:${m[2]}`;
}
export function startOfISOWeek(d=new Date()){
  const t = new Date(d); const day = (t.getDay()+6)%7; // 0=lundi
  t.setDate(t.getDate()-day); t.setHours(0,0,0,0); return t;
}
export function addWeeks(d, n){
  const t = new Date(d); t.setDate(t.getDate()+n*7); return t;
}
export function isoWeekString(d=new Date()){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((t - yearStart)/86400000) + 1)/7);
  const yyyy = t.getUTCFullYear();
  const ww = String(weekNo).padStart(2,'0');
  return `${yyyy}-W${ww}`;
}
export function listWeekDays(d=new Date()){
  const start = startOfISOWeek(d); const out=[];
  for(let i=0;i<7;i++){
    const t=new Date(start); t.setDate(start.getDate()+i);
    const iso = t.toISOString().slice(0,10);
    out.push({ date: iso, label: t.toLocaleDateString(undefined,{weekday:'short', day:'2-digit'}) });
  }
  return out;
}
