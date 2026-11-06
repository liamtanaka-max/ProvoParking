import { validLocation } from "../domain/nearby.js";

// Consent is requested only by start(). Coordinates never leave this controller through storage.
export function createLocationTracker({ geolocation, onChange, now = Date.now, staleAfterMs = 90000, scheduleRetry = (fn) => setTimeout(fn, 2000), cancelRetry = clearTimeout }) {
  let watchId = null, generation = 0, active = false, enabled = false, staleTimer, retryTimer = null, retries = 0;
  function clear() {
    active = false;
    generation++;
    clearTimeout(staleTimer);
    if (retryTimer !== null) cancelRetry(retryTimer);
    retryTimer = null;
    if (watchId !== null) geolocation.clearWatch(watchId);
    watchId = null;
  }
  function stop(message = "Location off. Use your location to find nearby lots.") {
    enabled = false;
    clear();
    onChange({ status: "idle", position: null, message });
  }
  function pause() {
    if (!enabled) return;
    clear();
    onChange({ status: "paused", position: null, message: "Location paused while the map is not visible." });
  }
  function resume() { if (enabled && !active) begin(); }
  function fail(message) {
    enabled = false;
    clear();
    onChange({ status: "error", position: null, message });
  }
  function start() { enabled = true; retries = 0; begin(); }
  function begin() {
    if (active) return;
    if (!geolocation) { fail("Your browser does not support location. You can still explore the map."); return; }
    active = true;
    const token = ++generation;
    onChange({ status: "waiting", position: null, message: "Waiting for location permission and a position…" });
    try {
      const id = geolocation.watchPosition(fix => {
        if (!active || token !== generation) return;
        const { latitude, longitude, accuracy } = fix.coords || {};
        if (!validLocation({ latitude, longitude }) || !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(fix.timestamp) || now() - fix.timestamp >= staleAfterMs) {
          fail("Location could not be confirmed. Try your location again."); return;
        }
        retries = 0;
        clearTimeout(staleTimer);
        staleTimer = setTimeout(() => fail("Location is out of date. Use your location again for fresh suggestions."), Math.max(0, staleAfterMs - Math.max(0, now() - fix.timestamp)));
        staleTimer.unref?.();
        onChange({ status: "live", position: { latitude, longitude, accuracy, timestamp: fix.timestamp }, message: `${accuracy > 200 ? "Approximate location" : "Location live"} · accuracy ±${Math.round(accuracy)} m · updated ${new Date(fix.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` });
      }, error => {
        if (!active || token !== generation) return;
        if (error.code === 2 && retries < 1) {
          retries++;
          clear();
          onChange({ status: "waiting", position: null, message: "Location temporarily unavailable. Retrying…" });
          retryTimer = scheduleRetry(() => { retryTimer = null; if (enabled) begin(); });
          return;
        }
        const messages = {
          1: "Location permission was denied. Allow location in your browser settings, then try again.",
          2: "Your position is unavailable. Check location services and try again.",
          3: "Finding your location timed out. Try again, or keep exploring the map.",
        };
        fail(messages[error.code] || "Location unavailable. Try again, or keep exploring the map.");
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
      // Also safe when a test/platform calls back synchronously before returning its watch ID.
      if (active && token === generation) watchId = id; else geolocation.clearWatch(id);
    } catch {
      fail("Location is unavailable here. Use HTTPS or localhost and try again.");
    }
  }
  return { start, stop, pause, resume };
}
