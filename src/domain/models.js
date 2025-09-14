import { now } from '../core/time.js';

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
  id:c.id, title:c.title||'', content:c.content||'', tags:Array.isArray(c.tags)?c.tags:[],
  ai:Array.isArray(c.ai)?c.ai:[], state:c.state||{deleted:false,updated_ts:now()}
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
  id:s.id, title:s.title||'', week:s.week||'', working:!!s.working,
  cards:Array.isArray(s.cards)?s.cards:[], state:s.state||{deleted:false,updated_ts:now()}
});

export function cardToMarkdown(c){
  const ai = (c.ai||[]).filter(a=>a.status==='ok').map(a=>`- (${a.component}) ${a.text}`).join('\n');
  return `# ${c.title||c.id}

${c.content||''}

## Sélections PARIA
${ai||'- (aucune sélection)'}
`;
}

export function cardToHTML(c){
  const md = cardToMarkdown(c)
    .replace(/^# (.*)$/m,'<h1>$1</h1>')
    .replace(/^## (.*)$/mg,'<h2>$1</h2>')
    .replace(/^- (.*)$/mg,'<li>$1</li>');
  return `<!doctype html><html><meta charset="utf-8"><body>${md.replace(/\n/g,'<br>')}</body></html>`;
}

/*
INDEX models.js:
- newCard(part)
- normalizeCard(c)
- newScenario(part)
- normalizeScenario(s)
- cardToMarkdown(c)
- cardToHTML(c)
*/
