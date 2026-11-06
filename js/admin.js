import { adminIdentity, METRICS, metricPresentation } from "./domain/admin.js";
import { escapeHtml } from "./lib/format.js";

const $ = id => document.getElementById(id);
let client, version = 0, timer, signedIn = false, loading = false;
const status = (text, error = false) => { $("admin-status").textContent = text; $("admin-status").classList.toggle("error", error); };

function clearMetrics() {
  version++;
  signedIn = false;
  clearTimeout(timer);
  $("metric-help").close();
  $("admin-dashboard").hidden = true;
  $("okr-one").innerHTML = $("okr-two").innerHTML = "";
  $("admin-updated").textContent = "";
  document.title = "Admin sign in · Provo Parking";
}
function showLogin(message = "", error = false) {
  clearMetrics();
  $("admin-login").hidden = false;
  $("admin-logout").hidden = true;
  $("admin-password").value = "";
  status(message, error);
}
function renderMetrics(data) {
  const coverage = [
    `${data.signups} signed-up users`,
    `${data.favorites_count} saved spots across ${data.signups} users`,
    `${data.distance_sessions} of ${data.total_sessions} real-lot sessions measured`,
    `${data.parking_sessions} of ${data.total_sessions} real-lot sessions matched to a visit`,
  ];
  const cards = METRICS.map((metric, index) => {
    const result = metricPresentation(metric, data[metric.key]);
    const target = metric.lower ? metric.strict ? "Under" : "At most" : "At least";
    return `<article class="metric-card" aria-labelledby="metric-${metric.key}">
      <div class="metric-heading"><div><p class="eyebrow">${metric.kr}</p><h3 id="metric-${metric.key}">${metric.title}</h3></div>
      <button type="button" class="metric-help" data-help="${index}" aria-haspopup="dialog" aria-label="Explain ${metric.kr}: ${metric.title}">?</button></div>
      <p class="metric-value">${escapeHtml(result.value)} <span class="metric-unit">${metric.unit}</span></p>
      <p class="hint">Target: ${target.toLowerCase()} ${metric.target} ${metric.unit}</p>
      <p class="metric-status ${result.kind}">${result.status}</p><p class="hint">${escapeHtml(coverage[index])}</p></article>`;
  });
  // Restore a focused explanation button after background updates.
  for (const [id, content] of [["okr-one", cards.slice(0, 2).join("")], ["okr-two", cards.slice(2).join("")]]) {
    const active = document.activeElement;
    const helpIndex = $(id).contains(active) ? active.dataset.help : undefined;
    $(id).innerHTML = content;
    if (helpIndex !== undefined) $(id).querySelector(`[data-help="${helpIndex}"]`)?.focus({ preventScroll: true });
  }
  $("admin-updated").textContent = `Last updated ${new Date(data.measured_at).toLocaleString()}.`;
}
function scheduleRefresh() {
  clearTimeout(timer);
  if (signedIn && !document.hidden) timer = setTimeout(() => void refresh(), 30000);
}
async function refresh(initial = false) {
  if (loading || !client) return;
  loading = true;
  const current = version;
  $("admin-refresh").disabled = true;
  status(initial ? "Checking admin access…" : "Updating metrics…");
  try {
    const { data, error } = await client.rpc("get_admin_okr_metrics");
    if (current !== version) return;
    if (error) throw error;
    if (!data || !data.measured_at) throw new Error("Invalid metrics response");
    signedIn = true;
    $("admin-login").hidden = true;
    $("admin-dashboard").hidden = false;
    $("admin-logout").hidden = false;
    document.title = "Admin dashboard · Provo Parking";
    renderMetrics(data);
    status("Metrics are up to date.");
    if (initial) $("admin-title").focus();
  } catch (error) {
    if (current !== version) return;
    if (["42501", "PGRST301", "PGRST302", "PGRST303"].includes(error.code)) {
      showLogin("Admin access could not be verified. Sign in with an authorized admin account.", true);
      await client.auth.signOut({ scope: "local" }).catch(() => {});
    } else {
      // Never render invented zeros when the database is unavailable.
      $("okr-one").innerHTML = $("okr-two").innerHTML = "";
      $("admin-updated").textContent = "";
      status("Metrics could not be loaded. Check your connection and try again. If this is the first setup, ask the project owner to apply the admin tracking migration.", true);
    }
  } finally {
    loading = false;
    $("admin-refresh").disabled = false;
    scheduleRefresh();
  }
}

$("admin-login-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!client || loading) return;
  let email;
  try { email = adminIdentity($("admin-username").value); }
  catch (error) { status(error.message, true); $("admin-username").focus(); return; }
  $("admin-submit").disabled = true;
  status("Signing in…");
  try {
    const { error } = await client.auth.signInWithPassword({ email, password: $("admin-password").value });
    $("admin-password").value = "";
    if (error) { status("Sign-in failed. Check your username and password and try again.", true); return; }
    await refresh(true);
  } catch { status("Sign-in is unavailable. Please try again.", true); }
  finally { $("admin-submit").disabled = false; }
});
$("admin-logout").addEventListener("click", async () => {
  clearMetrics();
  $("admin-logout").disabled = true;
  status("Logging out…");
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
    window.location.replace("index.html#login");
  } catch {
    // Data is cleared immediately. Keep a way to retry if logout could not finish.
    status("Could not finish logging out. Please try Log out again.", true);
    $("admin-logout").disabled = false;
  }
});
$("admin-refresh").addEventListener("click", () => void refresh());
document.addEventListener("click", event => {
  const button = event.target.closest("[data-help]");
  if (!button) return;
  const metric = METRICS[Number(button.dataset.help)];
  $("metric-help-title").textContent = `${metric.kr}: ${metric.title}`;
  $("metric-help-text").textContent = metric.help;
  $("metric-help").showModal();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(timer);
  else if (signedIn) void refresh();
});
window.addEventListener("pagehide", () => { clearTimeout(timer); clearMetrics(); });
window.addEventListener("pageshow", event => { if (event.persisted && client) void refresh(true); });

(async () => {
  const config = window.APP_CONFIG;
  if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY || !window.supabase) {
    showLogin("Admin sign-in is not configured. Ask the project owner to check config.js.", true); return;
  }
  // Admin tokens stay in this tab's memory; no shared browser password or long-lived storage.
  client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, storageKey: "provoParking.admin", autoRefreshToken: true, detectSessionInUrl: false },
  });
  client.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT" && signedIn) showLogin("Your admin session ended. Please sign in again.");
  });
  showLogin();
  $("admin-submit").disabled = false;
})();
