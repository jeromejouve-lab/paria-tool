// PARIA-V2-CLEAN v1.0.0 | ui/tabs/projector.js
import { startSession, pauseSession, stopSession, addSessionComment, addSessionAnnotation } from '../../domain/reducers.js';

export function mountProjectorTab(){
  const root=document.getElementById('tab-projector'); if(!root) return;

  root.addEventListener('click',(ev)=>{
    const b=ev.target.closest('[data-action]'); if(!b) return;
    const act=b.dataset.action;
    if (act==='session-start') startSession(b.dataset.cardId||'');
    if (act==='session-pause') pauseSession();
    if (act==='session-stop')  stopSession();
  });

  root.addEventListener('submit',(ev)=>{
    const f=ev.target; if(!f.matches('[data-form="session-comment"], [data-form="session-annot"]')) return;
    ev.preventDefault(); const fd=new FormData(f); const text=(fd.get('text')||'').toString().trim(); const author=(fd.get('author')||'moi').toString();
    if (!text) return;
    if (f.matches('[data-form="session-comment"]')) addSessionComment({author,text});
    else addSessionAnnotation({author,text});
    f.reset();
  });
}

export const mount=mountProjectorTab; export default { mount };
