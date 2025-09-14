// src/domain/models.js
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

/**
 * Exporte une card en Markdown.
 * - Titre H1
 * - Contenu brut
 * - Liste des propositions IA sélectionnées (status 'ok' ou selected=true)
 */
export function cardToMarkdown(card){
  const c = normalizeCard(card||{});
  const selected = (c.ai||[]).filter(a => a?.status === 'ok' || a?.selected);
  const aiBlock = selected.length
    ? selected.map(a=>`- (${a.component||'P'}) ${a.text||''}`).join('\n')
    : '- (aucune sélection)';
  return `# ${c.title || c.id || 'Card'}

${c.content || ''}

## Sélections PARIA
${aiBlock}
`;
}

/**
 * Exporte une card en HTML très simple (pas de dépendance externe).
 * Conversion minimale depuis le Markdown généré par cardToMarkdown.
 */
export function cardToHTML(card){
  const md = cardToMarkdown(card);
  const html = md
    .replace(/^# (.*)$/m, '<h1>$1</h1>')
    .replace(/^## (.*)$/mg, '<h2>$1</h2>')
    .replace(/^- (.*)$/mg, '<li>$1</li>')
    .replace(/\n{2,}/g, '\n\n')
    .split('\n')
    .map(line=>{
      if (line.startsWith('<h1>') || line.startsWith('<h2>') || line.startsWith('<li>')) return line;
      if (!line.trim()) return '<br>';
      return `<p>${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
    })
    .join('\n')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>'); // regroupe la liste simple

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Export Card</title></head>
<body>${html}</body></html>`;
}

/*
INDEX models.js:
- now()
- newCard(part)
- normalizeCard(c)
- newScenario(part)
- normalizeScenario(s)
- cardToMarkdown(card)
- cardToHTML(card)
*/
