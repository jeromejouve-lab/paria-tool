/* core/restore.js */
/* DEPENDS: window.callGAS, window.bootstrapWorkspace (compat), optional window.logJournal */
/* Expose: window.PARIA.restore */

(function (w){
  const ns = w.PARIA = w.PARIA || {};
  const R = ns.restore = ns.restore || {};

  // --- Journal helper (no-throw)
  function jlog(type, data){
    try { w.logJournal ? w.logJournal(type, data) : console.log('[journal]', type, data); }
    catch(e){ console.warn('journal failed', e); }
  }

  // --- (1) Proposer (git_find)
  R.proposeSnapshots = async function(work_id, atIso){
    const payload = { work_id, at: atIso || null };
    const res = await w.callGAS('git_find', payload);
    if (!res || !res.ok) throw new Error('git_find failed');
    const items = Array.isArray(res.items) ? res.items : [];
    // Normalise et trie ascendant par date
    items.sort((a,b)=> new Date(a.at) - new Date(b.at));
    return items;
  };

  // --- (2) Sélection “à l’instant T”
  R.pickAt = function(items, atIso){
    if (!items?.length) return null;
    const t = new Date(atIso || items[items.length-1]?.at || Date.now()).getTime();
    const after = items.find(x => new Date(x.at).getTime() >= t);
    return after || items[items.length-1] || null;
  };

  // --- (3) Charger snapshot (git_load)
  R.loadSnapshot = async function(work_id, candidate){
    if (!candidate?.path) throw new Error('candidate.path required');
    const res = await w.callGAS('git_load', { work_id, path: candidate.path });
    if (!res || !res.ok) throw new Error('git_load failed');
    return res; // attendu: { ok:true, content:{...}, meta:{...} }
  };

  // --- Sauvegarde locale (pour rollback)
  R.backupLocal = function(prefix='paria'){
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    const bak = keys.reduce((acc,k)=>(acc[k]=localStorage.getItem(k),acc),{});
    const stamp = new Date().toISOString();
    localStorage.setItem(`${prefix}.__backup__`, JSON.stringify({ stamp, bak }));
    return { stamp, keys: Object.keys(bak) };
  };

  // --- (4) Appliquer restauration (replace|merge)
  R.applySnapshot = function(snap, opts){
    const { mode='replace', prefix='paria' } = opts || {};
    const content = snap?.content?.local ?? snap?.content?.state ?? snap?.content;
    if (!content || typeof content !== 'object'){
      throw new Error('snapshot content empty or invalid');
    }
    // Remplacement éventuel : supprime l’état local du namespace
    if (mode === 'replace'){
      for (const k of Object.keys(localStorage)){
        if (k.startsWith(prefix) && !k.endsWith('.__backup__')) localStorage.removeItem(k);
      }
    }
    // Ecrit les paires clé→valeur du snapshot
    for (const [k,v] of Object.entries(content)){
      const key = k.startsWith(prefix) ? k : `${prefix}.${k}`;
      const val = (typeof v === 'string') ? v : JSON.stringify(v);
      localStorage.setItem(key, val);
    }
  };

  // --- (5) Restaurer snapshot complet (end-to-end)
  R.restoreSnapshotCandidate = async function({ work_id, candidate, mode='replace' }){
    jlog('restore_started', { work_id, mode, candidate });
    const bak = R.backupLocal();
    try{
      const snap = await R.loadSnapshot(work_id, candidate);
      R.applySnapshot(snap, { mode });
      jlog('restore_done', { work_id, mode, candidate, backup_stamp: bak.stamp, meta: snap.meta || null });
      // Refresh UI sans casser la règle PAGES (appel onglets au mount)
      if (typeof w.bootstrapWorkspace === 'function'){
        try { await w.bootstrapWorkspace(); } catch (_){}
      }
      // Reload léger si UI ne se remonte pas seule
      setTimeout(()=> location.reload(), 120);
    }catch(err){
      jlog('restore_failed', { work_id, mode, candidate, error: String(err) });
      throw err;
    }
  };

  // --- (6) Restauration granulaire (depuis Journal)
  // Convention: entry.localPatch = { "<key>": <value|string|object>, ... } (namespacé ou non)
  R.restoreElement = function(entry, opts){
    const { prefix='paria' } = opts || {};
    if (!entry || typeof entry !== 'object') throw new Error('invalid entry');
    const patch = entry.localPatch || entry.patch || null;
    if (!patch || typeof patch !== 'object') throw new Error('entry has no localPatch');
    const bak = R.backupLocal(prefix);
    try{
      for (const [k,v] of Object.entries(patch)){
        const key = k.startsWith(prefix) ? k : `${prefix}.${k}`;
        const val = (typeof v === 'string') ? v : JSON.stringify(v);
        localStorage.setItem(key, val);
      }
      jlog('restore_element_done', { id: entry.id || null, type: entry.type || null, backup_stamp: bak.stamp });
      if (typeof w.bootstrapWorkspace === 'function'){
        try { w.bootstrapWorkspace(); } catch (_){}
      }
    }catch(err){
      jlog('restore_element_failed', { id: entry.id || null, error: String(err) });
      throw err;
    }
  };

})(window);
