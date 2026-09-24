import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Truck,
} from "lucide-react";
import "../Auth.css";
import { API_URL } from "../services/api";
function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(
    () =>
      params.get("token") ||
      sessionStorage.getItem("fleetPasswordResetToken") ||
      "",
    [params]
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!token) {
      return setError("This password reset link is missing or invalid.");
    }
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return setError(
        "Password must be at least 8 characters and contain a letter and number."
      );
    }
    if (password !== confirmPassword) {
      return setError("Password and confirm password do not match.");
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/auth/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            password,
            confirmPassword,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to reset password.");
      }

      setMessage(data.message || "Password reset successfully.");
      setPassword("");
      setConfirmPassword("");

      sessionStorage.removeItem("fleetPasswordResetToken");
      sessionStorage.removeItem("fleetPasswordResetEmail");
    } catch (err) {
      setError(err.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-background"></div>

      <div className="auth-wrapper">
        <button
          type="button"
          className="back-home-btn"
          onClick={() => navigate("/login")}
        >
          <ArrowLeft size={18} />
          Back to Login
        </button>

        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-logo-icon">
              <Truck size={23} />
            </div>

            <span>
              Fleet<span>Flow</span>
            </span>
          </div>

          <div className="auth-heading">
            <div className="auth-heading-icon">
              <ShieldCheck size={25} />
            </div>

            <h1>Reset Password</h1>
            <p>
              Create a new password for your FleetFlow account.
            </p>
          </div>

          {error && (
            <div className="auth-server-error" role="alert">
              {error}
            </div>
          )}

          {message && (
            <div className="auth-success-message" role="status">
              {message}
            </div>
          )}

          <form
            className="auth-form"
            onSubmit={submit}
            noValidate
          >
            <div className="auth-field">
              <label htmlFor="new-password">
                New Password
              </label>

              <div className="auth-input">
                <Lock size={18} />

                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword((v) => !v)
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
            </div>

            <div className="auth-field">
              <label htmlFor="confirm-password">
                Confirm Password
              </label>

              <div className="auth-input">
                <Lock size={18} />

                <input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowConfirm((v) => !v)
                  }
                  aria-label={
                    showConfirm
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showConfirm ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || !token}
            >
              {loading
                ? "Resetting Password..."
                : "Reset Password"}
            </button>
          </form>

          {message && (
            <Link className="dev-reset-link" to="/login">
              Return to Login
            </Link>
          )}
          <p className="auth-switch">
            Need another reset code?{" "}
            <Link to="/forgot-password">
              Start again
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
export default ResetPassword;