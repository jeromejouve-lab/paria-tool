import { getSettings } from './settings.js';

// Point d’entrée IA unique (PARIA) — utilisé par Cards / Charter / Scénario / Projecteur.
// On ne force AUCUN fallback heuristique pour respecter ta demande.
export async function generateParia({ title='', content='', tags=[], components=['P','A','R','I'] }){
  const { endpoints } = getSettings();
  if (!endpoints.llm) return []; // pas d'endpoint => pas de génération

  const res = await fetch(endpoints.llm, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ mode:'paria', title, content, tags, components })
  });
  if (!res.ok) throw new Error('LLM endpoint error '+res.status);

  const out = await res.json();
  // Format attendu par la logique UI : [{component,text,kind:'paria',origin:'gpt'}]
  return Array.isArray(out) ? out.filter(x=>x && x.text) : [];
}

/*
INDEX llm.js:
- generateParia({title,content,tags,components})
*/
