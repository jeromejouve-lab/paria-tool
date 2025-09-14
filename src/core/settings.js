// src/core/settings.js — réglages (client/service + endpoints), workId
const KEY = 'paria::connections';
const DEFAULT = {
  client: 'default-client',
  service: 'default-service',
  endpoints: {
    llm: (window.PARIA_LLM_ENDPOINT || ''), // renseigne via index.html si besoin
    git: '',
    gdrive: ''
  },
  branding: {
    my_name: 'Moi',
    my_logo_url: '',
    my_address: ''
  }
};

export function getSettings(){
  try{ return JSON.parse(localStorage.getItem(KEY)) || DEFAULT; }
  catch{ return DEFAULT; }
}

export function saveSettings(patch){
  const cur = getSettings();
  const next = {
    ...cur,
    ...patch,
    endpoints: { ...cur.endpoints, ...(patch?.endpoints||{}) },
    branding:  { ...cur.branding,  ...(patch?.branding||{}) }
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function getWorkId(s=getSettings()){
  return `${s.client}::${s.service}`;
}

/*
INDEX settings.js:
- getSettings()
- saveSettings(patch)
- getWorkId(s?)
*/
