import { validateActiveSession, startParkingSession, endParkingSession } from "../domain/active-parking.js";

// Separate from the existing Supabase My car timer. One local session per browser origin.
export const TIMER_STORAGE_KEY = "provoParking.localTimer.v1";

export function loadTimerSession(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(TIMER_STORAGE_KEY);
    return raw === null ? null : validateActiveSession(JSON.parse(raw));
  } catch {
    throw new Error("The saved parking timer could not be read. Browser storage may be unavailable or the saved data may be invalid.");
  }
}

function save(session, storage) {
  try { (storage ?? globalThis.localStorage).setItem(TIMER_STORAGE_KEY, JSON.stringify(session)); }
  catch { throw new Error("Your timer could not be saved in this browser. Allow local storage and try again before leaving this page."); }
  return session;
}

export function startLocalTimer(preferences, now = Date.now(), storage) {
  const existing = loadTimerSession(storage);
  if (existing && !existing.endedAt) throw new Error("You already have a parking session. Open View parking timer and end that session before starting another.");
  return save(startParkingSession(preferences, now), storage);
}

export function endLocalTimer(session, now = Date.now(), storage) {
  const current = loadTimerSession(storage);
  if (!current || current.id !== session.id) throw new Error("This session changed in another tab. Reload the timer before trying again.");
  return save(endParkingSession(current, now), storage);
}
