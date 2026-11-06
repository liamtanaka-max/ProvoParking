// Search, sort and paging for the Areas list. Pure functions: no DOM, no database.
import { validLocation, metersBetween } from "./nearby.js";

// "Lot 1A" before "Lot 19Y" before "Lot 20A": compare numbers inside names as numbers.
export const byName = (a, b) => String(a.area_name).localeCompare(String(b.area_name), "en", { numeric: true, sensitivity: "base" });

export function areaPoint(area) {
  const num = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) ? Number(v) : NaN;
  const point = { latitude: num(area?.latitude), longitude: num(area?.longitude) };
  return validLocation(point) ? point : null;
}

export function matchesQuery(area, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [area.area_name, area.lot_code, area.operator].filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}

/**
 * Returns { items, total, sortedBy } where items is the filtered, sorted list (each item is the area,
 * plus distanceMeters when sorting by distance). Distance sort needs a valid position; without one,
 * it falls back to name order and reports sortedBy: "name".
 */
export function arrangeAreas(areas, { query = "", sort = "name", position = null } = {}) {
  const matched = (areas || []).filter((area) => matchesQuery(area, query));
  if (sort === "distance" && validLocation(position)) {
    const withDistance = matched.map((area) => {
      const point = areaPoint(area);
      return { area, distanceMeters: point ? metersBetween(position, point) : Infinity };
    });
    withDistance.sort((a, b) => a.distanceMeters - b.distanceMeters || byName(a.area, b.area));
    return { items: withDistance.map(({ area, distanceMeters }) => ({ ...area, distanceMeters })), total: matched.length, sortedBy: "distance" };
  }
  return { items: [...matched].sort(byName), total: matched.length, sortedBy: "name" };
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.max(50, Math.round(meters * 3.28084 / 50) * 50)} ft` : `${miles.toFixed(1)} mi`;
}
