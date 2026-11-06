// Page: My car — parking timer, car note, end session (parking_session).
import { state, rulesFor } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { escapeHtml, fmtClock, fmtDuration, directionsUrl } from "../lib/format.js";
import { evaluate } from "../domain/eligibility.js";
import * as sessions from "../data/sessions.js";
import { parkingSelection } from "../domain/parking-results.js";
import { renderDestinationOptions } from "./find.js";

let timerHandle = null;
let lastReminderState = "";
let pendingAreaId = null; // set by "Park here", applied when the My car form renders

export function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

export function renderCar() {
  const active = $("car-active"), form = $("car-form"), guest = $("car-guest");
  const session = state.activeSession;
  stopTimer();
  lastReminderState = "";
  // Guests see why they need an account before filling the form, not after pressing Start.
  if (guest) guest.hidden = Boolean(session || state.user);
  if (!session && !state.user && guest) {
    form.hidden = true;
    active.hidden = true;
    active.innerHTML = "";
    return;
  }
  if (session) {
    form.hidden = true;
    active.hidden = false;
    const area = state.areas.find((a) => a.area_id === session.area_id);
    active.innerHTML = `
      <div class="panel session">
        <p class="meta">You parked at</p>
        <h3>${escapeHtml(area ? area.area_name : "Unknown area")}</h3>
        <p class="meta">Destination: ${escapeHtml(state.destinations.find(d => d.destination_id === session.destination_id)?.name || "Not recorded (older session)")}</p>
        <p class="countdown" id="countdown" aria-hidden="true"></p>
        <p id="countdown-text" class="sr-text"></p>
        <p id="reminder" class="reminder" hidden></p>
        <p class="meta">Started ${fmtClock(new Date(session.started_at))} · leave by <strong>${fmtClock(new Date(session.leave_by))}</strong> · reminder ${session.reminder_minutes_before} min before</p>

        <form id="note-form">
          <label for="note-edit">Where is your car?</label>
          <input type="text" id="note-edit" maxlength="200" value="${escapeHtml(session.car_note || "")}" placeholder="e.g. Row C near the stairs">
          <button type="submit" class="secondary">Save note</button>
        </form>

        <div class="actions">
          ${area && directionsUrl(area) ? `<a class="secondary" href="${escapeHtml(directionsUrl(area))}" target="_blank" rel="noopener">${area.is_sample_data ? "Walking directions (sample location)" : "Directions to approximate section"}</a>` : ""}
          <button type="button" class="primary" id="end-session">I left — end timer</button>
        </div>
      </div>`;
    tick();
    timerHandle = setInterval(tick, 1000);
  } else {
    active.hidden = true;
    active.innerHTML = "";
    form.hidden = false;
    const sel = $("car-area");
    // Hold the selected lot until the form renders.
    const keep = pendingAreaId ?? sel.value;
    pendingAreaId = null;
    sel.innerHTML = state.areas.filter((a) => !a.is_sample_data).map((a) => `<option value="${a.area_id}">${escapeHtml(a.area_name)}</option>`).join("");
    if (keep) sel.value = keep;
    renderDestinationOptions("car-destination", state.find.destinationId);
    updateCarWarning();
  }
}

