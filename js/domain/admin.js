export function adminIdentity(username) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(normalized)) throw new Error("Use a username of 3–32 characters: start with a letter and use letters, numbers, dots, underscores or hyphens.");
  // This is an Auth identifier, not a mailbox. Provision it with the Auth admin API.
  // Knowing an identifier grants no privileges: the private database allowlist does.
  return `${normalized}@admin.provoparking.invalid`;
}

export const METRICS = [
  { key: "signups", kr: "KR 1a", title: "User sign-ups", target: 25, unit: "users", lower: false,
    help: "Number of signed-up app_user profiles linked to a real account. Demo profiles and authorized admin accounts are excluded. Target: at least 25 users." },
  { key: "favorites_average", kr: "KR 1b", title: "Favorite spots per user", target: 2, unit: "spots / user", lower: false,
    help: "Current favorite_area rows belonging to signed-up users divided by all signed-up users, including users with zero favorites. Removing a favorite reduces the count. Demo and admin accounts are excluded. Target: at least 2 per user." },
  { key: "distance_average_miles", kr: "KR 2a", title: "Parking-to-destination distance", target: 1, unit: "miles", lower: true, strict: true,
    help: "Mean straight-line distance in miles from each session’s parking_area coordinates to its saved destination building, using the haversine formula. Includes real lots and signed-up users; excludes sessions missing a destination, demo lots and admin accounts. Building and lot centers are approximate, not walking routes. Target: under 1 mile." },
  { key: "parking_average_minutes", kr: "KR 2b", title: "Time from app open to parking", target: 15, unit: "minutes", lower: true,
    help: "For each real-lot timer a signed-up user started in the main app, the minutes from the app visit linked to that session to the session’s server-stamped start, averaged. A visit opens when the app is first loaded in a browser tab (sign-in screen included) and is reused in that tab for up to an hour; each session links to that account’s latest visit opened in the hour before it started. Sessions with no linked visit, guest timers, demo lots and admins are excluded. Target: 15 minutes or less." },
];

export function metricPresentation(metric, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return { value: "—", status: "No data yet", kind: "empty" };
  const number = Number(value);
  const met = metric.lower ? metric.strict ? number < metric.target : number <= metric.target : number >= metric.target;
  const rounded = Number(number.toFixed(2));
  const label = rounded === metric.target && number !== metric.target
    ? `${number < metric.target ? "<" : ">"} ${metric.target}`
    : number.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return { value: metric.key === "signups" ? String(number) : label,
    status: met ? "Target met" : metric.lower ? "Above target" : "Building toward target",
    kind: met ? "met" : "pending" };
}
