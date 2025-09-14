export const now = ()=> Date.now();
export const ts  = (n)=> new Date(n||Date.now()).toLocaleString();

/*
INDEX time.js:
- now()
- ts(n?)
*/
