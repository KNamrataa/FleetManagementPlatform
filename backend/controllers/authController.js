const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { COOKIE_NAME, cookieOptions } = require("../utils/authCookie");
const sanitizeUser = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role === "DISPATCHER" ? "TRIP_MANAGER" : user.role,
  isActive: user.isActive,
  accountStatus: user.accountStatus || (user.isActive === false ? "INACTIVE" : "ACTIVE"),
  lastLoginAt: user.lastLoginAt || null,
});
const signup = async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        message: "Full name, email and password are required.",
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters.",
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : null,
      password: hashedPassword,
      role: "CUSTOMER",
    });
    const token = generateToken(user._id, user.accessVersion);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(500).json({
      message: "Server error during signup.",
    });
  }
};

const googleLogin = async (req, res) => {
  try {
    const credential = String(req.body?.credential || "").trim();

    if (!credential) {
      return res.status(400).json({
        message: "Google authentication credential is required.",
      });
    }

    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    if (!clientId) {
      console.error("Google login error: GOOGLE_CLIENT_ID is not configured.");
      return res.status(500).json({
        message: "Google login is not configured on the server.",
      });
    }
    const googleResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    const googleData = await googleResponse.json().catch(() => ({}));

    if (!googleResponse.ok) {
      return res.status(401).json({
        message: "Google authentication failed. Please try again.",
      });
    }

    const tokenAudience = String(googleData.aud || "");
    const issuer = String(googleData.iss || "");
    const email = String(googleData.email || "").trim().toLowerCase();
    const googleId = String(googleData.sub || "").trim();
    const emailVerified = String(googleData.email_verified || "").toLowerCase() === "true";

    if (
      tokenAudience !== clientId ||
      !["accounts.google.com", "https://accounts.google.com"].includes(issuer) ||
      !email ||
      !googleId ||
      !emailVerified
    ) {
      return res.status(401).json({
        message: "The Google account could not be verified.",
      });
    }

    const fullName =
      String(googleData.name || "").trim() ||
      String(googleData.given_name || "").trim() ||
      email.split("@")[0];

    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    }).select("+password");

    if (user) {
      const sameGoogleAccount = user.googleId && user.googleId === googleId;

      if (user.googleId && !sameGoogleAccount) {
        return res.status(409).json({
          message: "This email is already linked to a different Google account.",
        });
      }

      if (!user.googleId) {
        user.googleId = googleId;
      }

      if (!user.authProvider || user.authProvider === "LOCAL") {
        user.authProvider = "GOOGLE";
      }
    } else {
      // Google-created accounts are still given a random password so the
      // existing User schema and local-password flow remain untouched.
      const randomPassword = crypto.randomBytes(48).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      user = new User({
        fullName: fullName.slice(0, 100),
        email,
        phone: null,
        password: hashedPassword,
        role: "CUSTOMER",
        googleId,
        authProvider: "GOOGLE",
      });
    }

    const isActive =
      user.isActive !== false &&
      user.accountStatus !== "INACTIVE";

    if (!isActive) {
      return res.status(403).json({
        message: "Your account is inactive.",
      });
    }

    user.lastLoginAt = new Date();
    user.loginFailedAttempts = 0;
    user.loginLockedUntil = null;
    await user.save();

    const token = generateToken(user._id, user.accessVersion);
    res.cookie(COOKIE_NAME, token, cookieOptions);

    return res.status(200).json({
      message: "Google login successful.",
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(500).json({
      message: "Server error during Google login.",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password +loginFailedAttempts +loginLockedUntil");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      return res.status(429).json({ message: "Too many failed login attempts. Please try again later." });
    }
    const isActive =
      user.isActive !== false &&
      user.accountStatus !== "INACTIVE";
    if (!isActive) {
      return res.status(403).json({
        message: "Your account is inactive.",
      });
    }
    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );
    if (!passwordMatch) {
      user.loginFailedAttempts = Number(user.loginFailedAttempts || 0) + 1;
      if (user.loginFailedAttempts >= 5) {
        user.loginLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.loginFailedAttempts = 0;
      }
      await user.save();
      return res.status(401).json({ message: "Invalid email or password." });
    }
    user.loginFailedAttempts = 0;
    user.loginLockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();
    const token = generateToken(user._id, user.accessVersion);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    return res.status(200).json({
      message: "Login successful.",
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Server error during login.",
    });
  }
};
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password"
    );
    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }
    const isActive =
      user.isActive !== false &&
      user.accountStatus !== "INACTIVE";
    if (!isActive) {
      return res.status(403).json({
        message: "Your account is inactive.",
      });
    }
    return res.status(200).json({
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({
      message: "Unable to get current user.",
    });
  }
};
const logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  return res.status(200).json({
    message: "Logged out successfully.",
  });
};
const OTP_EXPIRY_MINUTES = Number(process.env.BREVO_OTP_EXPIRY_MINUTES || 10);
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.BREVO_OTP_RESEND_COOLDOWN_SECONDS || 60);
const OTP_MAX_ATTEMPTS = Number(process.env.BREVO_OTP_MAX_ATTEMPTS || 5);

