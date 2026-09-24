import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, ShieldCheck, Truck } from "lucide-react";
import "../Auth.css";
import { API_URL } from "../services/api";
function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email address is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Unable to send the verification OTP.");

      sessionStorage.setItem("fleetPasswordResetEmail", normalizedEmail);
      sessionStorage.removeItem("fleetPasswordResetToken");
      navigate("/forgot-password/verify", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to send the verification OTP.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="auth-page">
    <div className="auth-background"></div>
    <div className="auth-wrapper">
      <button type="button" className="back-home-btn" onClick={() => navigate("/login")}>
        <ArrowLeft size={18} /> Back to Login
      </button>
      <div className="auth-card">
        <div className="auth-brand"><div className="auth-logo-icon"><Truck size={23} /></div><span>Fleet<span>Flow</span></span></div>
        <div className="auth-heading"><div className="auth-heading-icon"><ShieldCheck size={25} /></div><h1>Forgot Password?</h1><p>Enter your registered email address. We will send a one-time verification code.</p></div>
        {error && <div className="auth-server-error" role="alert">{error}</div>}
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-field">
            <label htmlFor="reset-email">Email Address</label>
            <div className="auth-input">
              <Mail size={18} />
              <input id="reset-email" type="email" autoComplete="email" placeholder="Enter your registered email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} disabled={loading} />
            </div>
          </div>
          <button type="submit" className="auth-submit-btn" disabled={loading}>{loading ? "Sending OTP..." : "Continue"}</button>
        </form>
        <p className="auth-switch">Remember your password? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  </div>;
}
export default ForgotPassword;