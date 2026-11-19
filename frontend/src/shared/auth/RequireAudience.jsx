import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { authClient, saveProfile } from "./authClient";
import { loginPathFor } from "./audiences";
import { isConfirmed, markConfirmed } from "./sessionCache";


const checkSession = async (audience) => {
  const client = authClient(audience);
  try {
    const { user } = await client.me();
    saveProfile(audience, user);
    return true;
  } catch (err) {
    if (err.response?.status !== 401) throw err;
  }
  try {
    const { user } = await client.refresh();
    saveProfile(audience, user);
    return true;
  } catch {
    saveProfile(audience, null);
    return false;
  }
};

/** Shows its children only to someone signed in for this audience. */
const RequireAudience = ({ audience, children }) => {
  const location = useLocation();
  const [state, setState] = useState(isConfirmed(audience) ? "ok" : "checking");

  useEffect(() => {
    if (isConfirmed(audience)) return undefined;
    let alive = true;
    checkSession(audience)
      .then((ok) => {
        if (ok) markConfirmed(audience);
        if (alive) setState(ok ? "ok" : "out");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [audience]);

  if (state === "ok") return children;
  if (state === "out") return <Navigate to={loginPathFor(audience, location)} replace />;
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--nc-bg)" }}>
      {state === "error" ? (
        <Box sx={{ color: "var(--nc-text)", textAlign: "center", p: 3 }}>
          The server could not be reached. Check your connection and reload the page.
        </Box>
      ) : (
        <CircularProgress size={32} aria-label="Checking your sign-in" />
      )}
    </Box>
  );
};

export default RequireAudience;
