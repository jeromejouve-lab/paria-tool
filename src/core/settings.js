const SETTINGS_KEY='paria_settings';

function defaults(){
  return { proxy:{url:'',secret:'',auto_sync:true,repo:'paria-audits'},
           work:{client:'',service:'',work_id:'',restore_at:'',last_proposed:{},last_restored:{}},
           ui:{last_tab:'settings',date:'',time:''},
           budgets:{max_local_bytes:4*1024*1024,warn:0.75,cap:0.90,target:0.45},
           clients:{} };
}

export function settingsLoad(){
  try{
    const raw=localStorage.getItem(SETTINGS_KEY); if(!raw) return defaults();
    const cur=JSON.parse(raw), def=defaults();
    return {...def,...cur,
      proxy:{...def.proxy,...(cur.proxy||{})},
      work:{...def.work,...(cur.work||{})},
      ui:{...def.ui,...(cur.ui||{})},
      budgets:{...def.budgets,...(cur.budgets||{})},
      clients:{...def.clients,...(cur.clients||{})}};
  }catch{return defaults();}
}

export function settingsSave(patch){
  const cur=settingsLoad(); const next={...cur};
  if(patch.proxy)   next.proxy   ={...cur.proxy,...patch.proxy};
  if(patch.work)    next.work    ={...cur.work,...patch.work};
  if(patch.ui)      next.ui      ={...cur.ui,...patch.ui};
  if(patch.budgets) next.budgets ={...cur.budgets,...patch.budgets};
  if(patch.clients) next.clients ={...cur.clients,...patch.clients};
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); return next;
}

export function migrateSettingsOnce(){
  const FLAG='paria_settings_migrated_v1'; if(localStorage.getItem(FLAG))return;
  const st=settingsLoad();
  const legacyUrl=localStorage.getItem('paria_gas_url')||'';
  const legacySecret=localStorage.getItem('paria_proxy_secret')||'';
  const legacyRepo=localStorage.getItem('paria_gh_repo')||'';
  const legacyWid=localStorage.getItem('paria_work_id')||'';
  const patch={proxy:{},work:{}};
  if(!st.proxy.url&&legacyUrl)patch.proxy.url=legacyUrl;
  if(!st.proxy.secret&&legacySecret)patch.proxy.secret=legacySecret;
  if(!st.proxy.repo&&legacyRepo)patch.proxy.repo=legacyRepo;
  if(!st.work.work_id&&legacyWid)patch.work.work_id=legacyWid;
  if(Object.keys(patch.proxy).length||Object.keys(patch.work).length)settingsSave(patch);
  localStorage.setItem(FLAG,'1');
}

export const getProxyConfig=()=>{const s=settingsLoad().proxy||{};return{url:s.url,secret:s.secret,auto_sync:s.auto_sync!==false,repo:s.repo||'paria-audits'};}
export function setProxyConfig({url,secret,repo,auto_sync}){
  return settingsSave({proxy:{url:(url||'').trim(),secret:(secret||'').trim(),repo:(repo||'paria-audits').trim(),auto_sync:auto_sync!==false}});
}
export function setWorkContext({client,service,work_id,restore_at}){
  const cur=settingsLoad();
  const st=settingsSave({work:{client:client??cur.work.client,service:service??cur.work.service,work_id:work_id??cur.work.work_id,restore_at:restore_at??cur.work.restore_at}});
  return st.work;
}
export const currentWorkId=()=>settingsLoad().work.work_id||'';
export const currentClient=()=>settingsLoad().work.client||'ACME';
export const currentService=()=>settingsLoad().work.service||'Compta';

