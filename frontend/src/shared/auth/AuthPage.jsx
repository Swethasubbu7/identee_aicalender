// One sign-in page design for all four Nauticrew areas (Phase 2), in the
// look of the existing Calendar Tool login. Modes:
//   login · register · verify (e-mail code) · forgot · reset
// Customers can register; staff accounts are created by an administrator.
import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import "../../style/Login.css";
import logo from "../../assets/nauticrew-logo.png";
import logoDark from "../../assets/nauticrew-logo-dark.png";
import { useColorMode } from "../../colorMode";
import { AUDIENCES, authPath, safeNext } from "./audiences";
import { authClient, saveProfile } from "./authClient";
import { forgetSession } from "./sessionCache";

const messageOf = (err, fallback) => err?.response?.data?.message || fallback;

const Field = ({ label, icon, type = "text", value, onChange, placeholder, autoComplete, toggle, maxLength, inputMode }) => {
  const [show, setShow] = useState(false);
  const id = useId();
  const isPassword = type === "password";
  return (
    <div className="input-group">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrapper">
          <span className="input-icon" aria-hidden="true">
            {icon}
          </span>
          <input
            id={id}
            type={isPassword && show ? "text" : type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete={autoComplete}
            maxLength={maxLength}
            inputMode={inputMode}
            required
          />
          {isPassword && toggle && (
            <button type="button" className="password-toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? "🙈" : "👁"}
            </button>
          )}
      </div>
    </div>
  );
};

const Notice = ({ kind, children }) =>
  children ? (
    <p
      role={kind === "error" ? "alert" : "status"}
      style={{
        margin: "0 0 14px",
        padding: "10px 12px",
        borderRadius: 10,
        fontSize: 14,
        background: kind === "error" ? "rgba(211, 47, 47, 0.10)" : "rgba(46, 125, 50, 0.10)",
        color: kind === "error" ? "#c62828" : "#2e7d32",
      }}
    >
      {children}
    </p>
  ) : null;

const AuthPage = ({ audience, mode }) => {
  const meta = AUDIENCES[audience];
  const client = authClient(audience);
  const isCustomer = meta.kind === "customer";
  const navigate = useNavigate();
  const { mode: colorMode } = useColorMode();
  const [params] = useSearchParams();
  const next = safeNext(audience, params.get("next"));

  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(params.get("info") || "");

  const go = (page, extra = {}) => {
    const q = new URLSearchParams({ ...(email && { email }), ...extra });
    navigate(`${authPath(audience, page)}?${q.toString()}`);
  };

  const signedIn = (user) => {
    saveProfile(audience, user);
    forgetSession(audience);
    navigate(next, { replace: true });
  };

  const run = async (fn) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const onLogin = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const { user } = await client.login(email, password);
        signedIn(user);
      } catch (err) {
        if (err.response?.data?.code === "EMAIL_NOT_VERIFIED") {
          await client.resendVerification(email).catch(() => {});
          go("verify-email", { info: "Please verify your e-mail first. We sent you a new code." });
          return;
        }
        setError(messageOf(err, "Sign-in failed. Please try again."));
      }
    });
  };

  const onRegister = (e) => {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords are different.");
    return run(async () => {
      try {
        const res = await client.register({ name, email, password });
        if (res.needsVerification) go("verify-email", { info: res.message });
        else signedIn(res.user);
      } catch (err) {
        setError(messageOf(err, "Registration failed. Please try again."));
      }
    });
  };

  const onVerify = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const { user } = await client.verifyEmail(email, code);
        signedIn(user);
      } catch (err) {
        setError(messageOf(err, "Verification failed. Please try again."));
      }
    });
  };

  const onForgot = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await client.forgotPassword(email);
        go("reset-password", { info: res.message });
      } catch (err) {
        setError(messageOf(err, "Please try again."));
      }
    });
  };

  const onReset = (e) => {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords are different.");
    return run(async () => {
      try {
        const res = await client.resetPassword(email, code, password);
        setPassword("");
        setConfirm("");
        go("login", { info: res.message });
      } catch (err) {
        setError(messageOf(err, "The password could not be changed."));
      }
    });
  };

  const heading = {
    login: { label: `${meta.label.toUpperCase()} SIGN-IN`, title: "Welcome back 👋", text: "Sign in to continue." },
    register: { label: "CREATE ACCOUNT", title: "Create your account", text: "It takes less than a minute." },
    verify: { label: "E-MAIL VERIFICATION", title: "Verify your e-mail 📧", text: "Enter the 6-digit code we sent you." },
    forgot: { label: "PASSWORD HELP", title: "Forgot your password?", text: "We will e-mail you a code to set a new one." },
    reset: { label: "NEW PASSWORD", title: "Set a new password", text: "Enter the code from your e-mail and a new password." },
  }[mode];

  const linkStyle = { color: "inherit", fontWeight: 600 };

  return (
    <div className="login-page">
      <div className="background-shape shape-one"></div>
      <div className="background-shape shape-two"></div>
      <div className="background-shape shape-three"></div>

      <div className="login-container">
        <div className="brand-section">
          <div className="brand-content">
            <div className="logo-wrapper">
              <img src={colorMode === "dark" ? logoDark : logo} alt="Nauticrew" className="brand-logo" />
            </div>
            <h1>
              Welcome to
              <span> NAUTICREW</span>
            </h1>
            <p>Your Style. Your Story. Your Identity.</p>
            <div className="brand-line"></div>
            <div className="brand-description">
              <h3>{meta.title}</h3>
              <p>{meta.tagline}</p>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-card">
            <div className="form-content">
              <div className="form-heading">
                <span className="small-label">{heading.label}</span>
                <h2>{heading.title}</h2>
                <p>{heading.text}</p>
              </div>

              <Notice kind="error">{error}</Notice>
              <Notice kind="info">{info}</Notice>

              {mode === "login" && (
                <form onSubmit={onLogin}>
                  <Field label="Email Address" icon="✉" type="email" value={email} onChange={setEmail} placeholder="Enter your email" autoComplete="username" />
                  <Field label="Password" icon="🔒" type="password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" toggle />
                  <button type="submit" className="primary-button" disabled={busy}>
                    <span>{busy ? "Signing in…" : "Sign in"}</span>
                    <span className="button-arrow">→</span>
                  </button>
                </form>
              )}

              {mode === "register" && (
                <form onSubmit={onRegister}>
                  <Field label="Full Name" icon="👤" value={name} onChange={setName} placeholder="Your name" autoComplete="name" maxLength={120} />
                  <Field label="Email Address" icon="✉" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
                  <Field label="Password" icon="🔒" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" toggle />
                  <Field label="Confirm Password" icon="🔒" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat the password" autoComplete="new-password" />
                  <button type="submit" className="primary-button" disabled={busy}>
                    <span>{busy ? "Creating…" : "Create account"}</span>
                    <span className="button-arrow">→</span>
                  </button>
                </form>
              )}

              {mode === "verify" && (
                <form onSubmit={onVerify}>
                  <Field label="Email Address" icon="✉" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
                  <Field label="Verification Code" icon="🔐" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" inputMode="numeric" maxLength={6} />
                  <button type="submit" className="primary-button" disabled={busy}>
                    <span>{busy ? "Checking…" : "Verify e-mail"}</span>
                    <span className="button-arrow">→</span>
                  </button>
                  <button
                    type="button"
                    style={{ marginTop: 12, background: "none", border: "none", color: "inherit", fontWeight: 600, cursor: "pointer", textDecoration: "underline", width: "100%" }}
                    disabled={busy || !email}
                    onClick={() => run(async () => setInfo((await client.resendVerification(email)).message))}
                  >
                    Send a new code
                  </button>
                </form>
              )}

              {mode === "forgot" && (
                <form onSubmit={onForgot}>
                  <Field label="Email Address" icon="✉" type="email" value={email} onChange={setEmail} placeholder="Enter your email" autoComplete="email" />
                  <button type="submit" className="primary-button" disabled={busy}>
                    <span>{busy ? "Sending…" : "Send reset code"}</span>
                    <span className="button-arrow">→</span>
                  </button>
                </form>
              )}

              {mode === "reset" && (
                <form onSubmit={onReset}>
                  <Field label="Email Address" icon="✉" type="email" value={email} onChange={setEmail} placeholder="Enter your email" autoComplete="email" />
                  <Field label="Code from the e-mail" icon="🔐" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" inputMode="numeric" maxLength={6} />
                  <Field label="New Password" icon="🔒" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" toggle />
                  <Field label="Confirm Password" icon="🔒" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat the password" autoComplete="new-password" />
                  <button type="submit" className="primary-button" disabled={busy}>
                    <span>{busy ? "Saving…" : "Set new password"}</span>
                    <span className="button-arrow">→</span>
                  </button>
                </form>
              )}

              <div style={{ marginTop: 18, fontSize: 14, textAlign: "center", lineHeight: 1.9, opacity: 0.85 }}>
                {mode === "login" && (
                  <>
                    <Link to={authPath(audience, "forgot-password")} style={linkStyle}>
                      Forgot password?
                    </Link>
                    <br />
                    {isCustomer ? (
                      <>
                        New here?{" "}
                        <Link to={authPath(audience, "register")} style={linkStyle}>
                          Create an account
                        </Link>
                      </>
                    ) : (
                      <span>Need access? Staff accounts are created by your Nauticrew administrator.</span>
                    )}
                  </>
                )}
                {mode !== "login" && (
                  <Link to={authPath(audience, "login")} style={linkStyle}>
                    ← Back to sign-in
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
