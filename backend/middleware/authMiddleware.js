const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { COOKIE_NAME } = require("../utils/authCookie");
const { permissionsForRole, hasPermission } = require("../utils/permissions");
const RolePermission = require("../models/RolePermission");
const authenticate = async (req, res, next) => {
  try {
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
    if (Number(decoded.accessVersion || 0) !== Number(user.accessVersion || 0)) {
      return res.status(401).json({ message: "Your session has been revoked. Please sign in again." });
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
    req.user.permissions = permissionsForRole(user.role);
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
const requirePermission = (permission) => async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ success:false, message:"Authentication required." });
    if (req.user.role === "SUPER_ADMIN") return next();
    const doc = await RolePermission.findOne({ role: req.user.role }).lean();
    const allowed = doc?.permissions?.[permission];
    if (allowed === true || (allowed === undefined && hasPermission(req.user.role, permission))) return next();
    return res.status(403).json({ success:false, message:"Access denied. Insufficient permissions." });
  } catch (e) { return res.status(403).json({success:false,message:"Access denied."}); }
};
module.exports = { authenticate, authorize, requirePermission };