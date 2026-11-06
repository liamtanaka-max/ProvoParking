import { escapeHtml } from "../lib/format.js";

import { nearbyLots, arrivalSuggestion } from "../domain/nearby.js";
import { createLocationTracker } from "../lib/location.js";
import { state } from "../state.js";
import { eligibleAreas, eligibleMapFeatures, parkingSelection } from "../domain/parking-results.js";
import { initCityLayer } from "./city-layer.js";

let map;
let features = [], tracker, latestPosition = null, nearby = [], userMarker, accuracyRing;
let boundaryLayer, visibleFeatures = [];
const lotLayers = new Map();

function clearUserLocation() {
  if (userMarker) map.removeLayer(userMarker);
  if (accuracyRing) map.removeLayer(accuracyRing);
  userMarker = accuracyRing = null;
}

function updateArrivalSuggestion(element, candidate) {
  if (!element) return;
  const html = candidate ? `<strong>You may be near ${escapeHtml(candidate.area_name)}.</strong> Location is approximate. <a href="#area/${encodeURIComponent(candidate.area_id)}">Review this lot and confirm before starting a timer</a>.` : "";
  if (element.innerHTML === html) return;
  const hadFocus = element.contains(document.activeElement);
  element.innerHTML = html;
  element.hidden = !candidate;
  if (hadFocus) document.getElementById("locate-me")?.focus();
}

function renderNearby() {
  const list = document.getElementById("nearby-list");
  if (!list) return;
  const controls = document.getElementById("nearby-controls");
  const empty = document.getElementById("nearby-empty");
  const suggestion = document.getElementById("arrival-suggestion");
  controls.hidden = !latestPosition;
  if (!latestPosition) { list.innerHTML = ""; empty.hidden = true; updateArrivalSuggestion(suggestion, null); nearby = []; return; }
  const activeButton = document.activeElement?.closest?.("[data-nearby-index]");
  const focusedLot = activeButton && list.contains(activeButton) ? nearby[Number(activeButton.dataset.nearbyIndex)] : null;
  nearby = nearbyLots(visibleFeatures, latestPosition, document.getElementById("nearby-permit").value);
  const candidate = state.find.live ? arrivalSuggestion(nearby, latestPosition, state.areas) : null;
  updateArrivalSuggestion(suggestion, candidate);
  empty.hidden = nearby.length > 0;
  empty.textContent = "No matching mapped sections in this category within 5 km. Try another category or check your permit and parking time.";
  list.innerHTML = nearby.map((lot, index) => {
    const distance = lot.distanceMeters < 1000 ? `${Math.max(10, Math.round(lot.distanceMeters / 10) * 10)} m` : `${(lot.distanceMeters / 1000).toFixed(1)} km`;
    return `<li class="nearby-card"><div class="nearby-card-head"><h4>${escapeHtml(lot.name)}</h4><span>~${distance}</span></div><p class="nearby-category">Lot category ${escapeHtml(lot.permit)} · Matches listed rules; check signs</p><p class="nearby-description">${escapeHtml(lot.description)}</p><button type="button" data-nearby-index="${index}">Show lot on map <span aria-hidden="true">↗</span></button></li>`;
  }).join("");
  if (focusedLot) {
    const index = nearby.findIndex(lot => lot.name === focusedLot.name && lot.permit === focusedLot.permit);
    if (index >= 0) list.querySelector(`[data-nearby-index="${index}"]`)?.focus({ preventScroll: true });
    else document.getElementById("nearby-permit").focus({ preventScroll: true });
  }
}

