// Standalone P5 contract; no database rows, credentials, or timer state required.
export const SAMPLE_LOCATION = Object.freeze({
  id: "sample-provo-garage",
  name: "Downtown Provo garage (sample location)",
  coordinates: Object.freeze({ latitude: 40.2338, longitude: -111.6585 }),
  isSample: true,
});

export const DURATIONS = Object.freeze(Array.from({ length: 24 }, (_, i) => (i + 1) * 30));
export const REMINDERS = Object.freeze([0, 5, 10, 15, 30]);

export function durationLabel(minutes) {
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return [hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "", remainder ? `${remainder} minutes` : ""].filter(Boolean).join(" ");
}

export function validateLocation(location) {
  if (!location || typeof location.id !== "string" || !location.id.trim()
    || typeof location.name !== "string" || !location.name.trim()) {
    throw new Error("A parking location with an ID and name is required.");
  }
  const { latitude, longitude } = location.coordinates || {};
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("The parking location needs valid latitude and longitude coordinates.");
  }
  return {
    id: location.id.trim(), name: location.name.trim(),
    coordinates: { latitude, longitude }, isSample: location.isSample === true,
  };
}

export function createParkingSession({ location = SAMPLE_LOCATION, durationMinutes = 120, reminderMinutesBefore = 10, notes = "" } = {}) {
  const selectedLocation = validateLocation(location);
  if (!DURATIONS.includes(durationMinutes)) throw new Error("Choose a parking duration from 30 minutes to 12 hours in 30-minute steps.");
  if (!REMINDERS.includes(reminderMinutesBefore) || reminderMinutesBefore >= durationMinutes) {
    throw new Error("Choose no reminder or a reminder shorter than your parking duration.");
  }
  if (typeof notes !== "string" || notes.length > 200) throw new Error("Keep your car location notes to 200 characters or fewer.");
  return { location: selectedLocation, durationMinutes, reminderMinutesBefore, notes: notes.trim() };
}
