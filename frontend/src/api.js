// Backend address. Resolution order:
//   1. ?api=<url> in the page address (remembered in localStorage), so a demo can be
//      pointed at a laptop through a tunnel without rebuilding the site. Only
//      localhost and *.trycloudflare.com are accepted, and App.jsx shows a banner
//      while it is active. Open the site with ?api=reset to clear it.
//   2. VITE_API_URL (build / .env.local setting)
//   3. the deployed Render server
const DEFAULT_API = (import.meta.env.VITE_API_URL || 'https://samadhaan-ai.onrender.com').replace(/\/$/, '');
const STORAGE_KEY = 'apiOverride';

const isAllowed = (value) => {
  try {
    const u = new URL(value);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    const tunnel = u.protocol === 'https:' && u.hostname.endsWith('.trycloudflare.com');
    return local || tunnel;
  } catch {
    return false;
  }
};

const resolveOverride = () => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('api');
    if (fromUrl === 'reset') {
      localStorage.removeItem(STORAGE_KEY);
    } else if (fromUrl && isAllowed(fromUrl)) {
      localStorage.setItem(STORAGE_KEY, fromUrl.replace(/\/$/, ''));
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isAllowed(stored) ? stored : null;
  } catch {
    return null; // storage blocked: fall back to the default address
  }
};

const override = resolveOverride();

export const API_BASE = override || DEFAULT_API;
export const API_OVERRIDDEN = Boolean(override);
