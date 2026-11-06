// Loads everything the screens need from Supabase in one round trip.
// Reference data (areas, permits, rules, tow companies) is public. Favorites and the active
// My car session load only for a signed-in user, and row security returns only their rows.
import { state } from "../state.js";

export async function loadData() {
  const db = state.db;
  const version = state.authVersion;
  const userId = state.user?.userId ?? null;
  const none = Promise.resolve({ data: [], error: null });
  const [areasRes, favRes, permitRes, ruleRes, towRes, sessRes, destRes] = await Promise.all([
    db.from("parking_area").select("area_id, area_name, lot_code, operator, latitude, longitude, total_spaces, est_available_spaces, availability_updated_at, is_free, tow_company_id, is_sample_data, source_feature_id").order("area_name"),
    userId ? db.from("favorite_area").select("area_id").eq("user_id", userId) : none,
    db.from("permit").select("permit_id, permit_code, permit_name, issuer, description, cost_note, source_url, last_verified_on").order("permit_code"),
    db.from("parking_rule").select("rule_id, area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, source_url, last_verified_on, rule_note"),
    db.from("tow_company").select("tow_company_id, company_name, phone, is_sample_data"),
    userId ? db.from("parking_session").select("*").eq("user_id", userId).eq("status", "active").order("started_at", { ascending: false }).limit(1) : none,
    db.from("destination").select("destination_id, building_code, name").order("name"),
  ]);
  if (version !== state.authVersion) return false;
  for (const res of [areasRes, favRes, permitRes, ruleRes, towRes, sessRes, destRes]) if (res.error) throw res.error;

  state.areas = areasRes.data;
  state.permits = permitRes.data;
  state.destinations = destRes.data;
  state.favoriteIds = new Set(favRes.data.map((f) => f.area_id));
  state.towById = new Map(towRes.data.map((t) => [t.tow_company_id, t]));
  state.rulesByArea = new Map();
  for (const r of ruleRes.data) {
    if (!state.rulesByArea.has(r.area_id)) state.rulesByArea.set(r.area_id, []);
    state.rulesByArea.get(r.area_id).push(r);
  }
  state.activeSession = sessRes.data[0] || null;
  return true;
}

// Public reference data only, for the sign-up permit search before anyone is signed in.
export async function loadPermitChoices() {
  const { data, error } = await state.db.from("permit")
    .select("permit_id, permit_code, permit_name, issuer, description")
    .order("permit_id"); // table order: Y and G first
  if (error) throw error;
  return data;
}
