// Sign-in API for one audience. Tokens live in httpOnly cookies set by the
// server; the browser app never sees or stores them.
import axios from "axios";
import { apiUrl } from "../../config";

const base = (audience) => apiUrl(`/api/auth/${audience}`);
const data = (p) => p.then((r) => r.data);

export const authClient = (audience) => ({
  login: (email, password) => data(axios.post(`${base(audience)}/login`, { email, password })),
  logout: () => data(axios.post(`${base(audience)}/logout`)),
  me: () => data(axios.get(`${base(audience)}/me`)),
  refresh: () => data(axios.post(`${base(audience)}/refresh`)),
  register: (body) => data(axios.post(`${base(audience)}/register`, body)),
  verifyEmail: (email, code) => data(axios.post(`${base(audience)}/verify-email`, { email, code })),
  resendVerification: (email) => data(axios.post(`${base(audience)}/resend-verification`, { email })),
  forgotPassword: (email) => data(axios.post(`${base(audience)}/forgot-password`, { email })),
  resetPassword: (email, code, password) => data(axios.post(`${base(audience)}/reset-password`, { email, code, password })),
  changePassword: (currentPassword, newPassword) =>
    data(axios.post(`${base(audience)}/change-password`, { currentPassword, newPassword })),
});

// The signed-in profile is kept for display only (name, e-mail, roles);
// every permission is checked again by the server.
const PROFILE_KEY = (audience) => `nauticrew.profile.${audience}`;
export const saveProfile = (audience, user) => {
  try {
    if (user) localStorage.setItem(PROFILE_KEY(audience), JSON.stringify(user));
    else localStorage.removeItem(PROFILE_KEY(audience));
    // Pre-Phase-2 pages read "user"; the old token is never used again.
    if (audience === "calendar-staff") {
      localStorage.removeItem("token");
      if (user) localStorage.setItem("user", JSON.stringify(user));
      else localStorage.removeItem("user");
    }
  } catch {
    /* storage blocked: the profile is simply loaded again */
  }
};
export const savedProfile = (audience) => {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY(audience))) || null;
  } catch {
    return null;
  }
};