function initLocation() {
  const button = document.getElementById("locate-me");
  if (!button || tracker) return;
  button.disabled = false;
  let firstFix = true;
  tracker = createLocationTracker({ geolocation: window.navigator?.geolocation, onChange: update => {
    const wasLive = Boolean(latestPosition);
    latestPosition = update.position;
    const active = update.status === "live" || update.status === "waiting";
    button.textContent = active ? "Stop tracking" : "Use my location";
    button.setAttribute("aria-pressed", String(active));
    document.getElementById("location-status").textContent = update.message;
    document.getElementById("location-status").classList.toggle("is-live", update.status === "live");
    if (latestPosition) {
      const point = [latestPosition.latitude, latestPosition.longitude];
      const L = window.L;
      if (!userMarker) {
        accuracyRing = L.circle(point, { radius: latestPosition.accuracy, color: "#3168dc", weight: 1, fillOpacity: 0.07, interactive: false }).addTo(map);
        userMarker = L.circleMarker(point, { radius: 8, color: "#ffffff", weight: 3, fillColor: "#3168dc", fillOpacity: 1 }).bindPopup("Your current location").addTo(map);
      } else {
        userMarker.setLatLng(point);
        accuracyRing.setLatLng(point).setRadius(latestPosition.accuracy);
      }
      if (firstFix) { map.setView(point, 16); firstFix = false; }
    } else {
      if (wasLive) clearUserLocation();
      firstFix = true;
    }
    renderNearby();
    if (typeof document.dispatchEvent === "function") document.dispatchEvent(new CustomEvent("map:location"));
  } });
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-pressed") === "true") tracker.stop(); else tracker.start();
  });
  const select = document.getElementById("nearby-permit");
  const codes = [...new Set(features.map(f => f.properties?.permit_typ).filter(code => code && !["R", "No BYU Parking"].includes(code)))].sort();
  select.innerHTML = '<option value="">All matching categories</option>' + codes.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join("");
  select.addEventListener("change", renderNearby);
  document.getElementById("nearby-list").addEventListener("click", event => {
    const control = event.target.closest("[data-nearby-index]");
    const lot = control && nearby[Number(control.dataset.nearbyIndex)];
    if (!lot) return;
    map.setView([lot.point.latitude, lot.point.longitude], 17);
    lotLayers.get(lot.feature)?.openPopup();
    document.getElementById("parking-map").focus({ preventScroll: false });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseMapLocation();
    else if (state.currentView === "areas" && document.getElementById("auth-screen")?.hidden) tracker.resume();
  });
  window.addEventListener("pagehide", pauseMapLocation);
}

/** The live location from "Use my location", or null. Used to sort the Areas list by distance. */
export function currentPosition() { return latestPosition; }

// Popup for one mapped section: what the GIS layer says, plus links into the app for the
// matching sections of the current list (Rules & details).
function popupHtml(feature) {
  const p = feature.properties || {};
  const matches = state.areas.filter((area) => area.source_feature_id === p.OBJECTID && !area.is_sample_data);
  const links = matches.map((area) => `<a class="lot-popup-link" href="#area/${area.area_id}">Rules &amp; details${matches.length > 1 ? ` · ${escapeHtml(area.area_name)}` : ""} →</a>`).join("");
  return `<div class="lot-popup"><span class="lot-popup-type">${escapeHtml(p.Map_Catego || "Parking boundary")}</span><h3>${escapeHtml(matches.length === 1 ? matches[0].area_name : (p.Lot_Type || "BYU parking area"))}</h3><span class="lot-popup-permit">Lot category ${escapeHtml(p.permit_typ || "not recorded")}</span><p>${escapeHtml(p.Descriptio || "See posted signage.")}</p>${links}</div>`;
}

/** "Show on map" from an Areas card: zoom to that section's boundary and open its popup. */
export function showAreaOnMap(area) {
  if (!map || !area) return false;
  const feature = visibleFeatures.find((f) => f.properties?.OBJECTID === area.source_feature_id);
  const layer = feature && lotLayers.get(feature);
  if (!layer) return false;
  const el = document.getElementById("parking-map");
  el?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  if (layer.getBounds) map.fitBounds(layer.getBounds(), { maxZoom: 18, padding: [24, 24] });
  layer.openPopup();
  el?.focus?.({ preventScroll: true });
  return true;
}

export function pauseMapLocation() {
  tracker?.pause();
}

