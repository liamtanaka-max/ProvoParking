import { createParkingSession, SAMPLE_LOCATION } from "./parking-setup.js";

function timestamp(value, label) {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) throw new Error(`${label} must be a valid date-time string.`);
  return ms;
}

/** P6 input: P5 preferences plus id, startedAt, expiresAt, and optional endedAt. */
export function validateActiveSession(input) {
  if (!input || typeof input.id !== "string" || !input.id.trim()) throw new Error("A session ID is required.");
  if (!input.location || input.durationMinutes === undefined || input.reminderMinutesBefore === undefined) {
    throw new Error("Session location, duration, and reminder preference are required.");
  }
  const preferences = createParkingSession(input);
  const start = timestamp(input.startedAt, "Start time");
  const expires = timestamp(input.expiresAt, "Expiration time");
  if (expires - start !== preferences.durationMinutes * 60000) throw new Error("Expiration must match the selected duration after the start time.");
  let endedAt = null;
  if (input.endedAt != null) {
    const ended = timestamp(input.endedAt, "End time");
    if (ended < start) throw new Error("End time cannot be before the start time.");
    endedAt = new Date(ended).toISOString();
  }
  return {
    ...preferences, id: input.id.trim(), startedAt: new Date(start).toISOString(),
    expiresAt: new Date(expires).toISOString(), endedAt,
  };
}

export function startParkingSession(preferences, now = Date.now(), id = globalThis.crypto.randomUUID()) {
  if (!Number.isFinite(now)) throw new Error("A valid current time is required.");
  const setup = createParkingSession(preferences);
  return validateActiveSession({
    ...setup, id, startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + setup.durationMinutes * 60000).toISOString(),
  });
}

/** Recompute from timestamps on every render; a suspended tab never loses seconds. */
export function timerSnapshot(session, now = Date.now()) {
  const start = Date.parse(session.startedAt), expiry = Date.parse(session.expiresAt);
  const current = session.endedAt ? Date.parse(session.endedAt) : now;
  const elapsedMs = Math.max(0, current - start);
  const remainingMs = Math.max(0, expiry - current);
  const phase = session.endedAt ? "completed" : current >= expiry ? "expired"
    : session.reminderMinutesBefore > 0 && remainingMs <= session.reminderMinutesBefore * 60000 ? "reminder" : "active";
  return { phase, elapsedMs, remainingMs };
}

export function endParkingSession(session, now = Date.now()) {
  const valid = validateActiveSession(session);
  if (valid.endedAt) return valid;
  if (!Number.isFinite(now)) throw new Error("A valid current time is required.");
  return { ...valid, endedAt: new Date(Math.max(now, Date.parse(valid.startedAt))).toISOString() };
}

export function clockLabel(ms, roundUp = false) {
  const seconds = Math.max(0, (roundUp ? Math.ceil : Math.floor)(ms / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function sampleSession(mode = "active", now = Date.now()) {
  const elapsed = mode === "reminder" ? 115 * 60000 : mode === "expired" ? 121 * 60000
    : mode === "expiring" ? 120 * 60000 - 10000 : 90 * 60000;
  return startParkingSession({
    location: SAMPLE_LOCATION, durationMinutes: 120, reminderMinutesBefore: 10,
    notes: "Level 3, Row C, near elevator.",
  }, now - elapsed, `sample-${mode}`);
}
