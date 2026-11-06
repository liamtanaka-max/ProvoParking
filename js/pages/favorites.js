// Page: Favorites — areas saved with the heart (favorite_area).
import { state } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { cardHtml } from "../components/area-card.js";
import { addFavorite, removeFavorite } from "../data/favorites.js";

export function renderFavorites() {
  const favs = state.areas.filter((a) => state.favoriteIds.has(a.area_id));
  $("fav-list").innerHTML = favs.map(area => cardHtml(area, { showDirections: true })).join("");
  $("fav-empty").hidden = favs.length > 0;
  $("fav-count").textContent = favs.length;
}

// The heart button appears on several pages, so the click handler lives here.
export async function toggleFavorite(areaId, button, { renderViews }) {
  const version = state.authVersion;
  button.disabled = true;
  const area = state.areas.find((a) => a.area_id === areaId);
  try {
    if (state.favoriteIds.has(areaId)) {
      await removeFavorite(areaId);
      if (version !== state.authVersion) return;
      state.favoriteIds.delete(areaId);
      setStatus(`Removed ${area.area_name} from favorites.`);
    } else {
      const row = await addFavorite(areaId);
      if (version !== state.authVersion) return;
      state.favoriteIds.add(row.area_id);
      setStatus(`Saved ${area.area_name} to favorites.`);
    }
    renderViews();
    document.querySelector(`#view-${state.currentView}:not([hidden]) .heart[data-area-id="${areaId}"]`)?.focus();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    setStatus(`Could not update favorites: ${err.message}`, true);
    button.disabled = false;
  }
}
