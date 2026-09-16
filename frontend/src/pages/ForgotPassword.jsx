import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, ShieldCheck, Truck } from "lucide-react";
import "../Auth.css";
import { API_URL } from "../services/api";

function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setResetUrl("");
    if (!email.trim()) return setError("Email address is required.");
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Unable to process the request.");
      setMessage(data.message || "If an account exists, a reset link has been generated.");
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch (err) {
      setError(err.message || "Unable to process the request.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="auth-page">
    <div className="auth-background"></div>
    <div className="auth-wrapper">
      <button type="button" className="back-home-btn" onClick={() => navigate("/login")}><ArrowLeft size={18} /> Back to Login</button>
      <div className="auth-card">
        <div className="auth-brand"><div className="auth-logo-icon"><Truck size={23} /></div><span>Fleet<span>Flow</span></span></div>
        <div className="auth-heading"><div className="auth-heading-icon"><ShieldCheck size={25} /></div><h1>Forgot Password?</h1><p>Enter your registered email address to reset your FleetFlow password.</p></div>
        {error && <div className="auth-server-error" role="alert">{error}</div>}
        {message && <div className="auth-success-message" role="status">{message}</div>}
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-field"><label htmlFor="reset-email">Email Address</label><div className="auth-input"><Mail size={18} /><input id="reset-email" type="email" autoComplete="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} /></div></div>
          <button type="submit" className="auth-submit-btn" disabled={loading}>{loading ? "Generating Reset Link..." : "Send Reset Link"}</button>
        </form>
        {resetUrl && <div className="dev-reset-box"><strong>Development reset link</strong><p>This link is shown because the project is running in development mode without an email provider configured.</p><Link to={resetUrl.replace(window.location.origin, "")} className="dev-reset-link">Open Password Reset</Link></div>}
        <p className="auth-switch">Remember your password? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  </div>;
}

export default ForgotPassword;
