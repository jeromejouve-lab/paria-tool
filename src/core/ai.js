// src/core/ai.js — IA centrale normalisée
import { settingsLoad, buildWorkId } from './settings.js';
import { getCharter, saveCharter } from '../domain/reducers.js';

// ----------------- helpers contexte -----------------
const uid = () => 'p-' + Math.random().toString(36).slice(2) + Date.now();

function loadClientProfile(clientId){
  try { return JSON.parse(localStorage.getItem(`paria.client.${clientId}.profile`) || '{}'); }
  catch { return {}; }
}

function workCtx(){
  try{
    const s = settingsLoad() || {};
    return { client: (s.client||'').trim(), service: (s.service||'').trim() };
  }catch{ return { client:'', service:'' }; }
}

function serviceFromCharter(){
  try{
    const ch = getCharter() || {};
    return {
      title: ch.title || '',
      content: ch.content || '',
      tags: Array.isArray(ch.tags) ? ch.tags : (ch.tags ? String(ch.tags).split(',').map(s=>s.trim()).filter(Boolean) : [])
    };
  }catch{ return { title:'', content:'', tags:[] }; }
}

function composePromptFallback({ client, service }){
  const csv = a => (a||[]).join(', ') || '—';
  const clientLine = [
    `Client: ${client.id || 'n/d'}`,
    `Secteur: ${client.industry || 'n/d'} | Effectif: ${client.headcount ?? 'n/d'}`,
    `Objectifs: ${csv(client.goals)}`,
    `Enjeux: ${csv(client.challenges)}`,
    `Contraintes: ${csv(client.constraints)}`,
    `Ton: ${client.tone || 'pragmatique, orienté ROI'}`
  ].join('\n');

  const serviceLine = [
    `Service: ${service.id || 'n/d'}`,
    `Titre: ${service.title || 'n/d'}`,
    `Tags: ${csv(service.tags)}`
  ].join('\n');

  return [
    '# CONTEXTE ENTREPRISE', clientLine,
    '',
    '# CONTEXTE SERVICE', serviceLine,
    '',
    '# CHARTE (contenu)', service.content || '—',
    '',
    '# CONSIGNES',
    '- Réponds en français, concis et chiffré quand pertinent.',
    '- Donne des alternatives et des next steps actionnables.'
  ].join('\n');
}

// ----------------- helpers proxy -----------------
function getProxy(){
  const s = settingsLoad() || {};
  const url = (s.proxy_url || '').trim();
  const secret = (s.proxy_secret || '').trim();
  return { url, secret };
}

async function callAIProxy({ work_id, task }){
  const { url, secret } = getProxy();
  if (!url || !secret) return { status: 'needs_config', results: [], error: 'missing proxy', http: 0 };

  const payload = { route: 'ai', work_id, task, secret }; // secret aussi en body si ton GAS le lit côté body
  let res, data, text;
  try{
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'X-Proxy-Secret': secret },
      body: JSON.stringify(payload)
    });
    text = await res.text();
    try { data = JSON.parse(text); } catch { data = { text }; }
  }catch(e){
    return { status: 'error', results: [], error: String(e.message||e), http: 0 };
  }
  return { http: res.status, data };
}

// Découpe un texte en items à partir de listes (puces et listes numérotées)
function segmentByBullets(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);

  // Puces : -, *, •, —, – ; Numérotées : 1. 2) etc.
  const bulletRe = /^\s*(?:[-*•—–]|(?:\d+[\.\)]))\s+/;

  const chunks = [];
  let cur = [];

  const pushCur = () => {
    const block = cur.join('\n').trim();
    if (!block) return;
    // titre = première ligne (sans puce), summary = 180c
    const firstLine = block.split(/\r?\n/)[0];
    const title = firstLine.replace(bulletRe, '').trim().slice(0, 120) || 'Proposition';
    const summary = block.length > 180 ? block.slice(0, 180) + '…' : block;
    chunks.push({
      id: 'p-' + Math.random().toString(36).slice(2) + Date.now(),
      title,
      summary,
      content: block,
      state: { selected: false }
    });
    cur = [];
  };

  for (const ln of lines) {
    if (bulletRe.test(ln)) {
      // nouvelle puce → flush le bloc précédent
      if (cur.length) pushCur();
      cur.push(ln.replace(bulletRe, '').trim());
    } else {
      // continuation du bloc courant
      if (!cur.length && ln.trim()==='') continue;
      cur.push(ln);
    }
  }
  if (cur.length) pushCur();

  // si 1 seul item ET pas de vraie puce détectée, renvoie vide (laisse fallback mono-texte)
  const hadBullets = lines.some(l => bulletRe.test(l));
  return hadBullets ? chunks : [];
}

