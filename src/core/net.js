// src/core/net.js — helpers réseau centrals + tests non bloquants

import { settingsLoad } from './settings.js';

// GAS settings
export function getGAS() {
  const s = settingsLoad();
  const url = s?.endpoints?.proxy?.url || s?.proxy?.url || '';
  const secret = s?.endpoints?.proxy?.secret || s?.proxy?.secret || s?.endpoints?.proxy?.token || s?.proxy?.token || '';
  return { url: (url||'').trim(), secret: (secret||'').trim() };
}

// POST text/plain (évite preflight)
export async function postPlain(url, obj) {
  const body = JSON.stringify(obj || {});
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { text: txt }; }
  return { ok: res.ok, status: res.status, data };
}

// Diag proxy (GAS ?route=diag)
export async function diag() {
  const { url, secret } = getGAS();
  if (!url || !secret) return { ok:false, status:0, detail:'incomplete', data:null };
  try {
    const u = new URL(url); u.searchParams.set('route', 'diag'); u.searchParams.set('secret', secret);
    const r = await fetch(u.toString(), { method: 'GET' });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = { text: txt }; }
    return { ok: r.ok && (data?.ok !== false), status: r.status, detail: r.ok ? 'pong' : 'http_'+r.status, data };
  } catch (e) {
    return { ok:false, status:0, detail:String(e?.message||e), data:null };
  }
}

// Test GitHub (léger) — accepte URL type https://github.com/owner/repo(.git)
export async function testGit() {
  const s = settingsLoad();
  const url = (s?.endpoints?.git?.url || s?.git?.url || '').trim();
  const token = (s?.endpoints?.git?.token || s?.git?.token || '').trim();
  if (!url) return { ok:false, status:0, detail:'incomplete' };

  // parse owner/repo
  try {
    const m = url.match(/github\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?/i);
    if (!m) return { ok:false, status:0, detail:'bad_url' };
    const owner = m[1], repo = m[2];
    const api = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const r = await fetch(api, { headers });
    const ok = r.ok;
    return { ok, status: r.status, detail: ok ? 'repo_ok' : 'http_'+r.status };
  } catch (e) {
    return { ok:false, status:0, detail:String(e?.message||e) };
  }
}

// --- compat: bootstrapWorkspace (utilisé par reducers.js) ---
export async function bootstrapWorkspace() {
  // lecture conf courante
  const s = settingsLoad();
  const status = { proxy:false, git:false };

  // test proxy si complet
  try {
    const { url, secret } = getGAS();
    if (url && secret) {
      const r = await diag();
      status.proxy = !!r?.ok;
    }
  } catch {}

  // test git si URL présente
  try {
    const r2 = await testGit();
    status.git = !!r2?.ok;
  } catch {}

  // contrat: retourne au moins settings + status
  return { settings: s, status };
}


