// One-time HTTP setup for the whole app (Phase 2):
//  - sign-in cookies travel with every API request;
//  - every request carries the app header the server's CSRF guard expects;
//  - an expired session is renewed once with the refresh cookie and the
//    request retried; if that fails, the user goes to that area's login.
import axios from "axios";
import { apiUrl } from "../config";
import { audienceForPath, loginPathFor } from "./auth/audiences";
import { saveProfile } from "./auth/authClient";
import { forgetSession } from "./auth/sessionCache";

let refreshing = null;
const refreshOnce = (audience) => {
  if (!refreshing) {
    refreshing = axios
      .post(apiUrl(`/api/auth/${audience}/refresh`), null, { __isRefresh: true })
      .then((r) => {
        saveProfile(audience, r.data.user);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        setTimeout(() => {
          refreshing = null;
        }, 0);
      });
  }
  return refreshing;
};

export const setupHttp = () => {
  axios.defaults.withCredentials = true;
  axios.defaults.headers.common["X-NC-Request"] = "1";

  axios.interceptors.response.use(undefined, async (error) => {
    const config = error.config || {};
    const url = String(config.url || "");
    const isApi = url.startsWith(apiUrl("/api/"));
    if (error.response?.status !== 401 || !isApi || config.__isRefresh || config.__retried || url.includes("/api/auth/")) {
      return Promise.reject(error);
    }
    const audience = audienceForPath(window.location.pathname);
    if (await refreshOnce(audience)) {
      return axios({ ...config, __retried: true });
    }
    saveProfile(audience, null);
    forgetSession(audience);
    const target = loginPathFor(audience, window.location);
    if (!window.location.pathname.endsWith("/login")) window.location.assign(target);
    return Promise.reject(error);
  });
};
