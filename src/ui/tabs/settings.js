// PARIA-V2-CLEAN v1.0.0 | ui/tabs/settings.js
import { settingsLoad, settingsSave, setWorkContext, getWorkContext } from '../../core/settings.js';
import { diag } from '../../core/net.js';
import { bootstrapWorkspaceIfNeeded } from '../../domain/reducers.js';

const $ = (sel,root=document)=>root.querySelector(sel);
const SEL = {
  root:'#tab-settings',
  client:'#CLIENT', service:'#SERVICE', date:'#DATE', time:'#TIME', wid:'#widNow',
  gas:'#GAS_URL', token:'#PROXY_SECRET', git:'#GH_REPO', autos:'#AUTO_SYNC',
  save:'#btnSaveCfg', diag:'#btnDiag', diagOut:'#diagState',
  snapshot:'#btnSnapshotNow', load:'#btnLoad', restore:'#btnRestore', loadOut:'#loadState',
  linkWid:'#btnLinkWID', propose:'#btnPropose'
};

function safe(s){ return {
  client:s.client||'', service:s.service||'',
  proxy:{ url:s?.endpoints?.proxy?.url||s?.proxy?.url||'', token:s?.endpoints?.proxy?.token||s?.proxy?.token||'' },
  git: s?.endpoints?.git || s?.connections?.endpoints?.git?.url || '',
  autos: !!s?.flags?.auto_sync
};}

export function mountSettingsTab(){
  const root=$(SEL.root); if(!root) return;

  const s=safe(settingsLoad());
  const $client=$(SEL.client,root), $service=$(SEL.service,root), $wid=$(SEL.wid,root);
  const $date=$(SEL.date,root), $time=$(SEL.time,root);
  const $gas=$(SEL.gas,root), $tok=$(SEL.token,root), $git=$(SEL.git,root), $autos=$(SEL.autos,root);
  const $save=$(SEL.save,root), $diag=$(SEL.diag,root), $diagOut=$(SEL.diagOut,root);
  const $link=$(SEL.linkWid,root), $prop=$(SEL.propose,root);

  if($client) $client.value=s.client; if($service) $service.value=s.service;
  if($gas) $gas.value=s.proxy.url; if($tok) $tok.value=s.proxy.token;
  if($git) $git.value=s.git; if($autos) $autos.checked=s.autos;

  const today = new Date();
  const pad=v=>String(v).padStart(2,'0');
  if($date) $date.value = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  if($time) $time.value = `${pad(today.getHours())}:${pad(today.getMinutes())}`;
  const refreshWid=()=>{ if($wid) $wid.textContent = `${$client?.value||''}::${$service?.value||''}::${$date?.value||''}T${$time?.value||''}`; };
  [$client,$service,$date,$time].forEach(el=>el&&el.addEventListener('input',refreshWid)); refreshWid();
  if($prop) $prop.onclick=refreshWid;
  if($link) $link.onclick=async()=>{ await setWorkContext({client:$client?.value||'',service:$service?.value||''}); refreshWid(); };

  if($save) $save.onclick=async()=>{
    const client=($client?.value||'').trim(), service=($service?.value||'').trim();
    const proxyUrl=($gas?.value||'').trim(), proxyTok=($tok?.value||'').trim();
    const git=($git?.value||'').trim(), autos=!!$autos?.checked;
    try{
      await settingsSave({
        client, service,
        endpoints:{ git, proxy:{ url:proxyUrl, token:proxyTok } },
        proxy:{ url:proxyUrl, token:proxyTok },
        connections:{ client, service, endpoints:{ git:{url:git}, proxy:{ url:proxyUrl, token:proxyTok } }, proxy:{ url:proxyUrl, token:proxyTok } },
        flags:{ auto_sync:autos }
      });
      await setWorkContext({client,service});
      await bootstrapWorkspaceIfNeeded(client,service);
      if($diagOut) $diagOut.textContent='✅ Config sauvegardée & workspace vérifié.';
    }catch(e){ if($diagOut) $diagOut.textContent=`❌ Save: ${e?.message||e}`; }
  };

  if($diag) $diag.onclick=async()=>{ try{ const r=await diag(); if($diagOut) $diagOut.textContent=JSON.stringify(r,null,2); }catch(e){ if($diagOut) $diagOut.textContent=`❌ Diag: ${e?.message||e}`; } };
}

export const mount = mountSettingsTab;
export default { mount };
