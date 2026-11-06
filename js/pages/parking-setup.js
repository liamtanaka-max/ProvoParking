import { SAMPLE_LOCATION, DURATIONS, createParkingSession, durationLabel, validateLocation } from "../domain/parking-setup.js";

/** Mount once per root. onStart may be async; see docs/parking-timer-setup.md. */
export function initParkingSetup(root, { location = SAMPLE_LOCATION, onStart = () => {}, onConfirm = null } = {}) {
  const find = (id) => root.querySelector(`#setup-${id}`);
  const form = find("form"), error = find("error"), confirmation = find("confirmation");
  const duration = find("duration"), reminder = find("reminder"), notes = find("notes");
  const button = form.querySelector('[type="submit"]');
  const confirmButton = find("confirm-start"), confirmError = find("confirm-error");
  let selectedLocation, locationError = "", submitting = false, reviewedPayload = null;
  if (confirmButton) confirmButton.hidden = typeof onConfirm !== "function";

  duration.replaceChildren(...DURATIONS.map((minutes) => {
    const option = document.createElement("option");
    option.value = String(minutes);
    option.textContent = durationLabel(minutes);
    return option;
  }));
  duration.value = "120";

  function clearError() {
    error.hidden = true;
    for (const input of [find("location"), duration, reminder, notes]) input.removeAttribute("aria-invalid");
  }

  function syncReminder() {
    for (const option of reminder.options) option.disabled = Number(option.value) >= Number(duration.value);
    if (Number(reminder.value) >= Number(duration.value)) {
      reminder.value = "0";
      find("reminder-hint").textContent = "Reminder changed to no reminder.";
    } else {
      find("reminder-hint").textContent = "";
    }
  }
  find("reminder-hint").setAttribute("aria-live", "polite");

  function setLocation(nextLocation) {
    if (submitting) throw new Error("Wait for the current submission before changing location.");
    clearError();
    reviewedPayload = null;
    try {
      // Missing/null input uses the explicit sample; malformed supplied data never silently does.
      selectedLocation = validateLocation(nextLocation ?? SAMPLE_LOCATION);
      locationError = "";
      find("location").value = selectedLocation.name;
      find("location-hint").textContent = selectedLocation.isSample
        ? "Sample location and coordinates for this demo. No map selection is connected."
        : "Location supplied by the app. Check posted parking rules before starting.";
    } catch (err) {
      selectedLocation = null;
      locationError = err.message;
      find("location").value = "";
      find("location-hint").textContent = locationError;
      find("location").setAttribute("aria-invalid", "true");
    }
    confirmation.hidden = true;
    form.hidden = false;
  }

  function showConfirmation(payload) {
    reviewedPayload = structuredClone(payload);
    if (confirmError) confirmError.hidden = true;
    const summary = find("summary");
    summary.replaceChildren();
    for (const [label, value] of [
      ["Parking location", payload.location.name],
      ["Duration", durationLabel(payload.durationMinutes)],
      ["Reminder preference", payload.reminderMinutesBefore ? `${payload.reminderMinutesBefore} minutes before` : "No reminder"],
      ["Car location notes", payload.notes || "No notes added"],
    ]) {
      const term = document.createElement("dt"), description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      summary.append(term, description);
    }
    form.hidden = true;
    confirmation.hidden = false;
    find("confirmation-title").focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    clearError();
    let payload;
    try {
      if (locationError) throw new Error(locationError);
      payload = createParkingSession({
        location: selectedLocation, durationMinutes: Number(duration.value),
        reminderMinutesBefore: Number(reminder.value), notes: notes.value,
      });
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      const invalid = locationError ? find("location")
        : !DURATIONS.includes(Number(duration.value)) ? duration
        : notes.value.length > 200 ? notes : reminder;
      invalid.setAttribute("aria-invalid", "true");
      invalid.focus();
      return;
    }
    submitting = true;
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    // Freeze controls while an asynchronous integration consumes the submitted snapshot.
    for (const input of [duration, reminder, notes]) input.disabled = true;
    try {
      await onStart(structuredClone(payload));
      showConfirmation(payload);
    } catch {
      error.textContent = "Could not submit your parking setup. Your choices are still here; please try again.";
      error.hidden = false;
    } finally {
      submitting = false;
      button.disabled = false;
      for (const input of [duration, reminder, notes]) input.disabled = false;
      form.removeAttribute("aria-busy");
    }
  }

  function edit() {
    if (submitting) return;
    confirmation.hidden = true;
    form.hidden = false;
    duration.focus();
  }
  async function confirmStart() {
    if (submitting || !reviewedPayload || typeof onConfirm !== "function") return;
    submitting = true;
    confirmButton.disabled = true;
    find("edit").disabled = true;
    confirmError.hidden = true;
    try { await onConfirm(structuredClone(reviewedPayload)); }
    catch (err) {
      confirmError.textContent = err.message || "Could not start your timer. Please try again.";
      confirmError.hidden = false;
    } finally {
      submitting = false;
      confirmButton.disabled = false;
      find("edit").disabled = false;
    }
  }
  function change() { clearError(); syncReminder(); }
  duration.addEventListener("change", change);
  form.addEventListener("submit", submit);
  find("edit").addEventListener("click", edit);
  confirmButton?.addEventListener("click", confirmStart);
  setLocation(location);
  syncReminder();
  return {
    setLocation,
    destroy() {
      duration.removeEventListener("change", change);
      form.removeEventListener("submit", submit);
      find("edit").removeEventListener("click", edit);
      confirmButton?.removeEventListener("click", confirmStart);
    },
  };
}
