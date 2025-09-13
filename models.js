// src/domain/models.js
export function uid(prefix='id'){
  return `${prefix}_${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-4)}`;
}

export function newCard(part={}){
  const now = Date.now();
  return {
    id: part.id || uid('card'),
    title: part.title || 'Sans titre',
    content: part.content || '',
    props: { client: part.props?.client || {}, tags: part.props?.tags || [] },
    ai: Array.isArray(part.ai)? part.ai.slice() : [],
    comments: Array.isArray(part.comments)? part.comments.slice() : [],
    state:{ deleted:false, deleted_at:0, deleted_by:'', updated_ts: now }
  };
}

export function normalizeCard(c){
  if (!c || typeof c!=='object') return newCard();
  return {
    id: c.id || uid('card'),
    title: c.title || 'Sans titre',
    content: c.content || '',
    props: { client: c.props?.client || {}, tags: Array.isArray(c.props?.tags)? c.props.tags : [] },
    ai: Array.isArray(c.ai)? c.ai.map(x=>normalizeAI(x)) : [],
    comments: Array.isArray(c.comments)? c.comments.map(x=>normalizeComment(x)) : [],
    state: {
      deleted: !!c.state?.deleted,
      deleted_at: c.state?.deleted_at||0,
      deleted_by: c.state?.deleted_by||'',
      updated_ts: c.state?.updated_ts||Date.now()
    }
  };
}

export function normalizeAI(a){
  return {
    id: a?.id || uid('ai'),
    kind: a?.kind || 'note',
    status: a?.status || 'todo', // todo|ok|hold|drop
    origin: a?.origin || 'manual', // manual|gpt|client|seniar
    text: a?.text || '',
    ts: a?.ts || Date.now(),
    selected: !!a?.selected
  };
}

export function normalizeComment(c){
  return {
    id: c?.id || uid('c'),
    text: c?.text || '',
    author: c?.author || 'me',
    ts: c?.ts || Date.now()
  };
}

export function cardToMarkdown(card){
  const tags = (card.props?.tags||[]).map(t=>`#${t}`).join(' ');
  const client = card.props?.client ? `\n\n> Client: \`${JSON.stringify(card.props.client)}\`` : '';
  return `# ${card.title}\n\n${card.content}\n\n${tags}${client}\n`;
}

export function cardToHTML(card){
  const esc = s=>String(s).replace(/[&<>]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  const tags = (card.props?.tags||[]).map(t=>`<span>#${esc(t)}</span>`).join(' ');
  return `<!doctype html><meta charset="utf-8">
  <title>${esc(card.title)}</title>
  <article><h1>${esc(card.title)}</h1><div>${esc(card.content).replace(/\n/g,'<br>')}</div>
  <footer>${tags}</footer></article>`;
}
export function newScenario(part={}){
  const now = Date.now();
  return {
    id: part.id || uid('sc'),
    title: part.title || 'Scénario',
    week: part.week || '',            // "YYYY-Www"
    items: Array.isArray(part.items)? part.items : [], // [{card_id, slot:'YYYY-MM-DDTHH:mm'|''}]
    working: !!part.working,
    state:{ deleted:false, updated_ts: now }
  };
}
export function normalizeScenario(s){
  if (!s || typeof s!=='object') return newScenario();
  return {
    id: s.id || uid('sc'),
    title: s.title || 'Scénario',
    week: s.week || '',
    items: Array.isArray(s.items)? s.items.map(it=>({ card_id: it.card_id, slot: it.slot||'' })) : [],
    working: !!s.working,
    state:{ deleted: !!s.state?.deleted, updated_ts: s.state?.updated_ts||Date.now() }
  };
}
