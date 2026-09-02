const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Vehicle = require("../models/Vehicle");
const DriverProfile = require("../models/DriverProfile");
const Trip = require("../models/Trip");

const ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "FLEET_MANAGER",
  "DISPATCHER",
  "DRIVER",
  "MAINTENANCE_MANAGER",
  "FINANCE_MANAGER",
  "VIEWER",
  "CUSTOMER",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s().-]{6,19}$/;
const BCRYPT_REGEX = /^\$2[aby]?\$\d{2}\$/;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizedIsActive = (user) => {
  if (user.isActive === false) return false;
  if (user.accountStatus === "INACTIVE") return false;
  return true;
};

const sanitizeUser = (user) => {
  const value = typeof user.toObject === "function" ? user.toObject() : user;
  const isActive = normalizedIsActive(value);

  return {
    id: value._id?.toString(),
    _id: value._id?.toString(),
    fullName: value.fullName,
    email: value.email,
    phone: value.phone || null,
    role: value.role,
    isActive,
    accountStatus: isActive ? "ACTIVE" : "INACTIVE",
    createdAt: value.createdAt || null,
    updatedAt: value.updatedAt || null,
    lastLoginAt: value.lastLoginAt || null,
  };
};

const sendError = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

const validateUserFields = ({ fullName, email, phone, role }) => {
  if (!fullName || fullName.trim().length < 2) return "Full name must be at least 2 characters.";
  if (fullName.trim().length > 100) return "Full name cannot exceed 100 characters.";
  if (!email || !EMAIL_REGEX.test(email.trim())) return "Please provide a valid email address.";
  if (phone && !PHONE_REGEX.test(phone.trim())) return "Please provide a valid phone number.";
  if (!role || !ALLOWED_ROLES.includes(role)) return "Invalid role selected.";
  return null;
};

const findUser = async (id) => {
  if (!isValidId(id)) return null;
  return User.findById(id).select("-password");
};

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
    return sendError(res, 500, "Unable to load users. Please try again.");
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await findUser(req.params.userId);
    if (!user) return sendError(res, 404, "User not found.");

    return res.status(200).json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    console.error("Get user error:", error);
    return sendError(res, 500, "Unable to load the user.");
  }
};

const createUser = async (req, res) => {
  try {
    const { fullName, email, phone, password, confirmPassword, role, accountStatus } = req.body;

    const fieldError = validateUserFields({ fullName, email, phone, role });
    if (fieldError) return sendError(res, 400, fieldError);

    if (!password || password.length < 8) {
      return sendError(res, 400, "Password must be at least 8 characters.");
    }
    if (password !== confirmPassword) {
      return sendError(res, 400, "Password and confirm password do not match.");
    }
    if (accountStatus && !["ACTIVE", "INACTIVE"].includes(accountStatus)) {
      return sendError(res, 400, "Invalid account status.");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail }).select("_id");
    if (existing) return sendError(res, 409, "An account with this email already exists.");

    const safePassword = BCRYPT_REGEX.test(password) ? password : await bcrypt.hash(password, 12);
    const isActive = (accountStatus || "ACTIVE") === "ACTIVE";

    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : null,
      password: safePassword,
      role,
      isActive,
      accountStatus: isActive ? "ACTIVE" : "INACTIVE",
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Create user error:", error);
    if (error?.code === 11000) return sendError(res, 409, "An account with this email already exists.");
    return sendError(res, 500, "Failed to create user. Please try again.");
  }
};

const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { fullName, email, phone, role, accountStatus, isActive } = req.body;

    const user = await findUser(userId);
    if (!user) return sendError(res, 404, "User not found.");

    const nextRole = role ?? user.role;
    const nextStatus = accountStatus ?? (typeof isActive === "boolean" ? (isActive ? "ACTIVE" : "INACTIVE") : normalizedIsActive(user) ? "ACTIVE" : "INACTIVE");

    const fieldError = validateUserFields({
      fullName: fullName ?? user.fullName,
      email: email ?? user.email,
      phone: phone ?? user.phone,
      role: nextRole,
    });
    if (fieldError) return sendError(res, 400, fieldError);
    if (!["ACTIVE", "INACTIVE"].includes(nextStatus)) return sendError(res, 400, "Invalid account status.");

    if (user.role === "SUPER_ADMIN" && nextRole !== "SUPER_ADMIN") {
      return sendError(res, 403, "Super Admin accounts cannot be demoted.");
    }
    if (user.role === "SUPER_ADMIN" && nextStatus !== "ACTIVE") {
      return sendError(res, 403, "Super Admin accounts cannot be deactivated.");
    }

    const normalizedEmail = (email ?? user.email).trim().toLowerCase();
    const duplicate = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: user._id },
    }).select("_id");
    if (duplicate) return sendError(res, 409, "An account with this email already exists.");

    user.fullName = (fullName ?? user.fullName).trim();
    user.email = normalizedEmail;
    user.phone = phone ? phone.trim() : null;
    user.role = nextRole;
    user.isActive = nextStatus === "ACTIVE";
    user.accountStatus = nextStatus;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "User updated successfully.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Update user error:", error);
    if (error?.code === 11000) return sendError(res, 409, "An account with this email already exists.");
    return sendError(res, 500, "Failed to update user. Please try again.");
  }
};

const assignRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!isValidId(userId)) return sendError(res, 400, "Invalid user ID.");
    if (!ALLOWED_ROLES.includes(role)) return sendError(res, 400, "Invalid role selected.", { allowedRoles: ALLOWED_ROLES });

    const user = await User.findById(userId).select("-password");
    if (!user) return sendError(res, 404, "User not found.");

    if (user.role === "SUPER_ADMIN") return sendError(res, 403, "Super Admin accounts are protected and cannot be demoted.");
    if (role === "SUPER_ADMIN") {
      // Creating/assigning a Super Admin is intentionally allowed only through this authenticated Super Admin endpoint.
      user.role = "SUPER_ADMIN";
    } else {
      user.role = role;
    }

    await user.save();
    return res.status(200).json({ success: true, message: "Role assigned successfully.", user: sanitizeUser(user) });
  } catch (error) {
    console.error("Assign role error:", error);
    return sendError(res, 500, "Failed to assign role. Please try again.");
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, accountStatus } = req.body;

    if (!isValidId(userId)) return sendError(res, 400, "Invalid user ID.");
    const nextIsActive = typeof isActive === "boolean" ? isActive : accountStatus === "ACTIVE" ? true : accountStatus === "INACTIVE" ? false : null;
    if (nextIsActive === null) return sendError(res, 400, "Provide a valid account status.");

    const user = await User.findById(userId).select("-password");
    if (!user) return sendError(res, 404, "User not found.");
    if (user.role === "SUPER_ADMIN") return sendError(res, 403, "Super Admin accounts are protected and cannot be deactivated.");

    user.isActive = nextIsActive;
    user.accountStatus = nextIsActive ? "ACTIVE" : "INACTIVE";
    await user.save();

    return res.status(200).json({
      success: true,
      message: nextIsActive ? "Account activated successfully." : "Account deactivated successfully.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return sendError(res, 500, "Failed to update account status. Please try again.");
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) return sendError(res, 400, "Invalid user ID.");

    const user = await User.findById(userId);
    if (!user) return sendError(res, 404, "User not found.");
    if (user.role === "SUPER_ADMIN") return sendError(res, 403, "Super Admin accounts are protected and cannot be deleted.");

    await User.deleteOne({ _id: userId });
    return res.status(200).json({ success: true, message: "User deleted successfully.", userId });
  } catch (error) {
    console.error("Delete user error:", error);
    return sendError(res, 500, "Failed to delete user. Please try again.");
  }
};


const getFleetOverview = async (req, res) => {
  try {
    const [totalVehicles, activeVehicles, vehicleStatus, totalDrivers, activeDrivers, driverStatus, activeTrips] = await Promise.all([
      Vehicle.countDocuments({}),
      Vehicle.countDocuments({ status: { $ne: "INACTIVE" } }),
      Vehicle.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.countDocuments({ role: "DRIVER" }),
      User.countDocuments({ role: "DRIVER", isActive: true, accountStatus: { $ne: "INACTIVE" } }),
      DriverProfile.aggregate([
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "driverUser" } },
        { $unwind: "$driverUser" },
        { $match: { "driverUser.role": "DRIVER" } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Trip.countDocuments({ tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] } }),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalVehicles,
        activeVehicles,
        totalDrivers,
        activeDrivers,
        activeTrips,
      },
      vehicleStatus,
      driverStatus,
    });
  } catch (error) {
    console.error("Get fleet overview error:", error);
    return sendError(res, 500, "Unable to load fleet overview.");
  }
};

const getAdminVehicles = async (req, res) => {
  try {
    const filter = req.query.active === "true"
      ? { status: { $ne: "INACTIVE" } }
      : {};

    const vehicles = await Vehicle.find(filter)
      .populate("assignedDriver", "fullName email phone isActive accountStatus")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      vehicles,
    });
  } catch (error) {
    console.error("Get admin vehicles error:", error);
    return sendError(res, 500, "Unable to load vehicles.");
  }
};

