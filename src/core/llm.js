import { getSettings } from './settings.js';

// Point d'entrée unique — utilisé par Cards / Charter / Scénario / Séance
export async function generateParia({ title='', content='', tags=[], components=['P','A','R','I'] }){
  const { endpoints } = getSettings();
  if (endpoints.llm){
    const res = await fetch(endpoints.llm, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'paria', title, content, tags, components })
    });
    if (!res.ok) throw new Error('LLM endpoint error '+res.status);
    const out = await res.json();
    if (Array.isArray(out) && out.every(x=>x && x.text)) return out;
  }
  // si aucun endpoint défini : renvoyer un squelette vide (pas d’heuristique)
  return components.map(c => ({ component:c, text:'', kind:'paria', origin:'gpt' }));
}

/*
INDEX llm.js:
- generateParia({title,content,tags,components})
*/
