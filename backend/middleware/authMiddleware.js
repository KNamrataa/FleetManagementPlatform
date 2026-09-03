const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { COOKIE_NAME } = require("../utils/authCookie");
const authenticate = async (req, res, next) => {
  try {
    // Prefer the Bearer token when supplied. This allows different browser
    // tabs to hold different FleetFlow accounts in sessionStorage without
    // one login overwriting another tab's authentication context.
    let token = null;
    if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      }
    }
    if (!token && req.cookies && req.cookies[COOKIE_NAME]) {
      token = req.cookies[COOKIE_NAME];
    }
    if (!token) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );
    const user = await User.findById(decoded.userId).select(
      "-password"
    );
    if (!user) {
      return res.status(401).json({
        message: "User not found.",
      });
    }
    if (user.isActive === false || user.accountStatus === "INACTIVE") {
      return res.status(403).json({
        message: "Your account is inactive.",
      });
    }
    if (
      user.accountStatus &&
      user.accountStatus !== "ACTIVE"
    ) {
      return res.status(403).json({
        message: "Your account is inactive.",
      });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(401).json({
      message: "Invalid or expired authentication token.",
    });
  }
};
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Authentication required.",
        });
      }
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          message: "Access denied. Insufficient permissions.",
        });
      }
      next();
    } catch (error) {
      console.error("Authorization error:", error);
      return res.status(403).json({
        message: "Access denied.",
      });
    }
  };
};
module.exports = {
  authenticate,
  authorize,
};