export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const SESSION_USER_KEY = "fleetUser";
const SESSION_TOKEN_KEY = "fleetToken";

export function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_USER_KEY) || "null");
  } catch {
    sessionStorage.removeItem(SESSION_USER_KEY);
    return null;
  }
}

export function getAuthToken() {
  return sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
}

export function setAuthSession(user, token) {
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  if (token) sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearAuthSession() {
  sessionStorage.removeItem(SESSION_USER_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
      headers,
    });
  } catch (networkError) {
    const error = new Error("Unable to reach the FleetFlow server. Check that the backend is running and try again.");
    error.status = 0; error.cause = networkError; throw error;
  }

  let data = {};
  try { data = await response.json(); } catch { data = {}; }

  if (!response.ok) {
    if (response.status === 401) {
      // Do not immediately clear the session here: the page may be able to
      // recover or the user may have another tab/session open.
    }
    const error = new Error(
      data.message ||
      (response.status === 401 ? "Authentication required. Please log in again." :
       response.status === 403 ? "Access denied. You are not authorized for this action." :
       response.status === 409 ? "This operation conflicts with the current fleet state." :
       "Request failed.")
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function authFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_URL}${path}`, { credentials: "include", ...options, headers });
}
