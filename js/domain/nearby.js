// Nearby boundary centers; distances are straight-line estimates, not routes or eligibility.
export function validLocation(point) {
  return point && typeof point.latitude === "number" && typeof point.longitude === "number" &&
    Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

function center(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return null;
  const points = [];
  function visit(value) {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      if (validLocation({ latitude: value[1], longitude: value[0] })) points.push(value);
    } else value.forEach(visit);
  }
  visit(geometry.coordinates);
  if (!points.length) return null;
  const lats = points.map(p => p[1]), lngs = points.map(p => p[0]);
  return { latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

export function metersBetween(a, b) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function nearbyLots(features, position, permit = "", limit = 3) {
  if (!validLocation(position)) return [];
  const unique = new Map();
  for (const feature of features || []) {
    const p = feature.properties || {}, code = p.permit_typ;
    if (!code || ["R", "No BYU Parking"].includes(code) || (permit && code !== permit)) continue;
    const point = center(feature.geometry);
    if (!point) continue;
    const distanceMeters = metersBetween(position, point);
    if (distanceMeters > 5000) continue;
    const name = p.Lot_Type || (p.Lot ? `Lot ${p.Lot}` : null);
    if (!name) continue;
    const lotNumber = String(p.Lot ?? "").trim();
    const key = lotNumber ? `lot:${lotNumber}` : `${name}|${code}`;
    const item = { feature, name, permit: code, description: p.Descriptio || "Check posted signs.", point, distanceMeters };
    if (!unique.has(key) || distanceMeters < unique.get(key).distanceMeters) unique.set(key, item);
  }
  return [...unique.values()].sort((a,b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name)).slice(0, limit);
}

// A nearby center is only a prompt to review, never proof of arrival or permission.
export function arrivalSuggestion(lots, position, areas) {
  if (!Number.isFinite(position?.accuracy) || position.accuracy < 0 || position.accuracy > 50) return null;
  for (const lot of lots || []) {
    if (!Number.isFinite(lot.distanceMeters) || lot.distanceMeters > 60) continue;
    const area = (areas || []).find(a => !a.is_sample_data && a.source_feature_id === lot.feature?.properties?.OBJECTID);
    if (area) return area;
  }
  return null;
}
