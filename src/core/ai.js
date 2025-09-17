// src/core/ai.js — IA centrale normalisée
import { settingsLoad, buildWorkId } from './settings.js';
import { getCharter } from '../domain/reducers.js';

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
