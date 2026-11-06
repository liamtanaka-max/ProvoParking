// Home (Areas) layout: full-screen map with a permit chip and a pull-up sheet for the list.
// Layout only: the map itself (js/pages/map.js) is unchanged. This file moves the sheet between
// "peek" (one line), "half" and "full" on phones, keeps it open as a side panel on laptops,
// and tells Leaflet to redraw (refreshMap) whenever the map's box changes size.
import { DAY_NAMES, fmtTime } from "../lib/format.js";
import { refreshMap } from "./map.js";

const STATES = ["peek", "half", "full"];
const DESKTOP = "(min-width: 980px)";
let sheet, handle, ready = false;

const isDesktop = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(DESKTOP).matches);

export function setSheet(next) {
  if (!sheet) return;
  sheet.dataset.state = next;
  sheet.style.removeProperty("--drag-y");
  const open = next !== "peek";
  handle.setAttribute("aria-expanded", String(open || isDesktop()));
  document.getElementById("sheet-action").textContent = open ? "Hide list" : "Show list";
}

// Text on the permit chip and the sheet's one-line summary. Called by renderAreas().
export function updateHomeChrome({ permit, selection, count }) {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const code = document.getElementById("chip-code");
  if (!code) return;
  const when = selection.live ? "Now" : `${DAY_NAMES[selection.day].slice(0, 3)} ${fmtTime(selection.time)}`;
  code.textContent = permit ? permit.permit_code : "P";
  document.getElementById("chip-text").textContent = permit ? `${permit.permit_code} · ${when}` : `Choose permit · ${when}`;
  document.getElementById("permit-chip").setAttribute("aria-label",
    `${permit ? permit.permit_name : "No permit chosen"}, ${selection.live ? "right now" : `${DAY_NAMES[selection.day]} at ${fmtTime(selection.time)}`}. Change permit or time`);
  document.getElementById("sheet-title").textContent =
    `${count} ${count === 1 ? "area matches" : "areas match"} ${permit ? "your permit" : "for everyone"}`;
}

// Drag the handle (or tap it) to move the sheet. Positions are measured from the sheet's own height.
function initDrag() {
  let startY = null, startOffset = 0, moved = false, height = 0;
  const offsetFor = (state) => {
    const peek = handle.offsetHeight;
    return state === "full" ? 0 : state === "half" ? height * 0.45 : height - peek;
  };
  handle.addEventListener("pointerdown", (e) => {
    if (isDesktop() || e.button > 0) return;
    height = sheet.offsetHeight;
    startY = e.clientY;
    startOffset = offsetFor(sheet.dataset.state);
    moved = false;
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 6) moved = true;
    if (!moved) return;
    const y = Math.min(Math.max(startOffset + dy, 0), offsetFor("peek"));
    sheet.classList.add("dragging");
    sheet.style.setProperty("--drag-y", `${y}px`);
  });
  const end = (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    startY = null;
    sheet.classList.remove("dragging");
    if (!moved) return; // a tap: handled by the click listener
    const y = Math.min(Math.max(startOffset + dy, 0), offsetFor("peek"));
    const nearest = STATES.reduce((best, s) => Math.abs(offsetFor(s) - y) < Math.abs(offsetFor(best) - y) ? s : best, "peek");
    setSheet(nearest);
    handle.dataset.dragged = "1"; // swallow the click that follows a drag
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("click", () => {
    if (handle.dataset.dragged) { delete handle.dataset.dragged; return; }
    if (isDesktop()) return;
    const next = { peek: "half", half: "full", full: "peek" }[sheet.dataset.state] || "half";
    setSheet(next);
  });
}

export function initHomeSheet() {
  if (ready || typeof document === "undefined" || typeof document.getElementById !== "function") return;
  sheet = document.getElementById("home-sheet");
  handle = document.getElementById("sheet-handle");
  if (!sheet || !handle) return;
  ready = true;
  initDrag();

  // Moving to a lot on the map: drop the sheet so the map is visible.
  document.getElementById("sheet-body").addEventListener("click", (e) => {
    if (!isDesktop() && e.target.closest("[data-map-area], [data-nearby-index], #map-reset, #map-downtown")) setSheet("peek");
  });
  // Keyboard users tabbing into the list open the sheet.
  document.getElementById("sheet-body").addEventListener("focusin", () => {
    if (!isDesktop() && sheet.dataset.state === "peek") setSheet("half");
  });
  // A quick tap on the map (not a pan) lowers an open sheet, like other map apps.
  const mapEl = document.getElementById("parking-map");
  let down = null;
  mapEl.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  mapEl.addEventListener("pointerup", (e) => {
    if (!down || isDesktop()) return;
    const still = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && Date.now() - down.t < 350;
    down = null;
    if (still && sheet.dataset.state === "full") setSheet("peek");
  });
  // Leaflet must redraw whenever the map's box changes (rotation, window size, phone ↔ laptop layout).
  if (typeof ResizeObserver === "function") new ResizeObserver(() => refreshMap()).observe(mapEl);
  window.matchMedia?.(DESKTOP).addEventListener?.("change", () => setSheet("peek"));
  setSheet("peek");
}
