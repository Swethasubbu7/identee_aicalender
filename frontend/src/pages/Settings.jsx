import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Avatar, Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import AppSidebar from "../components/AppSidebar";
import { currentUser } from "../utils/auth";
import { authClient, saveProfile } from "../shared/auth/authClient";
import { forgetSession } from "../shared/auth/sessionCache";
import { loginPath } from "../shared/auth/audiences";

const AUDIENCE = "calendar-staff";
const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  CAL_ADMIN: "Calendar Admin",
  CAL_MANAGER: "Calendar Manager",
  DESIGNER: "Designer",
  PRODUCTION: "Production",
  ECOM_ADMIN: "E-commerce Admin",
  SALES: "Sales",
  INVENTORY: "Inventory",
  ACCOUNTS: "Accounts",
};

// Account details, password change and sign-out.
const Settings = () => {
  const navigate = useNavigate();
  const [user] = useState(currentUser);
  const name = user?.name || "Designer";
  const roles = Object.values(user?.roles || {}).filter(Boolean);
  const client = authClient(AUDIENCE);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const signOut = async () => {
    // Ends the session on the server too (the cookie alone is not trusted).
    await client.logout().catch(() => {});
    saveProfile(AUDIENCE, null);
    forgetSession(AUDIENCE);
    navigate(loginPath(AUDIENCE), { replace: true });
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (next !== confirm) return setResult({ severity: "error", text: "The two new passwords are different." });
    setBusy(true);
    setResult(null);
    try {
      const res = await client.changePassword(current, next);
      saveProfile(AUDIENCE, res.user);
      setCurrent("");
      setNext("");
      setConfirm("");
      setResult({ severity: "success", text: res.message });
    } catch (err) {
      setResult({ severity: "error", text: err.response?.data?.message || "The password could not be changed." });
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "var(--nc-bg)" }}>
      <AppSidebar />
      <Box sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
        <Typography variant="h5" sx={{ color: "var(--nc-text)", fontWeight: 700 }}>
          Settings
        </Typography>
        <Typography variant="body2" sx={{ color: "var(--nc-text-2)", mt: 0.5, mb: 3 }}>
          Your account in the calendar studio.
        </Typography>

        <Stack spacing={3} sx={{ maxWidth: 560 }}>
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Avatar sx={{ width: 48, height: 48, background: "#B08D35" }}>{name.charAt(0).toUpperCase()}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, color: "var(--nc-text)" }} noWrap>
                  {name}
                </Typography>
                {user?.email && (
                  <Typography variant="body2" sx={{ color: "var(--nc-text-2)" }} noWrap>
                    {user.email}
                  </Typography>
                )}
              </Box>
            </Box>
            {roles.length > 0 && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                {roles.map((r) => (
                  <Chip key={r} size="small" label={ROLE_LABELS[r] || r} />
                ))}
              </Box>
            )}
            <Button variant="outlined" onClick={signOut}>
              Sign out
            </Button>
          </Paper>

          <Paper variant="outlined" component="form" onSubmit={changePassword} sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 700, color: "var(--nc-text)", mb: 0.5 }}>Change password</Typography>
            <Typography variant="body2" sx={{ color: "var(--nc-text-2)", mb: 2 }}>
              Your other devices are signed out after the change.
            </Typography>
            <Stack spacing={2}>
              <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required size="small" />
              <TextField label="New password" type="password" autoComplete="new-password" helperText="At least 8 characters" value={next} onChange={(e) => setNext(e.target.value)} required size="small" />
              <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required size="small" />
              {result && <Alert severity={result.severity}>{result.text}</Alert>}
              <Box>
                <Button type="submit" variant="contained" disabled={busy}>
                  {busy ? "Saving…" : "Change password"}
                </Button>
              </Box>
            </Stack>
          </Paper>
        </Stack>
      </Box>
    </Box>
  );
};

export default Settings;
