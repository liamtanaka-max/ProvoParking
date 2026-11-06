// Page: sign up / log in. Shown instead of the app until someone signs in or continues as a guest.
//   Sign up: one screen. "Continue with Google", or email + password; "Create account" creates the
//   account right away, so a taken email or rejected password is shown on this same screen.
//   Then an optional "Which permit do you have?" step with Skip (also shown after a first Google sign-in).
//   Log in: Google, or email + password, Keep me signed in, Forgot password. Also: reset and new-password forms.
import { stopMapLocation } from "./map.js";
import { state } from "../state.js";
import { $ } from "../lib/dom.js";
import { escapeHtml } from "../lib/format.js";
import { checkEmail, checkPassword, describeAuthError } from "../domain/account.js";
import { matchPermits } from "../domain/permit-search.js";
import { loadPermitChoices } from "../data/load.js";
import * as auth from "../data/auth.js";

const VIEWS = {
  signup:  { form: "signup-form",  eyebrow: "Find parking you're allowed to use", title: "Create your account" },
  permits: { form: "permit-form",  eyebrow: "One last thing (optional)",          title: "Which permit do you have?" },
  login:   { form: "login-form",   eyebrow: "Please enter your details",          title: "Welcome back" },
  forgot:  { form: "forgot-form",  eyebrow: "We'll email you a link",             title: "Reset your password" },
  newpass: { form: "newpass-form", eyebrow: "Almost there",                       title: "Choose a new password" },
};
const APP_CHROME = ["app-header", "app-nav", "app-main", "app-footer"];

let hooks = { onSignedIn: async () => {}, onGuest: async () => {}, authStorage: null };

// ---------- showing and hiding ----------
export function showAuth(view, message = "", isError = false) {
  stopMapLocation();
  for (const id of APP_CHROME) $(id).hidden = true;
  $("auth-screen").hidden = false;
  $("auth-screen").dataset.view = view;
  for (const [name, v] of Object.entries(VIEWS)) $(v.form).hidden = name !== view;
  $("auth-eyebrow").textContent = VIEWS[view].eyebrow;
  $("auth-title").textContent = VIEWS[view].title;
  clearErrors();
  setMessage(message, isError);
  closePermitList();
  if (view === "signup" || view === "permits") void loadPermits(); // preload so the permit step opens instantly
  if (view === "login" && hooks.authStorage) $("li-remember").checked = hooks.authStorage.remember();
  const first = $(VIEWS[view].form).querySelector("input:not([type=checkbox]):not([type=radio])");
  if (first && !first.value && view !== "permits") first.focus();
  window.scrollTo(0, 0);
}

export function clearPasswords() {
  for (const id of ["su-password", "li-password", "np-password"]) {
    $(id).value = "";
    $(id).type = "password";
  }
  document.querySelectorAll("#auth-screen .pw-toggle").forEach(button => {
    button.textContent = "Show";
    button.setAttribute("aria-label", "Show password");
  });
}

export function hideAuth() {
  $("auth-screen").hidden = true;
  for (const id of APP_CHROME) $(id).hidden = false;
}

// Saving favorites or starting a timer needs an account. Guests are sent to sign-up.
export function requireAccount(message) {
  if (state.user) return true;
  showAuth("signup", message);
  return false;
}

// Only offer "Continue with Google" when the Supabase project has Google turned on.
export function setSignInOptions(settings) {
  const google = Boolean(settings?.google);
  for (const id of ["google-signup", "google-login"]) {
    $(id).hidden = !google;
    $(id).nextElementSibling.hidden = !google; // the "or" divider
  }
}

function setMessage(message, isError = false) {
  const el = $("auth-msg");
  el.hidden = !message;
  el.textContent = message || "";
  el.classList.toggle("error", isError);
}

