// Formatting helpers shared by every page. No DOM, no database.

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function toMinutes(t) { // "HH:MM" or "HH:MM:SS" -> minutes since midnight
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fmtTime(t) { // "13:05:00" -> "1:05 PM"
  const mins = toMinutes(t);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtDuration(minutes) {
  if (minutes % 1440 === 0) { const d = minutes / 1440; return `${d} day${d === 1 ? "" : "s"}`; }
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtClock(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso) {
  if (!iso) return "unknown";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

export function directionsUrl(area, travelmode = "walking") {
  const coordinate = value => (typeof value === "number" || typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;
  const latitude = coordinate(area.latitude), longitude = coordinate(area.longitude);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  // Omit origin so Google Maps uses the device's current location (or asks for a start).
  // Leave dir_action unset to show directions first, letting the user choose Start.
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}&travelmode=${encodeURIComponent(travelmode)}`;
}
