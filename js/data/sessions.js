// parking_session reads and writes (the My car timer).
import { state, currentUserId } from "../state.js";

export async function startSession({ areaId, minutes, reminderMinutes, carNote, destinationId }) {
  if (!Number.isSafeInteger(destinationId) || destinationId <= 0) throw new Error("Choose a destination building before starting your timer.");
  const userId = currentUserId();
  // KR 2b visits come from state.visitTracker (visit_metrics), linked after a successful insert.
  const visitOwner = state.authId;
  const visit = state.visitTracker?.captureAccount?.(visitOwner);
  const row = {
    user_id: userId,
    destination_id: destinationId,
    area_id: areaId,
    planned_minutes: minutes,
    leave_by: new Date(Date.now() + minutes * 60000).toISOString(),
    reminder_minutes_before: reminderMinutes,
    car_note: carNote || null,
  };
  const { data, error } = await state.db.from("parking_session").insert(row).select().single();
  if (error) throw error;
  if (visit) void state.visitTracker?.accountStarted(data, visitOwner, visit);
  return data;
}

export async function endSession(session, expired) {
  const { data, error } = await state.db.from("parking_session")
    .update({ status: expired ? "expired" : "ended", ended_at: new Date().toISOString() })
    .eq("session_id", session.session_id).select();
  if (error) throw error;
  if (!data.length) throw new Error("The database did not end the session.");
}

export async function saveCarNote(session, note) {
  const { data, error } = await state.db.from("parking_session").update({ car_note: note })
    .eq("session_id", session.session_id).select().single();
  if (error) throw error;
  return data;
}
