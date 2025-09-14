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

/*
INDEX models.js:
- now()
- newCard(part)
- normalizeCard(c)
- newScenario(part)
- normalizeScenario(s)
*/