// ---------- validation helpers ----------
function fieldError(id, message) {
  const input = $(id), err = $(`${id}-err`);
  if (err) err.textContent = message || "";
  if (input) {
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (message) input.setAttribute("aria-describedby", `${id}-err`); else input.removeAttribute("aria-describedby");
  }
  return !message;
}
function clearErrors() {
  document.querySelectorAll("#auth-screen .field-error").forEach((el) => { el.textContent = ""; });
  document.querySelectorAll("#auth-screen [aria-invalid]").forEach((el) => el.setAttribute("aria-invalid", "false"));
}
function focusFirstError(form) {
  $(form).querySelector('[aria-invalid="true"]')?.focus();
}
function busy(button, isBusy, text) {
  if (isBusy) { button.dataset.label = button.textContent; button.textContent = text; }
  else if (button.dataset.label) button.textContent = button.dataset.label;
  button.disabled = isBusy;
}
// Shows a Supabase error next to the right field, or at the top of the form.
function showAuthError(error, { action, emailField, passwordField }) {
  console.warn(error);
  const { field, message } = describeAuthError(error, { action });
  if (field === "email" && emailField) { fieldError(emailField, message); return $(emailField).focus(); }
  if (field === "password" && passwordField) { fieldError(passwordField, message); return $(passwordField).focus(); }
  setMessage(message, true);
}
// Checks a field as soon as the person leaves it, and clears the message as soon as they fix it.
function checkWhileTyping(id, check) {
  const input = $(id);
  input.addEventListener("blur", () => { if (input.value) fieldError(id, check(input.value)); });
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") fieldError(id, check(input.value));
  });
}

// ---------- permit search ----------
let permits = [];
let permitsRequest = null;
let selectedIds = [];
let shown = [];
let active = -1;

function loadPermits() {
  if (permitsRequest) return permitsRequest;
  permitsRequest = loadPermitChoices()
    .then((rows) => { permits = rows; renderOptions(); renderChips(); })
    .catch((err) => {
      console.error(err);
      permitsRequest = null; // allow a retry
      fieldError("permit-search", "Could not load the permit list. Check your connection and try again.");
    });
  return permitsRequest;
}

function renderOptions() {
  const list = $("permit-options"), input = $("permit-search");
  shown = matchPermits(permits, input.value, selectedIds);
  if (active >= shown.length) active = shown.length - 1;
  list.innerHTML = shown.length
    ? shown.map((p, i) => `
        <li role="option" id="permit-opt-${p.permit_id}" data-id="${p.permit_id}" aria-selected="${i === active}"
            class="combo-option${i === active ? " active" : ""}">
          <span class="code-badge">${escapeHtml(p.permit_code)}</span>
          <span class="opt-text"><span class="opt-name">${escapeHtml(p.permit_name)}</span>
          <span class="opt-desc">${escapeHtml(p.issuer || "")}${p.description ? ` · ${escapeHtml(p.description)}` : ""}</span></span>
        </li>`).join("")
    : `<li class="combo-empty">${!permits.length ? "Loading permits…"
        : selectedIds.length === permits.length ? "You've added every permit."
        : `No permits match "${escapeHtml(input.value.trim())}".`}</li>`;
  const current = shown[active];
  if (current) {
    input.setAttribute("aria-activedescendant", `permit-opt-${current.permit_id}`);
    $(`permit-opt-${current.permit_id}`)?.scrollIntoView({ block: "nearest" });
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}
function openPermitList() {
  $("permit-options").hidden = false;
  $("permit-search").setAttribute("aria-expanded", "true");
  renderOptions();
}
function closePermitList() {
  $("permit-options").hidden = true;
  $("permit-search").setAttribute("aria-expanded", "false");
  $("permit-search").removeAttribute("aria-activedescendant");
  active = -1;
}
function addPermit(id) {
  if (!selectedIds.includes(id)) selectedIds.push(id);
  $("permit-search").value = "";
  fieldError("permit-search", "");
  renderChips();
  closePermitList();
  $("permit-search").focus();
}
function removePermit(id) {
  selectedIds = selectedIds.filter((x) => x !== id);
  renderChips();
  $("permit-search").focus();
}
function renderChips() {
  $("permit-chips").innerHTML = selectedIds.map((id) => {
    const p = permits.find((x) => x.permit_id === id);
    return p ? `<li class="chip"><span class="code-badge">${escapeHtml(p.permit_code)}</span><span>${escapeHtml(p.permit_name)}</span>
      <button type="button" class="chip-remove" data-remove-permit="${id}" aria-label="Remove ${escapeHtml(p.permit_name)}">×</button></li>` : "";
  }).join("");
}

function initPermitSearch() {
  const input = $("permit-search"), list = $("permit-options");
  input.addEventListener("focus", openPermitList);
  input.addEventListener("input", () => { active = input.value.trim() ? 0 : -1; openPermitList(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) openPermitList();
      if (!shown.length) return;
      active = e.key === "ArrowDown" ? (active + 1) % shown.length : (active - 1 + shown.length) % shown.length;
      renderOptions();
    } else if (e.key === "Enter") {
      if (!list.hidden && shown[active]) { e.preventDefault(); addPermit(shown[active].permit_id); }
      else if (!list.hidden && input.value.trim()) e.preventDefault(); // don't submit a half-typed search
    } else if (e.key === "Escape") {
      closePermitList();
    } else if (e.key === "Backspace" && !input.value && selectedIds.length) {
      removePermit(selectedIds[selectedIds.length - 1]);
    }
  });
  input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) closePermitList(); }, 120));
  // mousedown, not click, so choosing an option doesn't blur the search box first
  list.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const opt = e.target.closest(".combo-option");
    if (opt) addPermit(Number(opt.dataset.id));
  });
  $("permit-toggle").addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (list.hidden) { input.focus(); openPermitList(); } else closePermitList();
  });
}

