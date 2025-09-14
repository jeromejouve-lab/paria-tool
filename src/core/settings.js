// Paramétrage minimal : client/service + endpoints déjà définis chez toi
const DEFAULT = {
  client: 'default-client',
  service: 'default-service',
  endpoints: {
    llm: (window.PARIA_LLM_ENDPOINT || ''), // si tu définis window.PARIA_LLM_ENDPOINT dans index.html
    git: '',
    gdrive: ''
  },
  branding: {
    my_name: 'Moi',
    my_logo_url: '',
    my_address: ''
  }
};

const KEY = 'paria::connections';

export function getSettings(){
  try{
    return JSON.parse(localStorage.getItem(KEY)) || DEFAULT;
  }catch{
    return DEFAULT;
  }
}

export function saveSettings(patch){
  const cur = getSettings();
  const next = { ...cur, ...patch, endpoints:{...cur.endpoints, ...(patch?.endpoints||{})}, branding:{...cur.branding, ...(patch?.branding||{})} };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function getWorkId(s=getSettings()){
  return `${s.client}::${s.service}`;
}

/*
INDEX settings.js:
- DEFAULT
- getSettings()
- saveSettings(patch)
- getWorkId(s?)
*/
