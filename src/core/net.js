// src/core/net.js — helpers réseau centrals + tests non bloquants

import { settingsLoad } from './settings.js';

// --- base64 helpers
const b64e = (u8)=> btoa(String.fromCharCode(...u8));
//const b64d = (s)=> Uint8Array.from(atob(s), c => c.charCodeAt(0));

const b64d = (s) => {
  
   // base64url -> base64 + padding auto
   let t = String(s||'').trim().replace(/-/g,'+').replace(/_/g,'/').replace(/\s+/g,'');
   const pad = t.length % 4; if (pad) t += '===='.slice(pad);
   const bin = atob(t);
   const out = new Uint8Array(bin.length);
   for (let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
   return out;
};

export async function stateGet(workId){
  const { url, secret } = getGAS();
  if (!url || !secret) return { ok:false, status:0, detail:'incomplete' };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ route: 'load', work_id: workId, secret })
  });
  return r.ok ? await r.json() : { ok:false, status:r.status };
}

export async function stateSet(workId, payload){ // {tabs, rev, K_sess?, exp_s?}
  const { url, secret } = getGAS();
  if (!url || !secret) return { ok:false, status:0, detail:'incomplete' };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ route: 'save', work_id: workId, payload, secret })
  });
  return r.ok ? await r.json() : { ok:false, status:r.status };
}

export async function dataSet(workId, snapshot){ // {iv, ct, ver, ts}
  const { url, secret } = getGAS();
  if (!url || !secret) return { ok:false, status:0, detail:'incomplete' };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ route: 'save', work_id: workId, payload: snapshot, secret })
  });

  return r.ok ? r.json() : { ok:false, status:r.status };
}

export async function dataGet(workId, key = 'snapshot'){
  const { url, secret } = getGAS();
  if (!url || !secret) return { ok:false, status:0, detail:'incomplete' };
  // GET, pas de header custom → évite CORS + compat code.gs (route=load)
  const u = new URL(url);
  u.searchParams.set('route', 'load');
  u.searchParams.set('work_id', workId);
  u.searchParams.set('secret', secret);
  u.searchParams.set('key', key);   
  const r = await fetch(u.toString(), { method: 'GET' });
  return r.ok ? await r.json() : { ok:false, status:r.status };
}

// --- AES-GCM
export async function aesImportKeyRawB64(b64){
  const raw = b64d(b64);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt','decrypt']);
}

export async function aesEncryptJSON(key, obj){
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const pt  = new TextEncoder().encode(JSON.stringify(obj));
  const ct  = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, pt));
  return { iv: b64e(iv), ct: b64e(ct) };
}

export async function aesDecryptJSON(key, ctB64, ivB64){
  const iv = b64d(ivB64), ct = b64d(ctB64);
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}

// --- net.js ---
export const ghHeaders = (token)=>({
  'Accept':'application/vnd.github+json',
  ...(token?{Authorization:`token ${token}`}:{})
});

// === [PARIA][CRYPTO PIPELINE] HKDF + AES-GCM (v1) ===========================
const _te = new TextEncoder();
const _b64uDec = (s)=>{ s=String(s||'').replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0)); };
const _b64uEnc = (u)=>{ const bin=Array.from(u).map(b=>String.fromCharCode(b)).join(''); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };

export async function deriveViewKeyHKDF(kB64u, workId, sid){
  const kBytes = _b64uDec(kB64u || '');
  const base   = await crypto.subtle.importKey('raw', kBytes, 'HKDF', false, ['deriveKey']);
  const salt   = await crypto.subtle.digest('SHA-256', _te.encode(String(workId)));
  const info   = _te.encode('view:' + String(sid));
  return crypto.subtle.deriveKey(
    { name:'HKDF', hash:'SHA-256', salt: new Uint8Array(salt), info },
    base,
    { name:'AES-GCM', length: 256 },
    false,
    ['encrypt','decrypt']
  );
}

export async function encryptSnapshotV1(key, payload){
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const pt  = _te.encode(JSON.stringify(payload));
  const ctB = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv, tagLength:128}, key, pt));
  return { v:1, alg:'A256GCM', sid: payload?.sid || '', rev: payload?.rev|0 || 0, n: _b64uEnc(iv), ct: _b64uEnc(ctB) };
}
// =========================================================================== 

