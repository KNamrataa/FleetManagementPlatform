import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Truck,
} from "lucide-react";

import "../Auth.css";
import { setAuthSession } from "../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Login() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] =
    useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});

  const [loading, setLoading] =
    useState(false);

  const [serverError, setServerError] =
    useState("");
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  const goToDashboard = (loggedInUser) => {
    const destination = loggedInUser.role === "SUPER_ADMIN"
      ? "/super-admin"
      : loggedInUser.role === "FLEET_MANAGER"
        ? "/fleet-manager"
        : loggedInUser.role === "TRIP_MANAGER"
          ? "/trip-manager"
          : loggedInUser.role === "DRIVER"
            ? "/driver"
            : loggedInUser.role === "MAINTENANCE_MANAGER"
              ? "/maintenance"
              : loggedInUser.role === "FINANCE_MANAGER"
                ? "/finance-manager"
                : "/dashboard";
    navigate(destination, { replace: true });
  };

  const handleGoogleLogin = async (credential) => {
    try {
      setLoading(true);
      setServerError("");

      const response = await fetch(
        `${API_URL}/api/auth/google`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ credential }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to sign in with Google."
        );
      }

      if (!data.user || !data.token) {
        throw new Error(
          "Google login succeeded, but the authentication session was not returned."
        );
      }

      const loggedInUser = {
        ...data.user,
        role: data.user.role
          ? (data.user.role.toString().trim().toUpperCase() === "DISPATCHER"
            ? "TRIP_MANAGER"
            : data.user.role.toString().trim().toUpperCase())
          : "CUSTOMER",
      };

      setAuthSession(loggedInUser, data.token);
      goToDashboard(loggedInUser);
    } catch (error) {
      console.error("Google login error:", error);
      setServerError(
        error.message || "Unable to sign in with Google. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };
useEffect(() => {
  if (!googleClientId || !googleButtonRef.current) {
    return undefined;
  }

  let cancelled = false;

  const initializeGoogle = () => {
    if (
      cancelled ||
      !window.google?.accounts?.id ||
      !googleButtonRef.current
    ) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        if (response?.credential) {
          handleGoogleLogin(response.credential);
        }
      },
    });

    googleButtonRef.current.innerHTML = "";

    window.google.accounts.id.renderButton(
      googleButtonRef.current,
      {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: 350,
      }
    );
  };

  /*
   * Google Identity Services is already loaded.
   */
  if (window.google?.accounts?.id) {
    initializeGoogle();

    return () => {
      cancelled = true;
    };
  }

  /*
   * Check whether the Google script was already
   * added to the page by another component/render.
   */
  const existingScript = document.querySelector(
    'script[src="https://accounts.google.com/gsi/client"]'
  );

  if (existingScript) {
    existingScript.addEventListener(
      "load",
      initializeGoogle
    );

    return () => {
      cancelled = true;

      existingScript.removeEventListener(
        "load",
        initializeGoogle
      );
    };
  }

  /*
   * Google script does not exist yet,
   * so create it.
   */
  const script = document.createElement("script");

  script.src =
    "https://accounts.google.com/gsi/client";

  script.async = true;
  script.defer = true;

  script.onload = initializeGoogle;

  document.head.appendChild(script);

  return () => {
    cancelled = true;
    script.onload = null;
  };
}, [googleClientId]);

  const validateForm = () => {
    const newErrors = {};

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      newErrors.email =
        "Email address is required.";
    } else if (
      !emailRegex.test(
        formData.email.trim()
      )
    ) {
      newErrors.email =
        "Enter a valid email address.";
    }

    if (!formData.password) {
      newErrors.password =
        "Password is required.";
    }

    return newErrors;
  };
  const handleChange = (event) => {
    const { name, value } =
      event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setErrors((previous) => ({
      ...previous,
      [name]: "",
    }));

    setServerError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationErrors =
      validateForm();

    if (
      Object.keys(validationErrors)
        .length > 0
    ) {
      setErrors(validationErrors);
      return;
    }

    try {
      setLoading(true);
      setServerError("");

      const response = await fetch(
        `${API_URL}/api/auth/login`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            email: formData.email
              .trim()
              .toLowerCase(),

            password:
              formData.password,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Invalid email or password."
        );
      }

      console.log(
        "Login response:",
        data
      );

      if (!data.user) {
        throw new Error(
          "Login successful, but user information was not returned by the server."
        );
      }
      const loggedInUser = {
        ...data.user,

        role: data.user.role
          ? (data.user.role.toString().trim().toUpperCase() === "DISPATCHER" ? "TRIP_MANAGER" : data.user.role.toString().trim().toUpperCase())
          : "CUSTOMER",
      };

      console.log(
        "Logged in user:",
        loggedInUser
      );

      console.log(
        "Logged in role:",
        loggedInUser.role
      );
      if (!data.token) {
        throw new Error("Login successful, but the authentication token was not returned by the server.");
      }
      setAuthSession(loggedInUser, data.token);
      goToDashboard(loggedInUser);
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      setServerError(
        error.message ||
          "Unable to login. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-page">

      <div className="auth-background"></div>

      <div className="auth-wrapper">

        {/* BACK HOME */}

        <button
          type="button"
          className="back-home-btn"
          onClick={() =>
            navigate("/")
          }
        >
          <ArrowLeft size={18} />
          Back to Home
        </button>

        {/* LOGIN CARD */}

        <div className="auth-card">

          {/* BRAND */}

          <div className="auth-brand">

            <div className="auth-logo-icon">
              <Truck size={23} />
            </div>

            <span>
              Fleet
              <span>Flow</span>
            </span>

          </div>

          {/* HEADING */}

          <div className="auth-heading">

            <div className="auth-heading-icon">
              <ShieldCheck size={25} />
            </div>

            <h1>
              Welcome Back
            </h1>

            <p>
              Sign in to access your fleet
              management workspace.
            </p>

          </div>

          {/* SERVER ERROR */}

          {serverError && (
            <div
              className="auth-server-error"
              role="alert"
            >
              {serverError}
            </div>
          )}

          {/* FORM */}

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
          >

            {/* EMAIL */}

            <div className="auth-field">

              <label htmlFor="email">
                Email Address
              </label>

              <div
                className={`auth-input ${
                  errors.email
                    ? "input-error"
                    : ""
                }`}
              >

                <Mail size={18} />

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                />

              </div>

              {errors.email && (
                <span className="field-error">
                  {errors.email}
                </span>
              )}

            </div>

            {/* PASSWORD */}

            <div className="auth-field">

              <label htmlFor="password">
                Password
              </label>

              <div
                className={`auth-input ${
                  errors.password
                    ? "input-error"
                    : ""
                }`}
              >

                <Lock size={18} />

                <input
                  id="password"
                  name="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword(
                      !showPassword
                    )
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >

                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}

                </button>

              </div>

              {errors.password && (
                <span className="field-error">
                  {errors.password}
                </span>
              )}

            </div>

            <Link to="/forgot-password" className="forgot-password-link">Forgot password?</Link>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading
                ? "Signing In..."
                : "Sign In"}
            </button>

          </form>

          <div className="google-login-section">
            <div className="auth-divider">
              <span></span>
              <p>OR</p>
              <span></span>
            </div>

            {googleClientId ? (
              <div
                ref={googleButtonRef}
                className="google-login-button"
                aria-label="Continue with Google"
              />
            ) : (
              <div className="google-config-notice">
                Google sign-in is not configured yet. Add
                <strong> VITE_GOOGLE_CLIENT_ID </strong>
                to the frontend environment file.
              </div>
            )}
          </div>

          <div className="auth-divider auth-security-divider">

            <span></span>

            <p>
              Secure Fleet Management Access
            </p>

            <span></span>

          </div>

          <p className="auth-switch">

            New to FleetFlow?

            <Link to="/signup">
              Create an account
            </Link>

          </p>

        </div>

      </div>

    </div>
  );
}
export default Login;