// ---------- optional permit step (after a new account, or a first Google sign-in) ----------
let permitStep = null; // { resolve, userId }

// Shows "Which permit do you have?" and resolves once the person saves or skips.
export function askForPermits(userId) {
  selectedIds = [];
  renderChips();
  $("permit-search").value = "";
  showAuth("permits");
  return new Promise((resolve) => { permitStep = { resolve, userId }; });
}

function finishPermitStep(permitIds) {
  const step = permitStep;
  permitStep = null;
  step?.resolve(permitIds);
}

async function onSavePermits(e) {
  e.preventDefault();
  clearErrors(); setMessage("");
  if (!permitStep) return;
  if (!selectedIds.length) {
    fieldError("permit-search", "Pick a permit from the list, or choose skip below.");
    return $("permit-search").focus();
  }
  const button = $("permit-submit");
  busy(button, true, "Saving…");
  try {
    await auth.savePermits(permitStep.userId, [...selectedIds]);
    finishPermitStep([...selectedIds]);
  } catch (err) {
    console.error(err);
    fieldError("permit-search", `Couldn't save your permit: ${describeAuthError(err).message}`);
  } finally {
    busy(button, false);
  }
}

// ---------- forms ----------
// A fresh sign-in starts at the default screen, not wherever the previous person left off.
function startAtHome() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

async function onSignUp(e) {
  e.preventDefault();
  clearErrors(); setMessage("");
  const email = $("su-email").value.trim();
  const ok = [
    fieldError("su-email", checkEmail(email)),
    fieldError("su-password", checkPassword($("su-password").value)),
  ].every(Boolean);
  if (!ok) return focusFirstError("signup-form");

  const button = $("su-submit");
  busy(button, true, "Creating account…");
  hooks.authStorage?.setRemember(true); // new accounts stay signed in on this device
  try {
    const { session } = await auth.signUp({ email, password: $("su-password").value });
    clearPasswords();
    if (session) {
      startAtHome();
      await hooks.onSignedIn(session, "Welcome! Your account is ready.", { isNew: true });
    } else {
      // Only if the project still requires email confirmation.
      $("li-email").value = email;
      showAuth("login", `Check your inbox: we sent a link to ${email}. Open it to finish creating your account.`);
    }
  } catch (err) {
    showAuthError(err, { action: "signup", emailField: "su-email", passwordField: "su-password" });
  } finally {
    busy(button, false);
  }
}

