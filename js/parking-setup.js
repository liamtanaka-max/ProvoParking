import { initParkingSetup } from "./pages/parking-setup.js";
import { startLocalTimer } from "./lib/timer-storage.js";
import { createVisitTracker } from "./data/visit-tracker.js";
import { createGuestVisitRpc } from "./data/visit-guest-rpc.js";

// The local timer remains usable without configuration or a network connection.
let tracker = null;
try {
  const cfg = window.APP_CONFIG;
  if (cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY) {
    const rpc = createGuestVisitRpc({url:cfg.SUPABASE_URL, key:cfg.SUPABASE_ANON_KEY});
    tracker = createVisitTracker({storage: window.sessionStorage, rpc});
    void tracker.open({asGuest:true});
    window.addEventListener("online", () => void tracker.flush());
  }
} catch { /* The local timer does not depend on metrics. */ }
initParkingSetup(document.querySelector("#parking-setup"), {
  onConfirm(preferences) {
    const session = startLocalTimer(preferences);
    if (!session.location.isSample) void tracker?.guestStarted(session);
    location.assign("parking-timer.html");
  },
});