const getAdminDrivers = async (req, res) => {
  try {
    const userFilter = {
      role: "DRIVER",
      ...(req.query.active === "true"
        ? { isActive: true, accountStatus: { $ne: "INACTIVE" } }
        : {}),
    };

    const drivers = await User.find(userFilter)
      .select("fullName email phone isActive accountStatus createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    const userIds = drivers.map((driver) => driver._id);
    const profiles = await DriverProfile.find({ user: { $in: userIds } })
      .populate("assignedVehicle", "registrationNumber vehicleNumber vehicleType status")
      .lean();

    const profileByUser = new Map(
      profiles.map((profile) => [profile.user.toString(), profile])
    );

    const result = drivers.map((driver) => ({
      ...driver,
      profile: profileByUser.get(driver._id.toString()) || null,
    }));

    return res.status(200).json({
      success: true,
      count: result.length,
      drivers: result,
    });
  } catch (error) {
    console.error("Get admin drivers error:", error);
    return sendError(res, 500, "Unable to load drivers.");
  }
};


const getSuperAdminDashboardOverview = async (req, res) => {
  try {
    const [totalVehicles, vehicleStatusAgg, totalDrivers, activeDrivers, tripStatusAgg, vehicles, drivers, recentTrips] = await Promise.all([
      Vehicle.countDocuments({}),
      Vehicle.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.countDocuments({ role: "DRIVER" }),
      User.countDocuments({ role: "DRIVER", isActive: true, accountStatus: { $ne: "INACTIVE" } }),
      Trip.aggregate([
        { $group: { _id: "$tripStatus", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Vehicle.find({ status: { $ne: "INACTIVE" } })
        .populate("assignedDriver", "fullName email phone isActive accountStatus")
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(8)
        .lean(),
      User.find({ role: "DRIVER", isActive: true, accountStatus: { $ne: "INACTIVE" } })
        .select("fullName email phone isActive accountStatus updatedAt")
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean(),
      Trip.find({})
        .populate("customer", "fullName email")
        .populate("vehicle", "registrationNumber vehicleNumber vehicleType status")
        .populate("driver", "fullName email phone")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const profileIds = drivers.map((driver) => driver._id);
    const profiles = await DriverProfile.find({ user: { $in: profileIds } })
      .populate("assignedVehicle", "registrationNumber vehicleType status")
      .lean();
    const profileByUser = new Map(profiles.map((profile) => [profile.user.toString(), profile]));

    const normalizedDrivers = drivers.map((driver) => {
      const profile = profileByUser.get(driver._id.toString()) || null;
      return {
        ...driver,
        profile,
        driverStatus: profile?.status || (driver.isActive ? "AVAILABLE" : "INACTIVE"),
        assignedVehicle: profile?.assignedVehicle || null,
      };
    });

    const vehicleStatus = Object.fromEntries(vehicleStatusAgg.map((item) => [item._id, item.count]));
    const tripStatus = Object.fromEntries(tripStatusAgg.map((item) => [item._id, item.count]));
    const activeTrips = (tripStatus.ASSIGNED || 0) + (tripStatus.IN_PROGRESS || 0);

    const liveFleet = vehicles
      .filter((vehicle) => vehicle.assignedDriver || vehicle.status === "ON_TRIP")
      .slice(0, 8)
      .map((vehicle) => ({
        _id: vehicle._id,
        registrationNumber: vehicle.registrationNumber,
        vehicleType: vehicle.vehicleType,
        status: vehicle.status,
        driver: vehicle.assignedDriver || null,
      }));

    return res.status(200).json({
      success: true,
      stats: {
        totalVehicles,
        activeVehicles: Math.max(totalVehicles - (vehicleStatus.INACTIVE || 0), 0),
        totalDrivers,
        activeDrivers,
        activeTrips,
      },
      vehicleStatus,
      tripStatus,
      drivers: normalizedDrivers,
      vehicles,
      liveFleet,
      recentTrips,
    });
  } catch (error) {
    console.error("Get Super Admin dashboard overview error:", error);
    return sendError(res, 500, "Unable to load Super Admin dashboard data.");
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  assignRole,
  updateUserStatus,
  deleteUser,
  getFleetOverview,
  getAdminVehicles,
  getAdminDrivers,
  getSuperAdminDashboardOverview,
};
