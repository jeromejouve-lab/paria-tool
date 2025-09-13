export function normalizeState(s){
  const o = s && typeof s==='object' ? s : {};
  o.charter   = o.charter   || {};
  o.items     = Array.isArray(o.items)     ? o.items     : [];
  o.scenarios = Array.isArray(o.scenarios) ? o.scenarios : [];
  o.decisions = Array.isArray(o.decisions) ? o.decisions : [];
  o.meta = { ...(o.meta||{}), updated_ts: Date.now(), rev: (o.meta?.rev||0) };
  return o;
}
