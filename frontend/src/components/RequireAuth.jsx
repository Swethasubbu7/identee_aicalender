import { Navigate, useLocation } from "react-router-dom";
import { isSignedIn, loginPathFor } from "../utils/auth";

// Pages behind sign-in: a direct URL or a refresh without a valid token goes
// to the login page, which returns here afterwards.
const RequireAuth = ({ children }) => {
  const location = useLocation();
  if (!isSignedIn()) return <Navigate to={loginPathFor(location)} replace />;
  return children;
};

export default RequireAuth;
