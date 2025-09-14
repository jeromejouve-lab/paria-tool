// src/core/llm.js — point d’entrée unique IA PARIA (pas de fallback heuristique)
import { getSettings } from './settings.js';
import { postLLM } from './net.js';

export async function generateParia({ title='', content='', tags=[], components=['P','A','R','I'] }){
  const { endpoints } = getSettings();
  if (!endpoints.llm) return []; // pas d’endpoint => pas de génération
  const out = await postLLM(endpoints.llm, { mode:'paria', title, content, tags, components });
  return Array.isArray(out) ? out.filter(x=>x && x.text) : [];
}

/*
INDEX llm.js:
- generateParia({title,content,tags,components})
*/
