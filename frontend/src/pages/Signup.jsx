import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Truck,
  User,
} from "lucide-react";

import "../Auth.css";

const API_URL = "http://localhost:5000";

function Signup() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const passwordRequirements = {
    minLength: formData.password.length >= 8,
    uppercase: /[A-Z]/.test(formData.password),
    lowercase: /[a-z]/.test(formData.password),
    number: /\d/.test(formData.password),
    specialCharacter: /[^A-Za-z0-9]/.test(formData.password),
  };

  const isPasswordStrong =
    Object.values(passwordRequirements).every(Boolean);

  const validateForm = () => {
    const newErrors = {};

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (formData.fullName.trim().length < 2) {
      newErrors.fullName = "Enter your full name.";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email address is required.";
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = "Enter a valid email address.";
    }

    if (
      formData.phone &&
      !/^[0-9+\-\s()]{7,20}$/.test(formData.phone)
    ) {
      newErrors.phone = "Enter a valid phone number.";
    }

    if (!isPasswordStrong) {
      newErrors.password =
        "Password does not meet all requirements.";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword =
        "Please confirm your password.";
    } else if (
      formData.password !== formData.confirmPassword
    ) {
      newErrors.confirmPassword =
        "Passwords do not match.";
    }

    if (!formData.agreeTerms) {
      newErrors.agreeTerms =
        "You must accept the terms to continue.";
    }

    return newErrors;
  };

  const handleChange = (event) => {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));

    setErrors((previous) => ({
      ...previous,
      [name]: "",
    }));

    setServerError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setLoading(true);
      setServerError("");

      const response = await fetch(
        `${API_URL}/api/auth/signup`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            fullName: formData.fullName.trim(),
            email: formData.email
              .trim()
              .toLowerCase(),
            phone: formData.phone.trim() || undefined,
            password: formData.password,
          }),
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "The server returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to create your account."
        );
      }

      navigate("/login", {
        replace: true,
        state: {
          message:
            "Account created successfully. Please sign in.",
        },
      });
    } catch (error) {
      console.error("Signup error:", error);

      if (error instanceof TypeError) {
        setServerError(
          "Unable to connect to the backend. Make sure the Node.js server is running on port 5000."
        );
      } else {
        setServerError(
          error.message ||
            "Something went wrong. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

      <div className="auth-background" />

      <div className="auth-wrapper signup-wrapper">

        <button
          type="button"
          className="back-home-btn"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={18} />
          <span>Back to Home</span>
        </button>

        <div className="auth-card signup-card">

          {/* BRAND */}

          <div className="auth-brand">

            <div className="auth-logo-icon">
              <Truck size={23} strokeWidth={2} />
            </div>

            <span>
              Fleet<span>Flow</span>
            </span>

          </div>

          {/* HEADING */}

          <div className="auth-heading">

            <div className="auth-heading-icon">
              <ShieldCheck
                size={25}
                strokeWidth={2}
              />
            </div>

            <h1>Create Your Account</h1>

            <p>
              Create your FleetFlow account.
            </p>

          </div>

          {/* ADMIN NOTICE */}

          <div className="account-notice">

            <ShieldCheck
              size={18}
              strokeWidth={2}
            />

            <span>
              System roles and permissions are
              assigned securely by the administrator.
            </span>

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

            {/* FULL NAME */}

            <div className="auth-field">

              <label htmlFor="fullName">
                Full Name
              </label>

              <div
                className={`auth-input ${
                  errors.fullName
                    ? "input-error"
                    : ""
                }`}
              >

                <User
                  size={18}
                  strokeWidth={2}
                />

                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={handleChange}
                  disabled={loading}
                />

              </div>

              {errors.fullName && (
                <span className="field-error">
                  {errors.fullName}
                </span>
              )}

            </div>

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

                <Mail
                  size={18}
                  strokeWidth={2}
                />

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                />

              </div>

              {errors.email && (
                <span className="field-error">
                  {errors.email}
                </span>
              )}

            </div>

            {/* PHONE */}

            <div className="auth-field">

              <label htmlFor="phone">

                <span>Phone Number</span>

                <span className="optional-label">
                  Optional
                </span>

              </label>

              <div
                className={`auth-input ${
                  errors.phone
                    ? "input-error"
                    : ""
                }`}
              >

                <Phone
                  size={18}
                  strokeWidth={2}
                />

                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="Enter your phone number"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={loading}
                />

              </div>

              {errors.phone && (
                <span className="field-error">
                  {errors.phone}
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

                <Lock
                  size={18}
                  strokeWidth={2}
                />

                <input
                  id="password"
                  name="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword(
                      (previous) => !previous
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

            {/* PASSWORD REQUIREMENTS */}

            <div className="password-requirements">

              <PasswordRule
                valid={
                  passwordRequirements.minLength
                }
                text="At least 8 characters"
              />

              <PasswordRule
                valid={
                  passwordRequirements.uppercase
                }
                text="One uppercase letter"
              />

              <PasswordRule
                valid={
                  passwordRequirements.lowercase
                }
                text="One lowercase letter"
              />

              <PasswordRule
                valid={
                  passwordRequirements.number
                }
                text="One number"
              />

              <PasswordRule
                valid={
                  passwordRequirements.specialCharacter
                }
                text="One special character"
              />

            </div>

            {/* CONFIRM PASSWORD */}

            <div className="auth-field">

              <label htmlFor="confirmPassword">
                Confirm Password
              </label>

              <div
                className={`auth-input ${
                  errors.confirmPassword
                    ? "input-error"
                    : ""
                }`}
              >

                <Lock
                  size={18}
                  strokeWidth={2}
                />

                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  value={
                    formData.confirmPassword
                  }
                  onChange={handleChange}
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowConfirmPassword(
                      (previous) => !previous
                    )
                  }
                  aria-label={
                    showConfirmPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>

              </div>

              {errors.confirmPassword && (
                <span className="field-error">
                  {errors.confirmPassword}
                </span>
              )}

            </div>

            {/* TERMS */}

            <div className="terms-container">

              <label className="terms-label">

                <input
                  type="checkbox"
                  name="agreeTerms"
                  checked={
                    formData.agreeTerms
                  }
                  onChange={handleChange}
                  disabled={loading}
                />

                <span>
                  I agree to the Terms of Service
                  and Privacy Policy.
                </span>

              </label>

              {errors.agreeTerms && (
                <span className="field-error">
                  {errors.agreeTerms}
                </span>
              )}

            </div>

            {/* SUBMIT */}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading
                ? "Creating Account..."
                : "Create Account"}
            </button>

          </form>

          {/* LOGIN LINK */}

          <p className="auth-switch">

            Already have an account?

            <Link to="/login">
              Sign In
            </Link>

          </p>

        </div>

      </div>

    </div>
  );
}

function PasswordRule({ valid, text }) {
  return (
    <div
      className={`password-rule ${
        valid ? "valid" : ""
      }`}
    >

      <span className="password-rule-icon">
        <Check
          size={14}
          strokeWidth={2.5}
        />
      </span>

      <span>{text}</span>

    </div>
  );
}

export default Signup;