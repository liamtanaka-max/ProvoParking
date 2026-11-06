// Tiny DOM helpers.
export const $ = (id) => document.getElementById(id);

export function setStatus(message, isError = false) {
  const el = $("status");
  el.textContent = message;
  el.classList.toggle("error", isError);
}
