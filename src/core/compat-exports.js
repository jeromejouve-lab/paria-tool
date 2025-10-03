// src/core/compat-export.js — pont ESM → window.* (compat IIFE)
import { callGAS as _callGAS, bootstrapWorkspace } from './net.js';

// Expose une version "aplatit" pour les scripts IIFE (ex: core/restore.js),
// tout en laissant intact l'import ESM { callGAS } depuis './net.js'.
try {
  if (!window.callGAS) {
    window.callGAS = async (route, payload = {}) => {
      const r = await _callGAS(route, payload);               // { ok, status, data }
      if (r && typeof r === 'object' && r.data && typeof r.data === 'object') {
        // Aplatissement: retourne { ok, ...r.data } (ex: { ok:true, items:[...] })
        const ok = (r.ok !== false) && (r.data.ok ?? true);
        return { ok, ...r.data };
      }
      return r;
    };
  }
} catch {}

try { window.bootstrapWorkspace = window.bootstrapWorkspace || bootstrapWorkspace; } catch {}
