import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  KeyRound,
  Mail,
  ShieldCheck,
  Truck,
} from "lucide-react";
import "../Auth.css";
import { API_URL } from "../services/api";
const RESEND_SECONDS = 60;
function VerifyResetOtp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(
    () =>
      sessionStorage.getItem("fleetPasswordResetEmail") || ""
  );
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    "A 6-digit OTP has been sent to your email address."
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] =
    useState(RESEND_SECONDS);
  useEffect(() => {
    if (!email) {
      navigate("/forgot-password", { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;

    const timer = window.setInterval(() => {
      setSecondsLeft((current) =>
        Math.max(current - 1, 0)
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const verify = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit OTP sent to your email.");
      return;
    }
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/auth/verify-reset-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            otp: otp.trim(),
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.message || "Unable to verify the OTP."
        );
      }
      sessionStorage.setItem(
        "fleetPasswordResetToken",
        data.resetToken || ""
      );

      navigate("/reset-password", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to verify the OTP.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (secondsLeft > 0 || resending) return;

    setError("");
    setMessage("");

    try {
      setResending(true);

      const response = await fetch(
        `${API_URL}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.retryAfterSeconds) {
          setSecondsLeft(Number(data.retryAfterSeconds));
        }

        throw new Error(
          data.message || "Unable to resend the OTP."
        );
      }

      setOtp("");
      setSecondsLeft(RESEND_SECONDS);
      setMessage(
        "A new OTP has been sent to your email address."
      );
    } catch (err) {
      setError(err.message || "Unable to resend the OTP.");
    } finally {
      setResending(false);
    }
  };

  const changeEmail = () => {
    sessionStorage.removeItem("fleetPasswordResetEmail");
    sessionStorage.removeItem("fleetPasswordResetToken");

    navigate("/forgot-password", { replace: true });
  };

  return (
    <div className="auth-page">
      <div className="auth-background"></div>

      <div className="auth-wrapper">
        <button
          type="button"
          className="back-home-btn"
          onClick={changeEmail}
        >
          <ArrowLeft size={18} />
          Change Email
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
              <KeyRound size={25} />
            </div>

            <h1>Verify OTP</h1>

            <p>
              Enter the 6-digit code sent to{" "}
              <strong>{email}</strong>.
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
            onSubmit={verify}
            noValidate
          >
            <div className="auth-field">
              <label htmlFor="reset-otp">
                Verification OTP
              </label>

              <div className="auth-input">
                <Mail size={18} />

                <input
                  id="reset-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => {
                    setOtp(
                      e.target.value.replace(/\D/g, "")
                    );
                    setError("");
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || otp.length !== 6}
            >
              {loading
                ? "Verifying OTP..."
                : "Verify OTP"}
            </button>
          </form>

          <div className="auth-otp-actions">
            <button
              type="button"
              className="auth-text-button"
              onClick={resend}
              disabled={resending || secondsLeft > 0}
            >
              {resending
                ? "Sending..."
                : secondsLeft > 0
                ? `Resend OTP in ${secondsLeft}s`
                : "Resend OTP"}
            </button>

            <button
              type="button"
              className="auth-text-button"
              onClick={changeEmail}
            >
              Use a different email
            </button>
          </div>

          <p className="auth-switch">
            Return to{" "}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
export default VerifyResetOtp;