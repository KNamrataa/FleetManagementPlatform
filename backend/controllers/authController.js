const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { COOKIE_NAME, cookieOptions } = require("../utils/authCookie");
const sanitizeUser = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isActive: user.isActive,
  accountStatus: user.accountStatus,
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
    const token = generateToken(user._id);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    return res.status(201).json({
      message: "Account created successfully.",
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
    }).select("+password");
    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }
    const isActive =
      user.isActive === true ||
      user.accountStatus === "ACTIVE";
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
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }
    user.lastLoginAt = new Date();
    await user.save();
    const token = generateToken(user._id);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    return res.status(200).json({
      message: "Login successful.",
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
      user.isActive === true ||
      user.accountStatus === "ACTIVE";
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
module.exports = {
  signup,
  login,
  getCurrentUser,
  logout,
};