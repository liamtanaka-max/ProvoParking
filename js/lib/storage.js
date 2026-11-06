// Browser-only preferences (not personal data; those go in Supabase).
const PERMIT_KEY = "provoParking.permitId";

export function loadSavedPermit() {
  try { const v = localStorage.getItem(PERMIT_KEY); return v ? Number(v) : null; } catch { return null; }
}

export function savePermit(id) {
  try { localStorage.setItem(PERMIT_KEY, String(id)); } catch { /* private mode: keep it in memory only */ }
}