export const ghPath = (...xs)=> xs.map(s=>encodeURIComponent(String(s))).join('/');
export const ghContentsUrl = (owner,repo,branch,...segs)=>
  `https://api.github.com/repos/${owner}/${repo}/contents/${ghPath(...segs)}?ref=${encodeURIComponent(branch)}`;
// ↑ = "url3" unique. Supprimer les anciennes variables url/url2 dans le code.

// GAS settings
export function getGAS() {
  const s = settingsLoad() || {};
  const url    = (s.proxy_url || s.endpoints?.proxy?.url || '').trim();
  const secret = (s.proxy_secret || s.endpoints?.proxy?.secret || '').trim();
  return { url, secret };
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
    if (token) headers['Authorization'] = `token ${token}`;
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

// ---------------------------------------------------------------------------
// COMPATIBILITÉ (NE PAS SUPPRIMER) — Exports historiques attendus ailleurs
// Ces wrappers utilisent la conf actuelle et les helpers déjà présents.
// ---------------------------------------------------------------------------

/**
 * Appel générique GAS par route (POST text/plain). 
 * Retourne { ok, status, data } comme postPlain.
 */
export async function callGAS(route, payload = {}) {
  const { url, secret } = getGAS();
  if (!url || !secret) return { ok:false, status:0, detail:'incomplete', data:null };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'X-Proxy-Secret': secret },
      body: JSON.stringify({ route, ...payload })
    });
    const txt = await res.text();
    let data; try { data = JSON.parse(txt); } catch { data = { text: txt }; }
    return { ok: res.ok && (data?.ok !== false), status: res.status, data };
  } catch (e) {
    return { ok:false, status:0, data:{ error:String(e?.message||e) } };
  }
}

/**
 * Compat: chargement côté Google (alias historique).
 * Selon ton Apps Script, adapte la route si besoin ('load', 'gdrive_load', etc.).
 */
export async function loadFromGoogle(path) {
  return callGAS('load', { path });
}

/**
 * Compat: sauvegarde côté Google (alias historique).
 * Selon ton Apps Script, adapte la route si besoin ('save', 'gdrive_save', etc.).
 */
export async function saveToGoogle(a, b, c) {
  const payload = (arguments.length===1 && typeof a==='object') ? a : { path:a, content:b, meta:c };
  return callGAS('save', payload);
}

