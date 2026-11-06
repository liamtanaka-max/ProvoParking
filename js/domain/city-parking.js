// Provo City parking facilities (official city GIS snapshot). Pure helpers, no DOM.
// These records are NOT eligibility rules: hours and notes are what the city recorded,
// so the app always labels them unverified and never says "you may park here".

function ringPoints(geometry) {
  if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates?.[0])) return [];
  return geometry.coordinates[0].filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
}

export function facilityCenter(feature) {
  const points = ringPoints(feature?.geometry);
  if (points.length < 3) return null;
  const lats = points.map(p => p[1]), lngs = points.map(p => p[0]);
  return { latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

// Keep only well-formed facilities with a name and a drawable outline.
export function validFacilities(collection) {
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) return [];
  return collection.features.filter(f => typeof f?.properties?.name === "string" && f.properties.name.trim() && facilityCenter(f));
}

// Plain-language facts for a popup or list card. Missing values say "unknown", never a guess.
export function facilitySummary(feature, source = {}) {
  const p = feature.properties;
  return {
    name: p.name.trim(),
    kind: p.kind === "garage" ? "Parking garage" : "Surface lot",
    spaces: Number.isInteger(p.spaces) && p.spaces > 0 ? `${p.spaces} spaces recorded by the city` : "Space count unknown",
    hours: p.recorded_hours ? `Recorded hours: ${p.recorded_hours}` : "Hours unknown",
    notes: p.notes || null,
    caution: "Rules not verified by this app. Check posted signs.",
    provenance: `Provo City record edited ${p.city_edited_on || "date unknown"} · checked ${source.checked_on || "date unknown"}`,
    sourceUrl: source.info_url || source.url || null,
    center: facilityCenter(feature),
  };
}
