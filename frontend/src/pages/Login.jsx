import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../style/Login.css";
import logo from "../assets/identeelogo.jpeg";

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP screen
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState("");

  const navigate = useNavigate();

  // Login data
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  // Register data
  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // ===============================
  // LOGIN INPUT CHANGE
  // ===============================
  const handleLoginChange = (e) => {
    const { name, value } = e.target;

    setLoginData({
      ...loginData,
      [name]: value,
    });
  };

  // ===============================
  // REGISTER INPUT CHANGE
  // ===============================
  const handleRegisterChange = (e) => {
    const { name, value } = e.target;

    setRegisterData({
      ...registerData,
      [name]: value,
    });
  };

  // ===============================
  // LOGIN
  // ===============================
  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(
        "http://localhost:5000/api/auth/login",
        loginData,
      );

      console.log("Login successful:", response.data);

      // Save JWT
      localStorage.setItem("token", response.data.token);

      // Save user
      localStorage.setItem("user", JSON.stringify(response.data.user));

      // Go to dashboard
      navigate("/dashboard");
    } catch (error) {
      console.error("Login failed:", error);

      alert(error.response?.data?.message || "Login failed. Please try again.");
    }
  };

  // ===============================
  // CREATE ACCOUNT
  // ===============================
  const handleRegister = async (e) => {
    e.preventDefault();

    // Check password
    if (registerData.password !== registerData.confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    try {
      const response = await axios.post(
        "http://localhost:5000/api/auth/register",
        {
          name: registerData.name,
          email: registerData.email,
          password: registerData.password,
        },
      );

      console.log("Registration response:", response.data);

      alert("OTP sent to your email!");

      // Open OTP screen
      setShowOtp(true);
    } catch (error) {
      console.error("Registration failed:", error);

      alert(
        error.response?.data?.message ||
          "Registration failed. Please try again.",
      );
    }
  };

  // ===============================
  // VERIFY OTP
  // ===============================
  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    if (!otp) {
      alert("Please enter the OTP");
      return;
    }

    try {
      const response = await axios.post(
        "http://localhost:5000/api/auth/verify-otp",
        {
          email: registerData.email,
          otp: otp,
        },
      );

      console.log("OTP verification successful:", response.data);

      // Save JWT
      localStorage.setItem("token", response.data.token);

      // Save user
      localStorage.setItem("user", JSON.stringify(response.data.user));

      alert("Account created successfully! 🎉");

      // Go to dashboard
      navigate("/dashboard");
    } catch (error) {
      console.error("OTP verification failed:", error);

      alert(error.response?.data?.message || "Invalid OTP. Please try again.");
    }
  };

  // ===============================
  // BACK TO REGISTER
  // ===============================
  const handleBackToRegister = () => {
    setShowOtp(false);
    setOtp("");
  };

  return (
    <div className="login-page">
      {/* Decorative Background */}
      <div className="background-shape shape-one"></div>
      <div className="background-shape shape-two"></div>
      <div className="background-shape shape-three"></div>

      {/* Main Container */}
      <div className="login-container">
        {/* ================================= */}
        {/* LEFT BRANDING SECTION */}
        {/* ================================= */}
        <div className="brand-section">
          <div className="brand-content">
            <div className="logo-wrapper">
              <img src={logo} alt="IDENTEE" className="brand-logo" />
            </div>

            <h1>
              Welcome to
              <span> IDENTEE</span>
            </h1>

            <p>Your Style. Your Story. Your Identity.</p>

            <div className="brand-line"></div>

            <div className="brand-description">
              <h3>AI Calendar Designer</h3>

              <p>
                Create beautiful, personalized calendars with powerful design
                tools made for your team.
              </p>
            </div>
          </div>
        </div>

        {/* ================================= */}
        {/* FORM SECTION */}
        {/* ================================= */}
        <div className="form-section">
          <div className="form-card">
            {/* ================================= */}
            {/* OTP SCREEN */}
            {/* ================================= */}
            {showOtp ? (
              <div className="form-content">
                <div className="form-heading">
                  <span className="small-label">EMAIL VERIFICATION</span>

                  <h2>Verify your email 📧</h2>

                  <p>We sent a 6-digit OTP to</p>

                  <strong>{registerData.email}</strong>
                </div>

                <form onSubmit={handleVerifyOtp}>
                  {/* OTP */}
                  <div className="input-group">
                    <label>Verification OTP</label>

                    <div className="input-wrapper">
                      <span className="input-icon">🔐</span>

                      <input
                        type="text"
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="Enter 6-digit OTP"
                        maxLength="6"
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="primary-button">
                    <span>Verify OTP</span>
                    <span className="button-arrow">→</span>
                  </button>
                </form>

                <button
                  type="button"
                  className="back-button"
                  onClick={handleBackToRegister}
                >
                  ← Back to Create Account
                </button>
              </div>
            ) : (
              <>
                {/* ================================= */}
                {/* LOGIN / REGISTER TOGGLE */}
                {/* ================================= */}
                <div className="auth-toggle">
                  <button
                    type="button"
                    className={isLogin ? "active" : ""}
                    onClick={() => setIsLogin(true)}
                  >
                    Login
                  </button>

                  <button
                    type="button"
                    className={!isLogin ? "active" : ""}
                    onClick={() => setIsLogin(false)}
                  >
                    Create Account
                  </button>
                </div>

                {/* ================================= */}
                {/* LOGIN */}
                {/* ================================= */}
                {isLogin ? (
                  <div className="form-content">
                    <div className="form-heading">
                      <span className="small-label">STAFF PORTAL</span>

                      <h2>Welcome back 👋</h2>

                      <p>Sign in to continue to your workspace.</p>
                    </div>

                    <form onSubmit={handleLogin}>
                      {/* Email */}
                      <div className="input-group">
                        <label>Email Address</label>

                        <div className="input-wrapper">
                          <span className="input-icon">✉</span>

                          <input
                            type="email"
                            name="email"
                            value={loginData.email}
                            onChange={handleLoginChange}
                            placeholder="Enter your email"
                            required
                          />
                        </div>
                      </div>

                      {/* Password */}
                      <div className="input-group">
                        <label>Password</label>

                        <div className="input-wrapper">
                          <span className="input-icon">🔒</span>

                          <input
                            type={showPassword ? "text" : "password"}
                            name="password"
                            value={loginData.password}
                            onChange={handleLoginChange}
                            placeholder="Enter your password"
                            required
                          />

                          <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? "🙈" : "👁"}
                          </button>
                        </div>
                      </div>

                      {/* Login Button */}
                      <button type="submit" className="primary-button">
                        <span>Login to Workspace</span>

                        <span className="button-arrow">→</span>
                      </button>
                    </form>
                  </div>
                ) : (
                  /* ================================= */
                  /* CREATE ACCOUNT */
                  /* ================================= */

                  <div className="form-content">
                    <div className="form-heading">
                      <span className="small-label">STAFF REGISTRATION</span>

                      <h2>Create your account ✨</h2>

                      <p>Join your IDENTEE workspace in a few steps.</p>
                    </div>

                    <form onSubmit={handleRegister}>
                      {/* Name */}
                      <div className="input-group">
                        <label>Full Name</label>

                        <div className="input-wrapper">
                          <span className="input-icon">👤</span>

                          <input
                            type="text"
                            name="name"
                            value={registerData.name}
                            onChange={handleRegisterChange}
                            placeholder="Enter your name"
                            required
                          />
                        </div>
                      </div>

                      {/* Email */}
                      <div className="input-group">
                        <label>Email Address</label>

                        <div className="input-wrapper">
                          <span className="input-icon">✉</span>

                          <input
                            type="email"
                            name="email"
                            value={registerData.email}
                            onChange={handleRegisterChange}
                            placeholder="Enter your email"
                            required
                          />
                        </div>
                      </div>

                      {/* Password */}
                      <div className="input-group">
                        <label>Password</label>

                        <div className="input-wrapper">
                          <span className="input-icon">🔒</span>

                          <input
                            type={showPassword ? "text" : "password"}
                            name="password"
                            value={registerData.password}
                            onChange={handleRegisterChange}
                            placeholder="Create a password"
                            required
                          />

                          <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? "🙈" : "👁"}
                          </button>
                        </div>
                      </div>

                      {/* Confirm Password */}
                      <div className="input-group">
                        <label>Confirm Password</label>

                        <div className="input-wrapper">
                          <span className="input-icon">🔐</span>

                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            name="confirmPassword"
                            value={registerData.confirmPassword}
                            onChange={handleRegisterChange}
                            placeholder="Confirm your password"
                            required
                          />

                          <button
                            type="button"
                            className="password-toggle"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                          >
                            {showConfirmPassword ? "🙈" : "👁"}
                          </button>
                        </div>
                      </div>

                      {/* Create Account Button */}
                      <button type="submit" className="primary-button">
                        <span>Create Staff Account</span>

                        <span className="button-arrow">→</span>
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}

            {/* Security Note */}
            {!showOtp && (
              <div className="security-note">
                <span>🔐</span>
                <span>Secure Staff Access</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
