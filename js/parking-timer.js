import { createVisitTracker } from "./data/visit-tracker.js";
import { createGuestVisitRpc } from "./data/visit-guest-rpc.js";
// Resume a pending telemetry write after navigation; never block the timer UI.
try {
  const cfg = window.APP_CONFIG;
  if (cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY && sessionStorage.getItem("provoParking.visit.v1")) {
    const rpc = createGuestVisitRpc({url:cfg.SUPABASE_URL, key:cfg.SUPABASE_ANON_KEY});
    const tracker = createVisitTracker({storage:sessionStorage, rpc});
    void tracker.open({asGuest:true});
    window.addEventListener("online", () => void tracker.flush());
  }
} catch { /* The timer does not depend on metrics. */ }
import { initParkingTimer } from "./pages/parking-timer.js";
import { sampleSession } from "./domain/active-parking.js";
import { loadTimerSession, endLocalTimer, TIMER_STORAGE_KEY } from "./lib/timer-storage.js";

const root = document.querySelector("#parking-timer");
const mode = new URLSearchParams(location.search).get("demo");
const isDemo = ["active", "reminder", "expiring", "expired"].includes(mode);
// Load after mounting, so a storage failure stays visible alongside the empty state.
const controller = initParkingTimer(root, {
  session: isDemo ? sampleSession(mode) : null,
  onEnd: isDemo ? () => {} : (completed) => endLocalTimer(completed, Date.parse(completed.endedAt)),
});
if (isDemo) {
  document.querySelector("#timer-demo-note").hidden = false;
  document.querySelector("#timer-demo-tools").hidden = false;
  document.querySelector("#timer-storage-note").textContent = "Sample session for testing. Reminders appear on this page only; no background notifications are sent.";
} else {
  function reload() {
    // Avoid replacing a session while the user is confirming an async end action.
    try { controller.setSession(loadTimerSession()); }
    catch (err) {
      try { controller.setSession(null); } catch { /* An end action is still pending. */ }
      const error = document.querySelector("#timer-error");
      error.textContent = err.message;
      error.hidden = false;
    }
  }
  reload();
  window.addEventListener("storage", (event) => { if (event.key === TIMER_STORAGE_KEY || event.key === null) reload(); });
  window.addEventListener("pageshow", reload);
}
