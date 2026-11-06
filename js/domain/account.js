// Sign-up and log-in rules: input checks and plain-language error messages.
// Pure functions (no DOM, no database), unit tested in tests/account.test.js.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // Supabase Auth rejects longer passwords
export const NAME_MAX = 80;     // app_user.display_name is VARCHAR(80)

export function checkEmail(value) {
  const email = String(value ?? "").trim();
  if (!email) return "Enter your email address.";
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Enter a valid email address, like name@example.com.";
  return "";
}

export function checkPassword(value, { forLogin = false } = {}) {
  const password = String(value ?? "");
  if (!password) return "Enter your password.";
  if (forLogin) return "";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return "";
}

export function checkName(value) {
  const name = String(value ?? "").trim();
  if (!name) return "Enter your name.";
  if (name.length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  return "";
}

// Turns a Supabase Auth error into { field, message } for the form.
// field is "email", "password", or "" (show the message at the top of the form).
export function describeAuthError(error, { action = "signup" } = {}) {
  const code = String(error?.code || error?.error_code || "");
  const message = String(error?.message || error || "");
  const status = Number(error?.status || 0);
  const has = (re) => re.test(message);

  if (code === "invalid_credentials" || has(/invalid login credentials/i)) {
    return { field: "", message: "That email and password don't match. Try again, or reset your password." };
  }
  if (code === "email_not_confirmed" || has(/email not confirmed/i)) {
    return { field: "", message: "Confirm your email first. Open the link we emailed you, then log in." };
  }
  if (code === "user_already_exists" || code === "email_exists" || has(/already (been )?registered|already exists/i)) {
    return { field: "email", message: "An account with this email already exists. Log in instead." };
  }
  if (code === "weak_password" || has(/password should|password is too|weak password|password.*(characters|longer)/i)) {
    return { field: "password", message: message || "Choose a stronger password." };
  }
  if (code === "email_address_invalid" || code === "validation_failed" && has(/email/i) || has(/email address .* is invalid|unable to validate email/i)) {
    return { field: "email", message: "That email address can't be used. Check it and try again." };
  }
  if (code === "provider_disabled" || has(/provider is not enabled|unsupported provider/i)) {
    return { field: "", message: "Google sign-in isn't turned on yet. Use your email and a password for now." };
  }
  if (code === "over_email_send_rate_limit" || has(/email rate limit/i)) {
    return { field: "", message: "Too many account emails were sent in the last hour. Please try again later." };
  }
  if (code === "over_request_rate_limit" || status === 429 || has(/rate limit|too many requests/i)) {
    return { field: "", message: "Too many attempts in a short time. Wait a minute and try again." };
  }
  if (code === "signup_disabled" || has(/signups? not allowed|signups? (are )?disabled/i)) {
    return { field: "", message: "New accounts are turned off right now. Please try again later." };
  }
  if (code === "unexpected_failure" || has(/database error/i)) {
    return { field: "", message: action === "signup"
      ? "We couldn't finish setting up your account. Please try again in a moment."
      : "Something went wrong on our side. Please try again in a moment." };
  }
  if (status === 0 && has(/fetch|network|load failed/i) || has(/failed to fetch|networkerror|network request failed/i)) {
    return { field: "", message: "Can't reach the server. Check your internet connection and try again." };
  }
  return { field: "", message: message ? `Something went wrong: ${message}` : "Something went wrong. Please try again." };
}
