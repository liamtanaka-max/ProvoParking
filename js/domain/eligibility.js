// Can this permit park in this area at this day and time?
// Pure functions: they take rule rows and return a result, so they can be unit tested
// without a browser or database (see tests/eligibility.test.js).
import { DAY_NAMES, fmtTime, fmtDuration } from "../lib/format.js";

const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayRanges(spec) {
  if (typeof spec !== "string" || !spec.trim()) return null;
  if (/^all$/i.test(spec.trim())) return [[0, 6]];
  const ranges = spec.split(",").map((part) => part.split("-").map((label) =>
    FULL_DAYS.findIndex((name, i) => [name.toLowerCase(), DAY_NAMES[i].toLowerCase()].includes(label.trim().toLowerCase()))));
  return ranges.every((range) => range.length <= 2 && range.every((day) => day >= 0)) ? ranges : null;
}

function minutesOf(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value)) return NaN;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function hasValidSchedule(rule) {
  if (!rule || !dayRanges(rule.days_of_week)) return false;
  if (!Number.isFinite(minutesOf(rule.start_time)) || !Number.isFinite(minutesOf(rule.end_time))) return false;
  const noBlock = rule.blocked_start == null && rule.blocked_end == null;
  return noBlock || (Number.isFinite(minutesOf(rule.blocked_start)) && Number.isFinite(minutesOf(rule.blocked_end)));
}

export function ruleAppliesOnDay(rule, dayIdx) {
  if (!Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) return false;
  return (dayRanges(rule?.days_of_week) || []).some(([a, b]) => {
    if (b === undefined) return dayIdx === a;
    return a <= b ? dayIdx >= a && dayIdx <= b : dayIdx >= a || dayIdx <= b;
  });
}

export function inWindow(minutes, start, end) { // end exclusive; handles overnight windows
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function ruleCoversTime(rule, minutes) { // start_time..end_time inclusive of 23:59
  const start = minutesOf(rule.start_time), end = minutesOf(rule.end_time);
  return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
}

export function ruleBlocksTime(rule, minutes) {
  return Boolean(rule.blocked_start && rule.blocked_end && inWindow(minutes, minutesOf(rule.blocked_start), minutesOf(rule.blocked_end)));
}

// rules = every parking_rule row for one area.
// Returns { kind: ok | limit | no-permit | blocked | pick | unknown, icon, text, rule }.
export function evaluate(rules, permitId, dayIdx, hhmm) {
  const minutes = minutesOf(hhmm);
  if (!Number.isFinite(minutes) || !Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) {
    return { kind: "unknown", icon: "?", text: "Choose a valid arrival day and time" };
  }
  const active = (rules || []).filter((r) => hasValidSchedule(r) && ruleAppliesOnDay(r, dayIdx) && ruleCoversTime(r, minutes));
  if (!active.length) return { kind: "unknown", icon: "?", text: "No rules on file for that time" };

  const mine = active.filter((r) => r.permit_id == null || r.permit_id === permitId);
  if (!mine.length) {
    return permitId == null
      ? { kind: "pick", icon: "?", text: "Choose a permit to check this area" }
      : { kind: "no-permit", icon: "✕", text: "Not covered by your permit" };
  }
  const usable = mine.filter((r) => !ruleBlocksTime(r, minutes));
  if (!usable.length) {
    const r = mine[0];
    return { kind: "blocked", icon: "✕", text: `No parking ${fmtTime(r.blocked_start)}–${fmtTime(r.blocked_end)}`, rule: r };
  }
  const best = usable.find((r) => !r.max_stay_minutes) || usable[0];
  // The existing BYU weekend rows describe visitors, not every driver's rights.
  if (best.permit_id == null && /normal weekends: visitors may park/i.test(best.rule_note || "")) {
    return { kind: "unknown", icon: "?", text: "Weekend eligibility unknown; check BYU rules and signs", rule: best };
  }
  const open = best.permit_id == null;
  if (best.max_stay_minutes) {
    return { kind: "limit", icon: "!", text: `${open ? "No permit restriction listed" : "Permit matches listed rule"}; ${fmtDuration(best.max_stay_minutes)} limit. Check signs`, rule: best };
  }
  return { kind: "ok", icon: "✓", text: open ? "No permit restriction listed; check signs" : "Permit matches listed rule; check signs", rule: best };
}

// Sort order for the Areas list: usable areas first.
export const KIND_ORDER = { ok: 0, limit: 1, pick: 2, unknown: 3, blocked: 4, "no-permit": 5 };
