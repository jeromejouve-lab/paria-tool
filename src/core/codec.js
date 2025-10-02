// src/core/codec.js
export const normNFKC = (s) => (s == null ? '' : String(s)).normalize('NFKC');
export const utf8Bytes = (s) => new TextEncoder().encode(normNFKC(s));
export const sha256Hex = async (s) => {
  const d = await crypto.subtle.digest('SHA-256', utf8Bytes(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
};
export const b64Utf8 = (s) => btoa(String.fromCharCode(...utf8Bytes(s)));
export const jsonStable = (o) => JSON.stringify(o, Object.keys(o).sort(), 2);
export const ghAuthHeaders = (token) => ({
  'Authorization': 'token ' + token,               // <— uniforme
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'paria-ui'
});
export const ghContentsURL = ({owner, repo, branch, path}) =>
  `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
