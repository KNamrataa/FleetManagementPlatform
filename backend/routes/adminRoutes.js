const express = require("express");
const router = express.Router();
const {
  authenticate,
  authorize,
} = require("../middleware/authMiddleware");
const User = require("../models/User");
router.get(
  "/users",
  authenticate,
  authorize("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const users = await User.find()
        .select("-password")
        .sort({ createdAt: -1 });
      return res.status(200).json({
        success: true,
        users,
      });
    } catch (error) {
      console.error("Get users error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch users.",
      });
    }
  }
);
router.put(
  "/users/:id/role",
  authenticate,
  authorize("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const allowedRoles = [
        "FLEET_MANAGER",
        "DISPATCHER",
        "DRIVER",
        "MAINTENANCE_MANAGER",
        "FINANCE_MANAGER",
        "VIEWER",
        "CUSTOMER",
      ];
      if (!role) {
        return res.status(400).json({
          success: false,
          message: "Role is required.",
        });
      }
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role.",
        });
      }
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }
      if (user.role === "SUPER_ADMIN") {
        return res.status(403).json({
          success: false,
          message: "Super Admin role cannot be changed.",
        });
      }
      user.role = role;
      await user.save();
      const safeUser = user.toObject();
      delete safeUser.password;
      return res.status(200).json({
        success: true,
        message: "Role assigned successfully.",
        user: safeUser,
      });
    } catch (error) {
      console.error("Assign role error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to assign role.",
      });
    }
  }
);
router.patch(
  "/users/:id/status",
  authenticate,
  authorize("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }
      if (user.role === "SUPER_ADMIN") {
        return res.status(403).json({
          success: false,
          message: "Super Admin account cannot be modified.",
        });
      }
      user.isActive = !user.isActive;
      user.accountStatus = user.isActive
        ? "ACTIVE"
        : "INACTIVE";
      await user.save();
      const safeUser = user.toObject();
      delete safeUser.password;
      return res.status(200).json({
        success: true,
        message: user.isActive
          ? "User activated successfully."
          : "User deactivated successfully.",
        user: safeUser,
      });
    } catch (error) {
      console.error("Update status error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to update account status.",
      });
    }
  }
);
module.exports = router;