// ----------------- normalisation réponse -----------------
function normalizeAIResponse(resp){
  const d = resp?.data ?? resp ?? {};

  // backend déjà normalisé
  if (typeof d.status === 'string' && Array.isArray(d.results)) {
    const st = d.results.length ? 'ok' : (d.status === 'empty' ? 'empty' : d.status);
    return { status: st, results: d.results, error: d.error, http: resp.http||0 };
  }

  // formats texte courants (OpenAI / proxys)
  const text =
    (d.output_text || d.result || d.content || d.text ||
     d?.choices?.[0]?.message?.content || d?.choices?.[0]?.text || '')
    ?.trim();

  // Si on a du texte : tente une segmentation en puces
  if (text) {
    const seg = segmentByBullets(text);
    if (seg.length > 1) {
      return { status: 'ok', results: seg, http: resp.http||0 };
    }
  }

  if (text) {
    const sum = text.length > 180 ? text.slice(0,180) + '…' : text;
    return {
      status: 'ok',
      results: [{ id: uid(), title: 'Proposition', summary: sum, content: text, state: { selected: false } }],
      http: resp.http||0
    };
  }

  // codes config / erreurs
  if (resp?.status === 'needs_config') return { status:'needs_config', results: [], http: resp.http||0 };
  if (resp?.status === 'error') return { status:'error', results: [], error: resp.error, http: resp.http||0 };

  return { status: 'empty', results: [], http: resp.http||0 };
}

// Applique des résultats IA dans le store selon le sujet
export function applyAIResults(subject, items, { mode = 'replace' } = {}) {
  const kind = subject?.kind;
  if (kind === 'charter') {
    const ch = getCharter() || {};
    const existing = Array.isArray(ch.ai) ? ch.ai : [];
    const now = Date.now();

    const normItems = (items || []).map(p => ({
      id: p.id || ('p-' + Math.random().toString(36).slice(2) + now),
      title: p.title || 'Proposition',
      summary: p.summary || (p.content ? (p.content.length > 180 ? p.content.slice(0,180)+'…' : p.content) : ''),
      content: p.content || '',
      state: { selected: !!(p.state?.selected), think: !!(p.state?.think), deleted: !!(p.state?.deleted) },
      created_ts: p.created_ts || now,
      updated_ts: now
    }));

    const merged = mode === 'append' ? (existing.concat(normItems)) : normItems;
    saveCharter({ ai: merged });
    return { ok: true, count: merged.length };
  }

  return { ok: false, error: 'unsupported_subject' };
}

// ----------------- export central -----------------
export async function askAI(task = {}){
  // 1) Contexte commun
  const { client: clientId, service: serviceId } = workCtx();
  const client = { id: clientId, ...loadClientProfile(clientId) };
  const svc = { id: serviceId, ...serviceFromCharter() };

  // 2) Task fusionnée avec contexte
  const mergedTask = {
    ...task,
    context: { client, service: svc, ...(task.context || {}) }
  };

  // 3) Si rien n’est fourni (pas de prompt / query / messages), on compose un fallback
  if (!mergedTask.prompt && !mergedTask.query && !mergedTask.messages) {
    mergedTask.prompt = composePromptFallback({ client, service: svc });
  }

  // 4) Appel proxy
  const work_id = buildWorkId();
  const resp = await callAIProxy({ work_id, task: mergedTask });

  // 5) Normalisation unique
  const norm = normalizeAIResponse(resp);

  // 6) Statuts HTTP -> statuts logiques (optionnel)
  if (norm.status === 'empty' && resp.http >= 400) {
    return { status: 'error', results: [], error: `HTTP ${resp.http}`, http: resp.http };
  }
  return norm; // {status, results[], error?}
}
