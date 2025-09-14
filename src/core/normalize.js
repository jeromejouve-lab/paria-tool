export const nil = v => (v==null ? '' : v);
export const arr = v => (Array.isArray(v)?v:[]);

/*
INDEX normalize.js:
- nil(v)
- arr(v)
*/
