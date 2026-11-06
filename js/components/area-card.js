// One parking area card, used on the Areas and Favorites pages.
import { state, rulesFor } from "../state.js";
import { escapeHtml, directionsUrl } from "../lib/format.js";
import { evaluate } from "../domain/eligibility.js";
import { parkingSelection } from "../domain/parking-results.js";
import { formatDistance } from "../domain/area-list.js";

export function availabilityText(area) {
  if (area.est_available_spaces == null) return { text: "Availability unknown", cls: "" };
  const pct = area.total_spaces ? area.est_available_spaces / area.total_spaces : 0;
  return {
    text: `About ${area.est_available_spaces} of ${area.total_spaces} spaces open (estimate)`,
    cls: pct < 0.1 ? "low" : "ok",
  };
}

export function evaluateArea(area) {
  const { permitId, day, time } = parkingSelection(state.find);
  return evaluate(rulesFor(area.area_id), permitId, day, time);
}

export function heartHtml(area) {
  const saved = state.favoriteIds.has(area.area_id);
  const label = saved ? `Remove ${area.area_name} from favorites` : `Save ${area.area_name} to favorites`;
  return `<button type="button" class="heart" data-area-id="${area.area_id}"
              aria-pressed="${saved}" aria-label="${escapeHtml(label)}">${saved ? "♥" : "♡"}</button>`;
}

export function cardHtml(area, { showDirections = false, showOnMap = false } = {}) {
  const avail = availabilityText(area);
  const ev = evaluateArea(area);
  const directions = showDirections ? directionsUrl(area, "driving") : null;
  return `
    <li class="card">
      <div class="card-body">
        <h3>${escapeHtml(area.area_name)}</h3>
        <p class="meta">${escapeHtml(area.operator)}${area.is_free ? " · Free" : ""}${Number.isFinite(area.distanceMeters) ? ` · <span class="distance">~${formatDistance(area.distanceMeters)} away</span>` : ""}</p>
        <p class="elig ${ev.kind}"><span aria-hidden="true">${ev.icon}</span> ${escapeHtml(ev.text)}</p>
        <p class="avail ${avail.cls}">${avail.text}</p>
        <div class="card-links">
          <a class="link" href="#area/${area.area_id}" aria-label="Rules &amp; details for ${escapeHtml(area.area_name)}">Rules &amp; details →</a>
          ${showOnMap && Number.isInteger(area.source_feature_id) ? `<button type="button" class="link-button" data-map-area="${area.area_id}" aria-label="Show ${escapeHtml(area.area_name)} on map">Show on map</button>` : ""}
        </div>
        ${showDirections ? `<div class="favorite-directions">
          ${directions ? `<a class="secondary" href="${escapeHtml(directions)}" target="_blank" rel="noopener noreferrer" aria-label="Get Directions to ${escapeHtml(area.area_name)} in Google Maps (opens in a new tab)">Get Directions <span aria-hidden="true">↗</span></a>
          <p class="hint">${area.is_sample_data ? "Sample location. " : ""}Opens Google Maps · ${area.is_sample_data ? "Sample lot center" : "Approximate section, not an entrance"}</p>` : `<p class="hint">Directions unavailable — this lot has no valid map location.</p>`}
        </div>` : ""}
      </div>
      ${heartHtml(area)}
    </li>`;
}
