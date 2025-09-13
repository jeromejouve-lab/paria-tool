import { currentClient } from './settings.js';

const keyFor=cid=>'paria_db_'+cid;

function normalizeState(s, cid=currentClient()){
  const o=s&&typeof s==='object'?s:{};
  o.charter=o.charter||{title:'',content:'',tags:[],state:{deleted:false,updated_ts:Date.now()}};
  o.items=Array.isArray(o.items)?o.items:[]; o.scenarios=Array.isArray(o.scenarios)?o.scenarios:[]; o.decisions=Array.isArray(o.decisions)?o.decisions:[];
  o.meta={...(o.meta||{}),client_id:o.meta?.client_id||cid,rev:o.meta?.rev||0,updated_ts:Date.now()};
  return o;
}

export function readClientBlob(cid=currentClient()){ try{const raw=localStorage.getItem(keyFor(cid)); return normalizeState(raw?JSON.parse(raw):{}, cid);}catch{return normalizeState({}, cid);} }
export function writeClientBlob(blob,cid=currentClient()){ const safe=normalizeState(blob, cid); localStorage.setItem(keyFor(cid),JSON.stringify(safe)); return safe; }
export function mergeIntoCurrentService(part,cid=currentClient()){
  const cur=readClientBlob(cid); const next={...cur};
  if(part.charter)next.charter=part.charter; if(part.items)next.items=part.items; if(part.scenarios)next.scenarios=part.scenarios; if(part.decisions)next.decisions=part.decisions;
  next.meta={...(next.meta||{}),client_id:cid,rev:(next.meta?.rev||0)+1,updated_ts:Date.now()};
  return writeClientBlob(next,cid);
}
export function loadDB(){ return readClientBlob(); }
