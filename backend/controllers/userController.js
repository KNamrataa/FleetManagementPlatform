const User = require("../models/User");
const ALLOWED_EMPLOYEE_ROLES = [
  "FLEET_MANAGER",
  "DISPATCHER",
  "DRIVER",
  "MAINTENANCE_MANAGER",
  "FINANCE_MANAGER",
  "VIEWER",
];
const getUsers = async (req, res) => {
  try {
    const users =
      await User.find()
        .select("-password")
        .sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error(
      "Get users error:",
      error
    );
    return res.status(500).json({
      success: false,
      message: "Unable to fetch users.",
    });
  }
};
const assignRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required.",
      });
    }
    if (
      !ALLOWED_EMPLOYEE_ROLES.includes(
        role
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid employee role.",
      });
    }
    const user =
      await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    if (
      user.role === "SUPER_ADMIN"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Super Admin role cannot be changed using this endpoint.",
      });
    }
    user.role = role;
    await user.save();
    return res.status(200).json({
      success: true,
      message:
        `Role assigned successfully: ${role}`,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        accountStatus:
          user.accountStatus,
      },
    });
  } catch (error) {
    console.error(
      "Assign role error:",
      error
    );
    return res.status(500).json({
      success: false,
      message:
        "Unable to assign role.",
    });
  }
};
module.exports = {
  getUsers,
  assignRole,
};