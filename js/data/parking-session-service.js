import { ParkingSessionError, validateSessionPreferences, sessionFromRow } from "../domain/session-contract.js";

function databaseError(error) {
  if (error.code === "23505") return new ParkingSessionError("End your existing parking session before starting another.", "ACTIVE_SESSION_EXISTS", 409);
  if (error.code === "P0002") return new ParkingSessionError("Parking session not found.", "SESSION_NOT_FOUND", 404);
  if (error.code === "42501") return new ParkingSessionError("You do not have permission to use this session.", "SESSION_FORBIDDEN", 403);
  if (["23514", "23502", "22003", "22P02", "22001"].includes(error.code)) return new ParkingSessionError("The database rejected invalid parking preferences.", "INVALID_SESSION", 400);
  return new ParkingSessionError("Parking session storage is unavailable. Please try again.", "SESSION_STORAGE_UNAVAILABLE", 503);
}

/** Inject the app's Supabase client with a real user session, never a service-role client. */
export function createParkingSessionService(client) {
  async function request(name, args = {}) {
    let identity;
    try { identity = await client.auth.getUser(); }
    catch { throw new ParkingSessionError("Could not verify your sign-in. Please try again.", "SESSION_STORAGE_UNAVAILABLE", 503); }
    if (identity.error || !identity.data?.user?.id) {
      if (identity.error?.status >= 500) throw databaseError(identity.error);
      throw new ParkingSessionError("Sign in before using saved parking sessions.", "AUTH_REQUIRED", 401);
    }
    let result;
    try { result = await client.rpc(name, args); }
    catch { throw databaseError({}); }
    if (result.error) throw databaseError(result.error);
    return result.data;
  }
  return {
    async createSession(input) {
      const setup = validateSessionPreferences(input);
      const rows = await request("p7_create_parking_session", {
        p_location_name: setup.location.name, p_location_id: setup.location.id,
        p_latitude: setup.location.coordinates?.latitude ?? null,
        p_longitude: setup.location.coordinates?.longitude ?? null,
        p_is_sample: setup.location.isSample, p_duration_minutes: setup.durationMinutes,
        p_reminder_minutes_before: setup.reminderMinutesBefore, p_notes: setup.notes,
      });
      if (!rows?.[0]) throw databaseError({});
      return sessionFromRow(rows[0]);
    },
    async getActiveSession() {
      const rows = await request("p7_get_active_parking_session");
      return rows?.[0] ? sessionFromRow(rows[0]) : null;
    },
    async endSession(id) {
      if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new ParkingSessionError("A valid parking session ID is required.", "INVALID_SESSION", 400);
      }
      const rows = await request("p7_end_parking_session", { p_session_id: id });
      if (!rows?.[0]) throw new ParkingSessionError("Parking session not found.", "SESSION_NOT_FOUND", 404);
      return sessionFromRow(rows[0]);
    },
  };
}
