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
const requestPasswordReset = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const genericMessage = "If an account exists for that email, a password reset link has been generated.";

    if (!email) {
      return res.status(400).json({ message: "Email address is required." });
    }

    const user = await User.findOne({ email }).select("+resetPasswordTokenHash +resetPasswordExpires");

    // Do not reveal whether an email is registered.
    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
    const resetUrl = `${frontendOrigin}/reset-password?token=${rawToken}`;

    // This project currently has no email provider configured. In development,
    // return the one-time reset URL so the complete flow can be tested safely.
    // In production, configure an email provider and replace this development
    // delivery path rather than exposing reset tokens to clients.
    if (process.env.NODE_ENV === "development") {
      return res.status(200).json({ message: genericMessage, resetUrl });
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    console.error("Password reset request error:", error);
    return res.status(500).json({ message: "Unable to process the password reset request." });
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
  getCurrentUser,
  logout,
  requestPasswordReset,
  resetPassword,
  changePassword,
};