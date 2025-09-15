// src/core/compat-exports.js — expose minimal vers window pour IIFE legacy
import { callGAS, bootstrapWorkspace } from './net.js'; 

try { window.callGAS = window.callGAS || callGAS; } catch {}
try { window.bootstrapWorkspace = window.bootstrapWorkspace || bootstrapWorkspace; } catch {}
