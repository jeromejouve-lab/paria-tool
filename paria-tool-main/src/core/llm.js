// src/core/llm.js — point d’entrée IA PARIA
import { postLLM } from './net.js';

export async function generateParia({ title='', content='', tags=[], components=['P','A','R','I'] }){
  const { ok, data } = await postLLM({ mode:'paria', title, content, tags, components });
  if (!ok) return [];
  return Array.isArray(data) ? data.filter(x=>x && x.text) : [];
}

/*
INDEX llm.js:
- generateParia({title,content,tags,components})
*/
