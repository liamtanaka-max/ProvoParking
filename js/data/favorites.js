// favorite_area reads and writes. Each call returns only what the database confirmed.
import { state, currentUserId } from "../state.js";

export async function addFavorite(areaId) {
  // .select() makes Supabase return the saved row, so we only show what the database confirmed.
  const { data, error } = await state.db.from("favorite_area")
    .insert({ user_id: currentUserId(), area_id: areaId }).select().single();
  if (error) throw error;
  return data;
}

export async function removeFavorite(areaId) {
  const { data, error } = await state.db.from("favorite_area").delete()
    .eq("user_id", currentUserId()).eq("area_id", areaId).select();
  if (error) throw error;
  if (!data.length) throw new Error("The database did not remove the favorite.");
}
