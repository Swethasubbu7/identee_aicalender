// Backend origin. Set VITE_API_URL in frontend/.env for other environments.
export const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

export const apiUrl = (path) => `${API_ORIGIN}${path}`;

export const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
