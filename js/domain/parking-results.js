import { evaluate } from "./eligibility.js";
import { byName } from "./area-list.js";

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Parking rules use Provo's local day/time, even on a device in another time zone.
export function parkingSelection(find, now = new Date()) {
  if (!find.live) return { ...find };
  const parts = Object.fromEntries(clock.formatToParts(now).map(p => [p.type, p.value]));
  return { ...find, day: days.indexOf(parts.weekday), time: `${parts.hour}:${parts.minute}` };
}

export function eligibleAreas(areas, rulesByArea, selection) {
  return areas.filter(area => !area.is_sample_data && ["ok", "limit"].includes(
    evaluate(rulesByArea.get(area.area_id) || [], selection.permitId, selection.day, selection.time).kind
  )).sort(byName);
}

export function eligibleMapFeatures(features, areas) {
  const ids = new Set(areas.filter(area => area.operator === "BYU" && Number.isInteger(area.source_feature_id)).map(area => area.source_feature_id));
  // A lot code may describe several sections with different rules.
  return features.filter(feature => ids.has(feature.properties?.OBJECTID));
}
