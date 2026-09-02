const API_URL = "http://localhost:5000";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data.message || (response.status === 401 ? "Authentication required." : response.status === 403 ? "You are not authorized for this action." : "Request failed."));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
export { API_URL };
