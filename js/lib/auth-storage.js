// Where Supabase keeps the signed-in session.
// "Keep me signed in" on (the default): localStorage, so you stay signed in on this device.
// Off: sessionStorage, so the session ends when the browser closes.
// Storages are passed in so this can be unit tested without a browser.

export const REMEMBER_KEY = "provoParking.rememberMe";

export function createAuthStorage({ local, session }) {
  const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const remember = () => safe(() => local.getItem(REMEMBER_KEY)) !== "0";

  return {
    remember,
    setRemember(on) { safe(() => local.setItem(REMEMBER_KEY, on ? "1" : "0")); },
    getItem(key) { return safe(() => local.getItem(key)) ?? safe(() => session.getItem(key)); },
    setItem(key, value) {
      const [keep, drop] = remember() ? [local, session] : [session, local];
      safe(() => keep.setItem(key, value));
      safe(() => drop.removeItem(key));
    },
    removeItem(key) {
      safe(() => local.removeItem(key));
      safe(() => session.removeItem(key));
    },
  };
}
