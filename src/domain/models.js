// src/domain/models.js — modèles + exports client (MD/HTML) intégrant Charter/branding
import { getSettings } from '../core/settings.js';
import { readClientBlob } from '../core/store.js';

export const now = ()=> Date.now();

export function newCard(part={}){
  return {
    id: part.id || `c_${now()}`,
    title: part.title || 'Nouvelle card',
    content: part.content || '',
    tags: Array.isArray(part.tags)?part.tags:[],
    ai: [],
    state: { deleted:false, updated_ts: now() }
  };
}

export const normalizeCard = c => ({
  id:c?.id,
  title:c?.title || '',
  content:c?.content || '',
  tags:Array.isArray(c?.tags)?c.tags:[],
  ai:Array.isArray(c?.ai)?c.ai:[],
  state:c?.state || { deleted:false, updated_ts: now() }
});

export function newScenario(part={}){
  return {
    id: part.id || `sc_${now()}`,
    title: part.title || 'Nouveau scénario',
    week: part.week || '',
    working: !!part.working,
    cards: Array.isArray(part.cards)?part.cards:[],
    state: { deleted:false, updated_ts: now() }
  };
}

export const normalizeScenario = s => ({
  id:s?.id,
  title:s?.title || '',
  week:s?.week || '',
  working:!!s?.working,
  cards:Array.isArray(s?.cards)?s.cards:[],
  state:s?.state || { deleted:false, updated_ts: now() }
});

// -------- Exports client (intègrent Charter + branding) --------
function selectedAIList(c){
  return (c.ai||[]).filter(a => a?.status === 'ok' || a?.selected)
                   .map(a=>`- (${a.component||'P'}) ${a.text||''}`).join('\n') || '- (aucune sélection)';
}

export function cardToMarkdown(card){
  const c = normalizeCard(card||{});
  const s = getSettings();
  const blob = readClientBlob();
  const charter = blob.charter || { title:'', content:'', tags:[] };

  return `---
client: ${s.client}
service: ${s.service}
auteur: ${s.branding.my_name||''}
logo: ${s.branding.my_logo_url||''}
adresse: ${s.branding.my_address||''}
date: ${new Date().toLocaleString()}
---

# ${c.title || c.id || 'Card'}

${c.content || ''}

## Sélections PARIA
${selectedAIList(c)}

---

## Rappel — Charter du service
**${charter.title||''}**

${charter.content||''}
`;
}

export function cardToHTML(card){
  // conversion minimaliste depuis le MD ci-dessus (pour rester UI-agnostique)
  const md = cardToMarkdown(card);
  const html = md
    .replace(/^---[\s\S]*?---\s*/,'') // supprime le front-matter du rendu HTML
    .replace(/^# (.*)$/m, '<h1>$1</h1>')
    .replace(/^## (.*)$/mg, '<h2>$1</h2>')
    .replace(/^\*\*(.*)\*\*$/mg, '<strong>$1</strong>')
    .replace(/^- (.*)$/mg, '<li>$1</li>')
    .split('\n').map(line=>{
      if (!line.trim()) return '<br>';
      if (line.startsWith('<h1>')||line.startsWith('<h2>')||line.startsWith('<li>')) return line;
      return `<p>${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
    }).join('\n')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  const s = getSettings();
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${(card?.title||'Card')} — ${s.client}/${s.service}</title></head>
<body>${html}</body></html>`;
}

/*
INDEX models.js:
- now()
- newCard(part), normalizeCard(c)
- newScenario(part), normalizeScenario(s)
- cardToMarkdown(card), cardToHTML(card)
*/