// The countdown is always derived from the saved leave_by, so a refresh keeps it correct.
function tick() {
  const session = state.activeSession;
  if (!session) return;
  const msLeft = new Date(session.leave_by).getTime() - Date.now();
  const el = $("countdown");
  if (!el) return stopTimer();
  const over = msLeft < 0;
  const total = Math.abs(Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const clock = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.textContent = over ? `Over by ${clock}` : clock;
  el.classList.toggle("over", over);
  $("countdown-text").textContent = over ? `Time is up. You are over by ${fmtDuration(Math.max(1, Math.round(total / 60)))}.` : `${fmtDuration(Math.max(1, Math.ceil(total / 60)))} left.`;

  const remindMs = session.reminder_minutes_before * 60000;
  const reminderState = over ? "over" : msLeft <= remindMs ? "soon" : "ok";
  const rem = $("reminder");
  if (reminderState !== lastReminderState) { // only touch the live text when the state changes
    lastReminderState = reminderState;
    rem.hidden = reminderState === "ok";
    rem.setAttribute("role", reminderState === "ok" ? "" : "alert");
    rem.textContent = reminderState === "over"
      ? "Time is up — move your car now to avoid a ticket or tow."
      : reminderState === "soon" ? `Heads up: ${fmtDuration(Math.max(1, Math.ceil(msLeft / 60000)))} left. Head back to your car.` : "";
    rem.classList.toggle("over", reminderState === "over");
  }
}

export function updateCarWarning() {
  const warn = $("car-warning");
  const area = state.areas.find((a) => a.area_id === Number($("car-area").value));
  const mins = Number($("car-minutes").value);
  if (!area) { warn.hidden = true; return; }
  const { day, time } = parkingSelection({ live: true }); // Provo time, same as Areas
  const ev = evaluate(rulesFor(area.area_id), state.find.permitId, day, time);
  let msg = "";
  if (ev.kind === "no-permit") msg = `Heads up: your selected permit does not cover this area right now, so you could be ticketed.`;
  else if (ev.kind === "blocked") msg = `Heads up: ${ev.text.toLowerCase()} here.`;
  else if (ev.rule && ev.rule.max_stay_minutes && mins > ev.rule.max_stay_minutes) msg = `Heads up: this area has a ${fmtDuration(ev.rule.max_stay_minutes)} limit, shorter than ${fmtDuration(mins)}.`;
  warn.textContent = msg;
  warn.hidden = !msg;
}

// Called by the "Park here" button on Area details.
export function preselectArea(areaId) {
  if (state.activeSession) return;
  pendingAreaId = String(areaId);
  const sel = $("car-area");
  if ([...sel.options].some((o) => o.value === pendingAreaId)) { sel.value = pendingAreaId; updateCarWarning(); }
}

let requireAccount = () => true;

async function onStart(e) {
  e.preventDefault();
  if (!requireAccount("Create a free account to start a parking timer and save where you parked.")) return;
  const version = state.authVersion;
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const created = await sessions.startSession({
      areaId: Number($("car-area").value),
      minutes: Number($("car-minutes").value),
      reminderMinutes: Number($("car-reminder").value),
      carNote: $("car-note").value.trim(),
      destinationId: Number($("car-destination").value),
    });
    if (version !== state.authVersion) return;
    state.activeSession = created;
    $("car-note").value = "";
    setStatus("Parking timer started.");
    renderCar();
    $("h-car").focus();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    setStatus(`Could not start the timer: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

async function onEnd(btn) {
  const version = state.authVersion;
  btn.disabled = true;
  try {
    const expired = Date.now() > new Date(state.activeSession.leave_by).getTime();
    await sessions.endSession(state.activeSession, expired);
    if (version !== state.authVersion) return;
    state.activeSession = null;
    setStatus(expired ? "Timer ended. You were over your planned time." : "Timer ended. Safe travels!");
    renderCar();
    $("h-car").focus();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    setStatus(`Could not end the timer: ${err.message}`, true);
    btn.disabled = false;
  }
}

async function onSaveNote(e) {
  e.preventDefault();
  const version = state.authVersion;
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const saved = await sessions.saveCarNote(state.activeSession, $("note-edit").value.trim() || null);
    if (version !== state.authVersion) return;
    state.activeSession = saved;
    setStatus("Saved your car note.");
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    setStatus(`Could not save the note: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

export function initCar(options = {}) {
  if (options.requireAccount) requireAccount = options.requireAccount;
  $("car-area").addEventListener("change", updateCarWarning);
  $("car-minutes").addEventListener("change", updateCarWarning);
  document.addEventListener("submit", (e) => {
    if (e.target.id === "car-form") onStart(e);
    if (e.target.id === "note-form") onSaveNote(e);
  });
  document.addEventListener("click", (e) => {
    const end = e.target.closest("#end-session");
    if (end) onEnd(end);
    if (e.target.closest("#car-signup")) requireAccount("Create a free account to start a parking timer and save where you parked.");
  });
}
