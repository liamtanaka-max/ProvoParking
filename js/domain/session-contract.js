// P7 has no dependency on a page, demo identity, or app-global state.
export class ParkingSessionError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "ParkingSessionError";
    this.code = code;
    this.status = status;
  }
}
const invalid = (message) => { throw new ParkingSessionError(message, "INVALID_SESSION", 400); };

export function validateSessionPreferences(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("Parking session preferences are required.");
  if (Object.keys(input).some((key) => !["location", "durationMinutes", "reminderMinutesBefore", "notes"].includes(key))) {
    invalid("Send parking preferences only; ownership and timestamps are assigned by the server.");
  }
  const { location, durationMinutes, reminderMinutesBefore = 10, notes = "" } = input;
  if (!location || typeof location.name !== "string" || !location.name.trim() || location.name.trim().length > 160) invalid("A parking location name of 1–160 characters is required.");
  if (location.id != null && (typeof location.id !== "string" || !location.id.trim() || location.id.trim().length > 200)) invalid("Location ID must be a nonempty string of up to 200 characters, or null.");
  const coords = location.coordinates;
  if (coords != null && (!Number.isFinite(coords.latitude) || coords.latitude < -90 || coords.latitude > 90
    || !Number.isFinite(coords.longitude) || coords.longitude < -180 || coords.longitude > 180)) invalid("Supply both valid coordinates, or omit coordinates.");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 720 || durationMinutes % 30 !== 0) invalid("Duration must be 30–720 minutes in 30-minute steps.");
  if (![0, 5, 10, 15, 30].includes(reminderMinutesBefore) || reminderMinutesBefore >= durationMinutes) invalid("Choose no reminder or a supported reminder shorter than the duration.");
  if (typeof notes !== "string" || notes.length > 200) invalid("Notes must be text of up to 200 characters.");
  if (location.isSample != null && typeof location.isSample !== "boolean") invalid("isSample must be a boolean.");
  return {
    location: { id: location.id?.trim() ?? null, name: location.name.trim(),
      coordinates: coords == null ? null : { latitude: coords.latitude, longitude: coords.longitude }, isSample: location.isSample === true },
    durationMinutes, reminderMinutesBefore, notes: notes.trim(),
  };
}

export function sessionFromRow(row) {
  return {
    id: row.id, ownerId: row.owner_id,
    location: { id: row.location_id, name: row.location_name,
      coordinates: row.latitude == null ? null : { latitude: row.latitude, longitude: row.longitude }, isSample: row.is_sample },
    durationMinutes: row.duration_minutes, reminderMinutesBefore: row.reminder_minutes_before,
    notes: row.notes, status: row.status,
    startedAt: new Date(row.started_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(), endedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

export function getSessionTiming(session, now = Date.now()) {
  if (!Number.isFinite(now)) invalid("A valid current timestamp is required.");
  const current = session.endedAt ? Date.parse(session.endedAt) : now;
  const remainingMs = Math.max(0, Date.parse(session.expiresAt) - current);
  const elapsedMs = Math.max(0, current - Date.parse(session.startedAt));
  return { remainingMs, elapsedMs,
    phase: session.endedAt ? "completed" : remainingMs === 0 ? "expired"
      : session.reminderMinutesBefore > 0 && remainingMs <= session.reminderMinutesBefore * 60000 ? "reminder" : "active" };
}