const hashResetValue = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const sendPasswordResetOtpEmail = async ({ email, fullName, otp }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "FleetFlow";

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo email configuration is missing.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email,
          name: fullName || undefined,
        },
      ],
      subject: "Your FleetFlow password reset OTP",
      htmlContent: `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033"><div style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border:1px solid #e5eaf0;border-radius:16px"><div style="font-size:24px;font-weight:800;margin-bottom:20px">Fleet<span style="color:#dc2626">Flow</span></div><h2 style="margin:0 0 10px">Password Reset OTP</h2><p style="line-height:1.6">Hello ${fullName || "there"},</p><p style="line-height:1.6">Use the following one-time password to continue resetting your FleetFlow password:</p><div style="margin:24px 0;padding:18px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;font-size:32px;font-weight:800;letter-spacing:8px;color:#b91c1c">${otp}</div><p style="line-height:1.6">This OTP expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong> and can only be used a limited number of times.</p><p style="line-height:1.6;color:#64748b">If you did not request this password reset, you can safely ignore this email.</p></div></body></html>`,
    }),
  });

  if (!response.ok) {
    const providerData = await response.json().catch(() => ({}));
    const providerMessage = providerData?.message || `Brevo returned HTTP ${response.status}.`;
    throw new Error(providerMessage);
  }

  return response.json().catch(() => ({}));
};

const requestPasswordReset = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const genericMessage = "If an account exists for that email, a verification OTP has been sent.";

    if (!email) {
      return res.status(400).json({ message: "Email address is required." });
    }

    const user = await User.findOne({ email }).select(
      "+passwordResetOtpHash +passwordResetOtpExpires +passwordResetOtpLastSentAt"
    );
    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    const now = Date.now();
    if (
      user.passwordResetOtpLastSentAt &&
      now - new Date(user.passwordResetOtpLastSentAt).getTime() <
        OTP_RESEND_COOLDOWN_SECONDS * 1000
    ) {
      const remaining = Math.ceil(
        (OTP_RESEND_COOLDOWN_SECONDS * 1000 -
          (now - new Date(user.passwordResetOtpLastSentAt).getTime())) /
          1000
      );
      return res.status(429).json({
        message: `Please wait ${remaining} seconds before requesting another OTP.`,
        retryAfterSeconds: remaining,
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashResetValue(otp);
    const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    user.passwordResetOtpHash = otpHash;
    user.passwordResetOtpExpires = expires;
    user.passwordResetOtpAttempts = 0;
    user.passwordResetOtpLastSentAt = new Date();
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    try {
      await sendPasswordResetOtpEmail({
        email: user.email,
        fullName: user.fullName,
        otp,
      });
    } catch (emailError) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpires = null;
      user.passwordResetOtpAttempts = 0;
      user.passwordResetOtpLastSentAt = null;
      await user.save().catch(() => {});
      console.error("Brevo password reset email error:", emailError);
      return res.status(502).json({
        message: "We could not send the verification email right now. Please try again later.",
      });
    }

    return res.status(200).json({
      message: genericMessage,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    });
  } catch (error) {
    console.error("Password reset OTP request error:", error);
    return res.status(500).json({ message: "Unable to process the password reset request." });
  }
};

const verifyPasswordResetOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Enter the 6-digit verification OTP." });
    }

    const user = await User.findOne({ email }).select(
      "+passwordResetOtpHash +passwordResetOtpExpires"
    );

    if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpires) {
      return res.status(400).json({ message: "The OTP is invalid or has expired." });
    }

    if (user.passwordResetOtpExpires <= new Date()) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpires = null;
      user.passwordResetOtpAttempts = 0;
      user.passwordResetOtpLastSentAt = null;
      await user.save();
      return res.status(400).json({ message: "The OTP has expired. Please request a new OTP." });
    }

    if (Number(user.passwordResetOtpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpires = null;
      user.passwordResetOtpAttempts = 0;
      user.passwordResetOtpLastSentAt = null;
      await user.save();
      return res.status(429).json({ message: "Too many incorrect OTP attempts. Please request a new OTP." });
    }

    const submittedHash = hashResetValue(otp);
    const expectedBuffer = Buffer.from(user.passwordResetOtpHash, "hex");
    const submittedBuffer = Buffer.from(submittedHash, "hex");
    const matches =
      expectedBuffer.length === submittedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, submittedBuffer);

    if (!matches) {
      user.passwordResetOtpAttempts = Number(user.passwordResetOtpAttempts || 0) + 1;
      await user.save();
      const remaining = Math.max(
        OTP_MAX_ATTEMPTS - user.passwordResetOtpAttempts,
        0
      );
      return res.status(400).json({
        message: remaining
          ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many incorrect OTP attempts. Please request a new OTP.",
      });
    }
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordTokenHash = hashResetValue(resetToken);
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpires = null;
    user.passwordResetOtpAttempts = 0;
    user.passwordResetOtpLastSentAt = null;
    await user.save();

    return res.status(200).json({
      message: "OTP verified successfully.",
      resetToken,
      expiresInSeconds: 10 * 60,
    });
  } catch (error) {
    console.error("Password reset OTP verification error:", error);
    return res.status(500).json({ message: "Unable to verify the OTP." });
  }
};

const changePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirmPassword || "");
    if (!currentPassword) return res.status(400).json({ message: "Current password is required." });
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return res.status(400).json({ message: "New password must be at least 8 characters and contain a letter and number." });
    if (password !== confirmPassword) return res.status(400).json({ message: "Password and confirm password do not match." });
    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found." });
    if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(401).json({ message: "Current password is incorrect." });
    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpires = null;
    user.passwordResetOtpAttempts = 0;
    user.passwordResetOtpLastSentAt = null;
    user.forcePasswordChange = false;
    user.accessVersion = Number(user.accessVersion || 0) + 1;
    await user.save();
    return res.json({ success: true, message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Unable to change password." });
  }
};

const resetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!token) return res.status(400).json({ message: "Password reset token is required." });
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return res.status(400).json({ message: "Password must be at least 8 characters and contain a letter and number." });
    if (password !== confirmPassword) return res.status(400).json({ message: "Password and confirm password do not match." });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordTokenHash +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({ message: "This password reset link is invalid or has expired." });
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpires = null;
    user.passwordResetOtpAttempts = 0;
    user.passwordResetOtpLastSentAt = null;
    user.forcePasswordChange = false;
    user.accessVersion = Number(user.accessVersion || 0) + 1;
    await user.save();

    return res.status(200).json({ message: "Password reset successfully. You can now sign in with your new password." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Unable to reset the password." });
  }
};

module.exports = {
  signup,
  login,
  googleLogin,
  getCurrentUser,
  logout,
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPassword,
  changePassword,
};