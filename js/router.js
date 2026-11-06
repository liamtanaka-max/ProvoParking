// Hash routing: #find, #areas, #area/<id>, #favorites, #car, #help.
// To add a page: add a <section id="view-NAME"> in index.html, a tab button, the name here,
// and a render call in renderViews() or showView().
import { state } from "./state.js";
import { $ } from "./lib/dom.js";
import { renderAreas } from "./pages/areas.js";
import { renderAreaDetail } from "./pages/area-detail.js";
import { renderFavorites } from "./pages/favorites.js";
import { renderCar, stopTimer } from "./pages/car.js";

import { initMap, pauseMapLocation } from "./pages/map.js";

export const VIEWS = ["find", "areas", "area", "favorites", "car", "help"];

// Re-draws every page that shows area cards (after data changes, e.g. a favorite).
export function renderViews() {
  renderAreas();
  renderFavorites();
  if (state.currentView === "area") renderAreaDetail(Number(location.hash.split("/")[1]));
}

export function showView() {
  if (!state.db || !state.areas.length && !state.permits.length) return; // data not loaded yet
  const [name] = (location.hash.replace(/^#/, "") || (state.find.permitId ? "areas" : "find")).split("/");
  state.currentView = VIEWS.includes(name) ? name : "find";
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== state.currentView;
  const tabFor = state.currentView === "area" ? "areas" : state.currentView;
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.view === tabFor) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  renderViews();
  if (state.currentView === "areas") void initMap(); else pauseMapLocation();
  if (state.currentView === "car") renderCar(); else stopTimer();
  document.querySelector(`#view-${state.currentView} h2[tabindex]`)?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

export function go(hash) {
  if (location.hash === hash) showView(); else location.hash = hash;
}
