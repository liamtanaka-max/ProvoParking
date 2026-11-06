// "Find your permit" search on the sign-up screen. Pure function, unit tested.
// Matches the start of any word in the permit's code, name, issuer or description, so "y" finds
// the Y permits but not "Cit*y* of Provo". Exact codes rank first ("Y"), then code prefixes ("YM"),
// then name words ("grad" -> Graduate), then other words ("Wymount" in a description).

const words = (text) => String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function matchPermits(permits, query = "", excludeIds = []) {
  const q = String(query).trim().toLowerCase();
  const exclude = new Set(excludeIds.map(Number));
  const open = permits.filter((p) => !exclude.has(Number(p.permit_id)));
  if (!q) return open;

  const multiWord = /\s/.test(q);
  const matches = (p) => multiWord
    ? [p.permit_code, p.permit_name, p.issuer, p.description].filter(Boolean).join(" ").toLowerCase().includes(q)
    : [p.permit_code, p.permit_name, p.issuer, p.description].some((field) => words(field).some((w) => w.startsWith(q)));
  const rank = (p) => {
    const code = String(p.permit_code || "").toLowerCase();
    if (code === q) return 0;
    if (code.startsWith(q)) return 1;
    if (words(p.permit_name).some((w) => w.startsWith(q))) return 2;
    return 3;
  };
  return open
    .filter(matches)
    .map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => a.r - b.r || a.i - b.i) // stable: keep table order within a rank
    .map(({ p }) => p);
}
