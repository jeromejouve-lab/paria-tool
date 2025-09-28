// src/core/settings.js — lecture-only au boot, save explicite, helpers + Local%

const KEY_CONN = 'paria.conn.v1';
export const LOCAL_BUDGET_BYTES = 5 * 1024 * 1024; // 5 MiB

// --- merge qui n'écrase pas avec du vide ('', null, undefined) ---
function mergeSafe(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== 'object' || typeof patch !== 'object') {
    if (typeof patch === 'string' && patch.trim() === '') return base;
    return patch;
  }
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === '' || v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      out[k] = mergeSafe(base?.[k] || {}, v);
      if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) && Object.keys(out[k]).length === 0 && base?.[k]) {
        out[k] = base[k];
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

// --- LECTURE PURE : NE JAMAIS ÉCRIRE ICI ---
export function settingsLoad() {
  const raw = localStorage.getItem(KEY_CONN);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// alias demandés par l'existant
export const settings = settingsLoad;
export const getSettings = settingsLoad;

// --- ÉCRITURE SÉCURISÉE : MERGE + IGNORE LES VIDES ---
export function settingsSave(patch) {
  const cur = settingsLoad();
  const next = mergeSafe(cur, patch || {});
  localStorage.setItem(KEY_CONN, JSON.stringify(next));
  // MAJ badge local% si présent
  try { updateLocalUsageBadge(); } catch {}
  return next;
}

// alias demandés
export const saveSettings = settingsSave;

// --- Accès / mise à jour proxy ---
export function getProxyConfig() {
  const s = settingsLoad();
  return s?.endpoints?.proxy || s?.proxy || {};
}
export function setProxyConfig(cfg) {
  return settingsSave({ endpoints: { proxy: cfg || {} } });
}

// --- Contexte de travail (client/service) ---
export function setWorkContext({ client, service } = {}) {
  const patch = {};
  if (client !== undefined) patch.client = client;
  if (service !== undefined) patch.service = service;
  return settingsSave(patch);
}

// --- WorkId attendu par GAS : client|service|YYYY-MM-DD ---
export function buildWorkId() {
  const s = settingsLoad();
  const d = new Date();
  const pad = v => String(v).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const c = (s.client || '').trim();
  const srv = (s.service || '').trim();
  return `${c}|${srv}|${day}`;
}
export const getWorkId = buildWorkId;
export const currentWorkId = buildWorkId;

// --- Local % (lecture seule) ---
export function measureLocalUsage() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('paria.'));
    let used = 0;
    for (const k of keys) {
      const v = localStorage.getItem(k);
      used += new Blob([v || '']).size;
    }
    const pct = Math.round((used / LOCAL_BUDGET_BYTES) * 100);
    return { used, budget: LOCAL_BUDGET_BYTES, pct, keys: keys.length };
  } catch {
    return { used: 0, budget: LOCAL_BUDGET_BYTES, pct: 0, keys: 0, unknown: true };
  }
}

export function updateLocalUsageBadge() {
  const b = document.querySelector('#local-usage, [data-badge="local-usage"]');
  if (!b) return; // pas de placeholder = no-op
  const { used, budget, pct, keys, unknown } = measureLocalUsage();
  if (unknown) {
    b.textContent = 'Local —';
    b.title = 'Taille locale inconnue';
    b.classList.remove('ok','warn','alert','crit');
    return;
  }
  b.textContent = `Local ${pct}%`;
  b.title = `${(used/1048576).toFixed(1)} / ${(budget/1048576).toFixed(1)} MiB · ${keys} clés`;
  b.classList.remove('ok','warn','alert','crit');
  if (pct <= 45) b.classList.add('ok');
  else if (pct <= 70) b.classList.add('warn');
  else if (pct <= 90) b.classList.add('alert');
  else b.classList.add('crit');
}
