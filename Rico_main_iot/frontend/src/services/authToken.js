const TOKEN_KEY = "rico_token";

const SESSION_KEYS = [
  TOKEN_KEY,
  "rico_auth",
  "rico_user",
  "rico_workstation_auth",
  "rico_workstation_user",
];

export function getAuthToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setAuthToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked: the user simply has to log in again on reload.
  }
}

export function clearSession() {
  try {
    SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Nothing stored.
  }
}

export function authHeaders(headers = {}) {
  const token = getAuthToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}