export async function saveToGit(payload) {
  const s = settingsLoad() || {};
  const owner  = (s.git_owner  || s.endpoints?.git?.owner  || '').trim();
  const repo   = (s.git_repo   || s.endpoints?.git?.repo   || '').trim();
  const branch = (s.git_branch || s.endpoints?.git?.branch || 'main').trim();
  const token  = (s.git_token  || s.endpoints?.git?.token  || '').trim();
  if (!owner || !repo || !token || !payload?.workId) return { ok:false, status:0, detail:'incomplete' };

  const [client, service, dateStr] = String(payload.workId).split('|');
  const pad = v => String(v).padStart(2,'0'); const t = new Date();
  const ms = String(t.getMilliseconds()).padStart(3,'0');            // <— AJOUT
  const stamp = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}_${pad(t.getHours())}-${pad(t.getMinutes())}-${pad(t.getSeconds())}-${ms}`; // <— MODIF (ajout -ms)
  const path  = `clients/${client}/${service}/${dateStr}/backup-${stamp}.json`;

  const jsonStr = JSON.stringify(payload, null, 2);
  const contentB64 = btoa(unescape(encodeURIComponent(jsonStr)));
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: `backup ${payload.workId} ${stamp}`, content: contentB64, branch })
  });
  const data = await res.json();
  return { ok: res.status===201 || res.status===200, status: res.status, data, path };
} 

export async function saveSnapshotToGit(workId, encSnapshot){
  
  // reprend le même canal que saveToGit (GitHub REST, PAT des réglages)
  const s = settingsLoad() || {};
  const owner  = (s.git_owner  || s.endpoints?.git?.owner  || '').trim();
  const repo   = (s.git_repo   || s.endpoints?.git?.repo   || '').trim();
  const branch = (s.git_branch || s.endpoints?.git?.branch || 'main').trim();
  const token  = (s.git_token  || s.endpoints?.git?.token  || '').trim();
  if (!owner || !repo || !token || !workId || !encSnapshot) return { ok:false, status:0, detail:'incomplete' };
  
  const path   = `clients/${workId.replace(/\|/g,'/')}/snapshot.json`;
   const url    = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `token ${token}`,   // même schéma que saveToGit (identique à Settings chez toi)
    'Content-Type': 'application/json'
  };
  
  // 1) récupérer le sha si le fichier existe (pour pouvoir l’écraser proprement)
  let sha = null;
  try {
    const headRes = await fetch(url, { method: 'GET', headers });
    if (headRes.status === 200) {
      const j = await headRes.json();
      sha = j?.sha || null;
    }
  } catch {}
  
  // 2) encoder le contenu (UTF-8 → base64)
  const jsonStr   = JSON.stringify(encSnapshot);
  const contentB64= btoa(unescape(encodeURIComponent(jsonStr)));

  // 3) PUT GitHub
  const body = { message: `snapshot ${workId}`, content: contentB64, branch };
  if (sha) body.sha = sha;  // écrase si déjà présent
  
  const res  = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(()=>null);
  return { ok: res.status===201 || res.status===200, status: res.status, data, path };
}

// -- [PARIA] COLLE CENTRALE : dérive -> chiffre -> écrit le snapshot (enveloppe v1)
export async function buildAndSaveSnapshot({
  workId,
  sid,
  rev = 0,
  kTokenB64u,
  tabs = {},
  cards = []
}) {
  // 1) dérivation HKDF depuis #k (base64url), avec le contrat workId/sid
  const key = await deriveViewKeyHKDF(kTokenB64u, workId, sid);

  // 2) clair -> enveloppe v1 (on inclut maintenant cards[])
  const enc = await encryptSnapshotV1(key, { sid, rev, tabs, cards });

  // 3) écriture Git (chemin canonicalisé à partir de workId)
  return await saveSnapshotToGit(workId, enc);
}

/** Session manifest (publish/load) */
export async function publishSession({ workId, sessionId, data }) {
  const s = settingsLoad() || {};
  const owner  = (s.git_owner  || s.endpoints?.git?.owner  || '').trim();
  const repo   = (s.git_repo   || s.endpoints?.git?.repo   || '').trim();
  const branch = (s.git_branch || s.endpoints?.git?.branch || 'main').trim();
  const token  = (s.git_token  || s.endpoints?.git?.token  || '').trim();
  if (!owner || !repo || !token || !workId || !sessionId) return { ok:false, status:0, detail:'incomplete' };

  const [client, service, dateStr] = String(workId).split('|');
  const path  = `clients/${client}/${service}/${dateStr}/sessions/${sessionId}.json`;

  const jsonStr   = JSON.stringify({ ...(data||{}), session_id: sessionId, work_id: workId }, null, 2);
  const contentB64= btoa(unescape(encodeURIComponent(jsonStr)));

  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(api, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: `session ${sessionId} @ ${workId}`, content: contentB64, branch })
  });
  const dataRes = await res.json();
  return { ok: res.status===201 || res.status===200, status: res.status, data: dataRes, path };
}

export async function loadSession({ workId, sessionId }) {
  const s = settingsLoad() || {};
  const owner  = (s.git_owner  || s.endpoints?.git?.owner  || '').trim();
  const repo   = (s.git_repo   || s.endpoints?.git?.repo   || '').trim();
  const token  = (s.git_token  || s.endpoints?.git?.token  || '').trim();
  if (!owner || !repo || !token || !workId || !sessionId) return { ok:false, status:0, detail:'incomplete' };

  const [client, service, dateStr] = String(workId).split('|');
  const path = `clients/${client}/${service}/${dateStr}/sessions/${sessionId}.json`;

  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=main`;
  const res = await fetch(api, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `token ${token}`
    }
  });
  if (res.status===404) return { ok:false, status:404 };
  const json = await res.json();
  const content = JSON.parse(decodeURIComponent(escape(atob(json.content || ''))));
  return { ok:true, status: res.status, data: content, path };
}


/**
 * Compat: alias JSON (certain code appelait postJson).
 */
export async function postJson(url, obj) {
  // même transport que postPlain mais avec JSON explicite si besoin
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(obj||{}) });
  const txt = await res.text();
  let data; try { data = JSON.parse(txt); } catch { data = { text: txt }; }
  return { ok: res.ok, status: res.status, data };
}






























