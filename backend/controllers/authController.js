const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");

const COOKIE_NAME = "fleet_token";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000,
};

// Remove password and other sensitive information
const sanitizeUser = (user) => {
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
};

// ==========================
// SIGNUP
// ==========================
const signup = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      password,
    } = req.body;

    // Required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Full name, email and password are required.",
      });
    }

    const cleanFullName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? phone.trim() : null;

    // Full name validation
    if (cleanFullName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Full name must contain at least 2 characters.",
      });
    }

    // Email validation
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least 8 characters.",
      });
    }

    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least one uppercase letter.",
      });
    }

    if (!/[a-z]/.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least one lowercase letter.",
      });
    }

    if (!/[0-9]/.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least one number.",
      });
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least one special character.",
      });
    }

    // Check existing user
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          "An account with this email already exists.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
      password,
      12
    );

    // IMPORTANT:
    // Never accept role from frontend.
    // Public signup gets CUSTOMER.
    const user = await User.create({
      fullName: cleanFullName,
      email: normalizedEmail,
      phone: cleanPhone,
      password: hashedPassword,
      role: "CUSTOMER",
    });

    // Generate JWT
    const token = generateToken(
      user._id.toString()
    );

    // Store JWT in HttpOnly cookie
    res.cookie(
      COOKIE_NAME,
      token,
      cookieOptions
    );

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create account.",
    });
  }
};

// ==========================
// LOGIN
// ==========================
const login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required.",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive.",
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = generateToken(
      user._id.toString()
    );

    res.cookie(
      COOKIE_NAME,
      token,
      cookieOptions
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to login.",
    });
  }
};

// ==========================
// LOGOUT
// ==========================
const logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
};

module.exports = {
  signup,
  login,
  logout,
};