// Draws Provo City's public parking facilities on the shared Leaflet map, with an
// accessible list. Kept separate from BYU eligibility: these are city records, not rules.
import { escapeHtml, directionsUrl } from "../lib/format.js";
import { validFacilities, facilitySummary } from "../domain/city-parking.js";

const CITY_COLOR = "#7a4fb5";
let layer, facilities = [], source = {};
const layersByIndex = [];
const byId = id => globalThis.document?.getElementById?.(id) ?? null;

export function cityPopupHtml(summary) {
  const directions = summary.center && directionsUrl(summary.center);
  return `<div class="lot-popup"><span class="lot-popup-type">Provo City · ${escapeHtml(summary.kind)}</span>` +
    `<h3>${escapeHtml(summary.name)}</h3><span class="lot-popup-permit">${escapeHtml(summary.spaces)}</span>` +
    `<p>${escapeHtml(summary.hours)}</p>` + (summary.notes ? `<p>${escapeHtml(summary.notes)}</p>` : "") +
    `<p class="lot-popup-caution">${escapeHtml(summary.caution)}</p>` +
    `<p class="lot-popup-source">${summary.sourceUrl ? `<a href="${escapeHtml(summary.sourceUrl)}" target="_blank" rel="noopener">Provo Parking</a> · ` : ""}${escapeHtml(summary.provenance)}</p>` +
    (directions ? `<p><a href="${escapeHtml(directions)}" target="_blank" rel="noopener">Get directions</a></p>` : "") + `</div>`;
}

function renderList(map) {
  const list = byId("city-lot-list");
  const count = byId("city-lot-count");
  if (count) count.textContent = String(facilities.length);
  if (!list) return;
  list.innerHTML = facilities.map((feature, index) => {
    const s = facilitySummary(feature, source);
    return `<li class="nearby-card"><div class="nearby-card-head"><h4>${escapeHtml(s.name)}</h4><span>${escapeHtml(s.kind)}</span></div>` +
      `<p class="nearby-category">${escapeHtml(s.spaces)} · ${escapeHtml(s.hours)}</p>` +
      (s.notes ? `<p class="nearby-description">${escapeHtml(s.notes)}</p>` : "") +
      `<button type="button" data-city-index="${index}">Show on map <span aria-hidden="true">↗</span></button></li>`;
  }).join("");
  list.onclick = event => {
    const control = event.target.closest("[data-city-index]");
    const index = control ? Number(control.dataset.cityIndex) : -1;
    const s = facilities[index] && facilitySummary(facilities[index], source);
    if (!s?.center) return;
    const toggle = byId("city-toggle");
    if (toggle && !toggle.checked) { toggle.checked = true; layer.addTo(map); }
    map.setView([s.center.latitude, s.center.longitude], 17);
    layersByIndex[index]?.openPopup();
    byId("parking-map")?.focus({ preventScroll: false });
  };
}

export async function initCityLayer(map, L = window.L, fetchImpl = fetch) {
  if (!map || !L || layer) return;
  const status = byId("city-status");
  try {
    const response = await fetchImpl("data/provo-city-parking.json");
    if (!response.ok) throw new Error(`City parking request failed (${response.status})`);
    const collection = await response.json();
    source = collection.source || {};
    facilities = validFacilities(collection);
    layer = L.geoJSON({ type: "FeatureCollection", features: facilities }, {
      style: () => ({ color: CITY_COLOR, weight: 1.6, dashArray: "5 4", fillColor: CITY_COLOR, fillOpacity: 0.16 }),
      onEachFeature: (feature, featureLayer) => {
        layersByIndex[facilities.indexOf(feature)] = featureLayer;
        featureLayer.bindPopup(cityPopupHtml(facilitySummary(feature, source)), { maxWidth: 280 });
      },
    }).addTo(map);
    const toggle = byId("city-toggle");
    if (toggle) {
      toggle.disabled = false;
      toggle.addEventListener("change", () => { if (toggle.checked) layer.addTo(map); else map.removeLayer(layer); });
    }
    const jump = byId("map-downtown");
    if (jump) { jump.disabled = false; jump.addEventListener("click", () => map.setView([40.2338, -111.6595], 16)); }
    renderList(map);
    if (status) status.textContent = `${facilities.length} public lots and garages from Provo City's parking map. Hours and limits are city records, not verified rules.`;
  } catch (error) {
    console.warn("[map] Provo city lots unavailable", error);
    if (status) status.textContent = "Downtown Provo lots are unavailable right now. BYU lots still work.";
  }
}
