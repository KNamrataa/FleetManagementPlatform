const mongoose = require("mongoose");
const User = require("../models/User");
const ASSIGNABLE_ROLES = [
  "CUSTOMER",
  "FLEET_MANAGER",
  "DISPATCHER",
  "DRIVER",
  "MAINTENANCE_MANAGER",
  "FINANCE_MANAGER",
  "VIEWER",
];
const sanitizeUser = (user) => ({
  id: user._id.toString(),
  _id: user._id.toString(),
  fullName: user.fullName,
  email: user.email,
  phone: user.phone || null,
  role: user.role,
  isActive: user.isActive !== false,

  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
const getUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({
      success: true,
      count: users.length,
      users: users.map(sanitizeUser),
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load users.",
    });
  }
};
const assignRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }
    if (!role || !ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role selected.",
        allowedRoles: ASSIGNABLE_ROLES,
      });
    }
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }
    if (req.user._id.toString() === id) {
      return res.status(403).json({
        success: false,
        message: "You cannot change your own Super Admin role.",
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
        message: "Super Admin accounts are protected.",
      });
    }
    user.role = role;
    await user.save();
    return res.status(200).json({
      success: true,
      message: `Role updated to ${role}.`,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Assign role error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to assign role.",
    });
  }
};
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }
    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false.",
      });
    }
    if (req.user._id.toString() === id) {
      return res.status(403).json({
        success: false,
        message: "You cannot deactivate your own account.",
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
        message: "Super Admin accounts are protected.",
      });
    }
    user.isActive = isActive;
    await user.save();
    return res.status(200).json({
      success: true,
      message: isActive
        ? "User activated successfully."
        : "User deactivated successfully.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update user status.",
    });
  }
};
module.exports = {
  getUsers,
  assignRole,
  updateUserStatus,
};