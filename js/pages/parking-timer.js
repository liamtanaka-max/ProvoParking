import { validateActiveSession, timerSnapshot, clockLabel, endParkingSession } from "../domain/active-parking.js";
import { durationLabel } from "../domain/parking-setup.js";

/** Independent page controller: persistence and map navigation are optional callbacks. */
export function initParkingTimer(root, { session = null, onEnd = () => {}, onFindCar = null, now = () => Date.now() } = {}) {
  const find = (id) => root.querySelector(`#timer-${id}`);
  const dialog = find("end-dialog");
  let current = null, interval = null, phase = "", pending = false, destroyed = false;

  const dateLabel = (value) => new Date(value).toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
  });
  function stop() { if (interval !== null) clearInterval(interval); interval = null; }
  function showError(message) { find("error").textContent = message; find("error").hidden = false; }

  function render() {
    if (!current || destroyed) return;
    const snapshot = timerSnapshot(current, now());
    const completed = snapshot.phase === "completed", expired = snapshot.phase === "expired";
    find("countdown").textContent = completed ? "Session ended" : clockLabel(snapshot.remainingMs, true);
    find("countdown").classList.toggle("timer-completed", completed);
    find("clock-label").hidden = completed;
    find("elapsed").textContent = clockLabel(snapshot.elapsedMs);
    root.dataset.phase = snapshot.phase;
    const stateText = completed ? "Parking session completed" : expired ? "Parking time expired"
      : snapshot.phase === "reminder" ? "Time to head back" : "Parking in progress";
    find("state").textContent = stateText;
    // Announce state changes, not every second of the countdown.
    if (phase !== snapshot.phase) {
      phase = snapshot.phase;
      const notice = find("notice");
      notice.hidden = phase === "active";
      notice.textContent = completed ? "Your parking session has ended. No timer is active for this session."
        : expired ? "Your planned parking time is up. Return to your car and check the posted rules."
        : phase === "reminder" ? `Your ${current.reminderMinutesBefore}-minute reminder is due. Head back to your car.` : "";
      notice.classList.toggle("over", expired);
    }
    find("end").hidden = completed;
    find("new").hidden = !completed;
    find("ended-row").hidden = !completed;
    if (completed) find("ended").textContent = dateLabel(current.endedAt);
    if (completed) stop();
  }

  function setSession(nextSession) {
    if (destroyed) throw new Error("This parking timer has been unmounted.");
    if (pending) throw new Error("Wait until the current session action finishes.");
    stop();
    if (dialog.open) dialog.close();
    phase = "";
    find("error").hidden = true;
    find("navigation").hidden = true;
    try { current = nextSession === null ? null : validateActiveSession(nextSession); }
    catch (err) { current = null; showError(`Could not display this parking session: ${err.message}`); }
    find("session").hidden = !current;
    find("empty").hidden = !!current;
    if (!current) return;
    find("location").textContent = current.location.name;
    find("duration").textContent = durationLabel(current.durationMinutes);
    find("started").textContent = dateLabel(current.startedAt);
    find("expires").textContent = dateLabel(current.expiresAt);
    find("reminder").textContent = current.reminderMinutesBefore ? `${current.reminderMinutesBefore} minutes before` : "No reminder";
    find("notes").textContent = current.notes || "No notes added.";
    render();
    if (!current.endedAt) interval = setInterval(render, 1000);
  }

  function askEnd() { if (!pending && current && !current.endedAt) dialog.showModal(); }
  function cancelEnd() { dialog.close(); }
  async function confirmEnd() {
    if (pending || !current || current.endedAt) return;
    pending = true;
    find("confirm-end").disabled = true;
    find("cancel-end").disabled = true;
    find("error").hidden = true;
    try {
      const completed = endParkingSession(current, now());
      await onEnd(structuredClone(completed));
      if (destroyed) return;
      current = completed;
      dialog.close();
      render();
      find("state").tabIndex = -1;
      find("state").focus();
    } catch (err) {
      if (!destroyed) { dialog.close(); showError(err.message || "Could not end this parking session. Please try again."); }
    } finally {
      pending = false;
      find("confirm-end").disabled = false;
      find("cancel-end").disabled = false;
    }
  }
  async function findCar() {
    if (pending || !current) return;
    find("navigation").hidden = false;
    if (!onFindCar) {
      find("navigation").textContent = `Map navigation is not connected yet. Your car is at ${current.location.name}. ${current.notes || "No car location notes were added."}`;
      return;
    }
    find("find").disabled = true;
    try { await onFindCar(structuredClone(current.location), current.notes); }
    catch { find("navigation").textContent = "Could not open navigation. Your parking location and notes are shown above."; }
    finally { find("find").disabled = false; }
  }
  function visibility() { if (!document.hidden) render(); }
  function resume() {
    stop();
    render();
    if (current && !current.endedAt && !destroyed) interval = setInterval(render, 1000);
  }
  function cancelDialog(event) { if (pending) event.preventDefault(); }
  find("end").addEventListener("click", askEnd);
  find("cancel-end").addEventListener("click", cancelEnd);
  find("confirm-end").addEventListener("click", confirmEnd);
  find("find").addEventListener("click", findCar);
  dialog.addEventListener("cancel", cancelDialog);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pageshow", resume);
  window.addEventListener("pagehide", stop);
  setSession(session);
  return {
    setSession, refresh: render,
    destroy() {
      destroyed = true;
      stop();
      if (dialog.open) dialog.close();
      find("end").removeEventListener("click", askEnd);
      find("cancel-end").removeEventListener("click", cancelEnd);
      find("confirm-end").removeEventListener("click", confirmEnd);
      find("find").removeEventListener("click", findCar);
      dialog.removeEventListener("cancel", cancelDialog);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", stop);
    },
  };
}
