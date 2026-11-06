// Page: Find — pick permit, arrival day and arrival time.
import { state } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { DAY_NAMES, escapeHtml, fmtTime, nowHHMM } from "../lib/format.js";
import { savePermit } from "../lib/storage.js";
import { parkingSelection } from "../domain/parking-results.js";

export function renderFind() {
  renderDestinationOptions("find-destination", state.find.destinationId);
  const sel = $("permit-select");
  sel.innerHTML = `<option value="">Choose a permit…</option>` +
    state.permits.map((p) => `<option value="${p.permit_id}">${escapeHtml(p.permit_code)} — ${escapeHtml(p.permit_name)}</option>`).join("");
  sel.value = state.find.permitId ?? "";
  const selection = parkingSelection(state.find);
  $("arrive-day").value = String(selection.day);
  $("arrive-time").value = selection.time;
  $("arrive-now").checked = Boolean(state.find.live);
  syncTimeControls();
  renderPermitInfo();
}

export function renderDestinationOptions(id, selected) {
  $(id).innerHTML = '<option value="">Choose a BYU building…</option>' + state.destinations.map(d =>
    `<option value="${d.destination_id}">${escapeHtml(d.name)} (${escapeHtml(d.building_code)})</option>`).join("");
  $(id).value = selected ?? "";
}

function syncTimeControls() {
  const live = $("arrive-now").checked;
  $("arrive-day").disabled = live;
  $("arrive-time").disabled = live;
}

function renderPermitInfo() {
  const p = state.permits.find((x) => x.permit_id === Number($("permit-select").value));
  $("permit-info").innerHTML = p
    ? `${escapeHtml(p.description || "")}${p.cost_note ? ` Cost: ${escapeHtml(p.cost_note)}.` : ""}` +
      (p.source_url ? ` <a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">Source</a>${p.last_verified_on ? ` (checked ${escapeHtml(p.last_verified_on)})` : ""}` : "")
    : "";
}

export function initFind({ go }) {
  $("permit-select").addEventListener("change", renderPermitInfo);
  $("arrive-now").addEventListener("change", syncTimeControls);
  $("find-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = Number($("permit-select").value);
    if (!id) { setStatus("Choose your permit first so we can check which areas you can use.", true); $("permit-select").focus(); return; }
    const destinationId = Number($("find-destination").value);
    if (!state.destinations.some(d => d.destination_id === destinationId)) {
      setStatus("Choose your destination building first.", true); $("find-destination").focus(); return;
    }
    state.find.destinationId = destinationId;
    state.find.permitId = id;
    state.find.live = $("arrive-now").checked;
    state.find.day = Number($("arrive-day").value);
    state.find.time = $("arrive-time").value || nowHHMM();
    savePermit(id);
    const selection = parkingSelection(state.find);
    setStatus(`Showing eligible areas ${selection.live ? "right now" : "for your planned arrival"}: ${DAY_NAMES[selection.day]} at ${fmtTime(selection.time)} (Provo time).`);
    go("#areas");
  });
}