async function onLogIn(e) {
  e.preventDefault();
  clearErrors(); setMessage("");
  const email = $("li-email").value.trim();
  const ok = [
    fieldError("li-email", checkEmail(email)),
    fieldError("li-password", checkPassword($("li-password").value, { forLogin: true })),
  ].every(Boolean);
  if (!ok) return focusFirstError("login-form");
  const button = $("li-submit");
  busy(button, true, "Logging in…");
  hooks.authStorage?.setRemember($("li-remember").checked);
  try {
    const session = await auth.logIn(email, $("li-password").value);
    $("li-password").value = "";
    startAtHome();
    await hooks.onSignedIn(session);
  } catch (err) {
    showAuthError(err, { action: "login", emailField: "li-email" });
  } finally {
    busy(button, false);
  }
}

async function onGoogle(button) {
  clearErrors(); setMessage("");
  busy(button, true, "Opening Google…");
  const onLoginScreen = $("auth-screen").dataset.view === "login";
  hooks.authStorage?.setRemember(onLoginScreen ? $("li-remember").checked : true);
  try {
    startAtHome();
    await auth.signInWithGoogle(); // the browser leaves for Google here
  } catch (err) {
    busy(button, false);
    showAuthError(err, { action: "login" });
  }
}

async function onForgot(e) {
  e.preventDefault();
  clearErrors(); setMessage("");
  const email = $("fp-email").value.trim();
  if (!fieldError("fp-email", checkEmail(email))) return focusFirstError("forgot-form");
  const button = $("fp-submit");
  busy(button, true, "Sending…");
  try {
    await auth.sendPasswordReset(email);
    setMessage(`If an account exists for ${email}, a reset link is on its way.`);
  } catch (err) {
    showAuthError(err, { action: "reset", emailField: "fp-email" });
  } finally {
    busy(button, false);
  }
}

async function onNewPassword(e) {
  e.preventDefault();
  clearErrors(); setMessage("");
  if (!fieldError("np-password", checkPassword($("np-password").value))) return focusFirstError("newpass-form");
  const button = $("np-submit");
  busy(button, true, "Saving…");
  try {
    await auth.setNewPassword($("np-password").value);
    clearPasswords();
    const session = await auth.getCurrentSession();
    if (session) { startAtHome(); await hooks.onSignedIn(session, "Password updated."); }
    else showAuth("login", "Password updated. Log in with your new password.");
  } catch (err) {
    showAuthError(err, { action: "reset", passwordField: "np-password" });
  } finally {
    busy(button, false);
  }
}

export function initAuth({ onSignedIn, onGuest, authStorage }) {
  hooks = { onSignedIn, onGuest, authStorage };
  initPermitSearch();
  checkWhileTyping("su-email", checkEmail);
  checkWhileTyping("su-password", (v) => checkPassword(v));
  checkWhileTyping("li-email", checkEmail);
  $("signup-form").addEventListener("submit", onSignUp);
  $("permit-form").addEventListener("submit", onSavePermits);
  $("login-form").addEventListener("submit", onLogIn);
  $("forgot-form").addEventListener("submit", onForgot);
  $("newpass-form").addEventListener("submit", onNewPassword);

  $("auth-screen").addEventListener("click", (e) => {
    const google = e.target.closest(".google-btn");
    if (google) return void onGoogle(google);
    if (e.target.closest("#permit-skip")) return finishPermitStep([]);
    const go = e.target.closest("[data-auth-go]");
    if (go) {
      const view = go.dataset.authGo;
      if (view === "guest") return void hooks.onGuest();
      if (view === "forgot") $("fp-email").value = $("li-email").value;
      if (view === "login" && !$("li-email").value) $("li-email").value = $("su-email").value;
      return showAuth(view);
    }
    const remove = e.target.closest("[data-remove-permit]");
    if (remove) return removePermit(Number(remove.dataset.removePermit));
    const toggle = e.target.closest(".pw-toggle");
    if (toggle) {
      const input = $(toggle.dataset.for);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.textContent = show ? "Hide" : "Show";
      toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    }
  });
}
