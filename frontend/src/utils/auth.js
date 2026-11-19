// Signed-in state kept in localStorage by the Login page.

// Reads the JWT payload without verifying it (the server verifies every
// request); only used to skip pages when the token has clearly expired.
const tokenPayload = (token) => {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const isSignedIn = () => {
  const token = localStorage.getItem("token");
  if (!token) return false;
  const exp = tokenPayload(token)?.exp;
  return !exp || exp * 1000 > Date.now();
};

export const currentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user")) || {};
  } catch {
    return {};
  }
};

// Where to go after signing in: the page the user asked for, if it is a
// path inside this app (never another site), else the dashboard.
export const safeNextPath = (next) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && next !== "/"
    ? next
    : "/calendar/staff";

export const loginPathFor = (location) => {
  const here = `${location.pathname}${location.search || ""}`;
  return here && here !== "/" ? `/?next=${encodeURIComponent(here)}` : "/";
};