export function stopMapLocation() {
  tracker?.stop();
}

function setMapStatus(message) {
  const el = document.getElementById("map-status");
  if (el) el.textContent = message;
}

const categories = [
  { label: "Student · Y / G", color: "#3168dc", codes: ["Y", "G"] },
  { label: "Employee · A", color: "#b07b23", codes: ["A"] },
  { label: "Visitor · V", color: "#07859a", codes: ["V"] },
  { label: "Free · U", color: "#16806b", codes: ["U"] },
  { label: "Housing", color: "#8062b3", codes: ["B", "C", "D", "YM", "YV", "BCD"] },
  { label: "Timed · T / EV", color: "#c2643a", codes: ["T", "EV"] },
  { label: "Restricted / other", color: "#687589", codes: [] },
];

function boundaryStyle(feature) {
  const permit = feature?.properties?.permit_typ;
  const category = categories.find((item) => item.codes.includes(permit)) || categories.at(-1);
  return { color: category.color, weight: 1.6, fillColor: category.color, fillOpacity: 0.24 };
}

export async function initMap() {
  const el = document.querySelector("#parking-map");
  if (!el) return;
  if (!window.L) {
    el.hidden = true;
    setMapStatus("Map unavailable. Use the parking list to view rules and details.");
    return;
  }
  if (map) { refreshMap(); if (!document.hidden && document.getElementById("auth-screen")?.hidden) tracker?.resume(); return; }
  const L = window.L;
  try {
    map = L.map(el, { zoomControl: true, preferCanvas: true, scrollWheelZoom: true }).setView([40.2518, -111.6493], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map);

    const legend = document.getElementById("map-legend");
    if (legend) legend.innerHTML = categories.map((item) => `<li><span class="legend-dot" style="background:${item.color}" aria-hidden="true"></span>${escapeHtml(item.label)}</li>`).join("");
    const reset = document.getElementById("map-reset");
    if (reset) {
      reset.disabled = false;
      reset.addEventListener("click", () => map.setView([40.2518, -111.6493], 15));
    }
    refreshMap();
    initCityLayer(map, L);
    try {
      const response = await fetch("data/byu-campus-parking.json");
      if (!response.ok) throw new Error(`Boundary request failed (${response.status})`);
      const geometry = await response.json();
      if (geometry.type !== "FeatureCollection" || !Array.isArray(geometry.features)) throw new Error("Invalid boundary snapshot");
      features = geometry.features;
      boundaryLayer = L.geoJSON({ type: "FeatureCollection", features: [] }, {
        style: boundaryStyle,
        onEachFeature: (feature, layer) => {
          lotLayers.set(feature, layer);
          layer.bindPopup(() => popupHtml(feature), { maxWidth: 280 });
        }
      }).addTo(map);
      refreshMapEligibility();
      initLocation();
    } catch (error) {
      console.warn("[map] boundary snapshot unavailable", error);
      setMapStatus("Lot boundaries unavailable. The parking list is still available.");
    }
  } catch (error) {
    console.warn("[map] unavailable", error);
    if (map) map.remove();
    map = null;
    el.hidden = true;
    setMapStatus("Map unavailable. Use the parking list to view rules and details.");
  }
}

export function refreshMap() {
  if (map) setTimeout(() => map?.invalidateSize(), 0);
}

export function refreshMapEligibility(selection = parkingSelection(state.find), areas = eligibleAreas(state.areas, state.rulesByArea, selection)) {
  if (!map || !boundaryLayer) return;
  const next = eligibleMapFeatures(features, areas);
  if (next.length !== visibleFeatures.length || next.some((feature, index) => feature !== visibleFeatures[index])) {
    boundaryLayer.clearLayers();
    lotLayers.clear();
    boundaryLayer.addData({ type: "FeatureCollection", features: next });
    visibleFeatures = next;
  }
  setMapStatus(`${visibleFeatures.length} matching mapped ${visibleFeatures.length === 1 ? "boundary" : "boundaries"}`);
  renderNearby();
}
