const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Vehicle = require("../models/Vehicle");
const DriverProfile = require("../models/DriverProfile");
const Trip = require("../models/Trip");
const TripRequest = require("../models/TripRequest");
const MaintenanceRecord = require("../models/MaintenanceRecord");
const TripTracking = require("../models/TripTracking");
const FuelExpense = require("../models/FuelExpense");
const MaintenanceWorkOrder = require("../models/MaintenanceWorkOrder");
const VehicleIssue = require("../models/VehicleIssue");
const MaintenanceSchedule = require("../models/MaintenanceSchedule");
const Expense = require("../models/Expense");
const TripExpense = require("../models/TripExpense");
const DriverExpense = require("../models/DriverExpense");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Budget = require("../models/Budget");
const AuditLog = require("../models/AuditLog");
const { paginationParams, paginationMeta } = require("../utils/pagination");
const { getTrackingHealth } = require("../services/trackingService");
const { permissionsForRole } = require("../utils/permissions");

const ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "FLEET_MANAGER",
  "TRIP_MANAGER",
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

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dateRange = (req, field) => {
  const filter = {};
  if (req.query.from) { const d = new Date(req.query.from); if (!Number.isNaN(d.getTime())) { d.setHours(0,0,0,0); filter[field] = { $gte: d }; } }
  if (req.query.to) { const d = new Date(req.query.to); if (!Number.isNaN(d.getTime())) { d.setHours(23,59,59,999); filter[field] = { ...(filter[field] || {}), $lte: d }; } }
  return filter;
};

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
    const { page, limit, skip } = paginationParams(req, { limit: 25, max: 100 });
    const filter = {};
    if (req.query.role && ALLOWED_ROLES.includes(String(req.query.role).toUpperCase())) filter.role = String(req.query.role).toUpperCase();
    if (req.query.status) filter.accountStatus = String(req.query.status).toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    if (req.query.search?.trim()) { const rx = new RegExp(escapeRegex(req.query.search.trim()), "i"); filter.$or = [{ fullName: rx }, { email: rx }, { phone: rx }]; }
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("-password -resetPasswordTokenHash -resetPasswordExpires").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    return res.status(200).json({ success: true, count: users.length, users: users.map(sanitizeUser), pagination: paginationMeta(page, limit, total) });
  } catch (error) { console.error("Get users error:", error); return sendError(res, 500, "Unable to load users. Please try again."); }
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
      Trip.countDocuments({ tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS", "PAUSED"] } }),
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
    const { page, limit, skip } = paginationParams(req, { limit: 25, max: 100 });
    const filter = req.query.active === "true" ? { status: { $ne: "INACTIVE" } } : {};
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query.search?.trim()) { const rx = new RegExp(escapeRegex(req.query.search.trim()), "i"); filter.$or = [{ registrationNumber: rx }, { vehicleNumber: rx }, { make: rx }, { model: rx }, { vehicleType: rx }]; }
    const [total, vehicles] = await Promise.all([
      Vehicle.countDocuments(filter),
      Vehicle.find(filter).populate("assignedDriver", "fullName email phone isActive accountStatus").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    return res.status(200).json({ success: true, count: vehicles.length, vehicles, pagination: paginationMeta(page, limit, total) });
  } catch (error) { console.error("Get admin vehicles error:", error); return sendError(res, 500, "Unable to load vehicles."); }
};


const getAdminDrivers = async (req, res) => {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 25, max: 100 });
    const userFilter = { role: "DRIVER", ...(req.query.active === "true" ? { isActive: true, accountStatus: { $ne: "INACTIVE" } } : {}) };
    if (req.query.search?.trim()) { const rx = new RegExp(escapeRegex(req.query.search.trim()), "i"); userFilter.$or = [{ fullName: rx }, { email: rx }, { phone: rx }]; }
    const [total, drivers] = await Promise.all([
      User.countDocuments(userFilter),
      User.find(userFilter).select("fullName email phone isActive accountStatus createdAt updatedAt").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    const profiles = await DriverProfile.find({ user: { $in: drivers.map(d => d._id) } }).populate("assignedVehicle", "registrationNumber vehicleNumber vehicleType status").lean();
    const profileByUser = new Map(profiles.map(p => [p.user.toString(), p]));
    const result = drivers.map(driver => ({ ...driver, profile: profileByUser.get(driver._id.toString()) || null }));
    return res.status(200).json({ success: true, count: result.length, drivers: result, pagination: paginationMeta(page, limit, total) });
  } catch (error) { console.error("Get admin drivers error:", error); return sendError(res, 500, "Unable to load drivers."); }
};


const getSuperAdminDashboardOverview = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      totalUsers,
      activeUsers,
      totalCustomers,
      totalVehicles,
      vehicleStatusAgg,
      totalDrivers,
      activeDrivers,
      tripStatusAgg,
      maintenanceCostAgg,
      fuelCostAgg,
      vehicles,
      drivers,
      recentTrips,
      recentActivities,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isActive: { $ne: false }, accountStatus: { $ne: "INACTIVE" } }),
      User.countDocuments({ role: "CUSTOMER" }),
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
      MaintenanceRecord.aggregate([
        { $match: { completionDate: { $gte: monthStart, $lt: nextMonthStart } } },
        { $group: { _id: null, total: { $sum: "$totalCost" } } },
      ]),
      FuelExpense.aggregate([
        { $match: { fuelDate: { $gte: monthStart, $lt: nextMonthStart } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
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
      AuditLog.find({}).populate("actor", "fullName role").sort({ createdAt: -1 }).limit(8).lean(),
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
    const activeTrips = (tripStatus.ASSIGNED || 0) + (tripStatus.IN_PROGRESS || 0) + (tripStatus.PAUSED || 0);

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
        totalUsers,
        activeUsers,
        totalCustomers,
        totalVehicles,
        activeVehicles: Math.max(totalVehicles - (vehicleStatus.INACTIVE || 0), 0),
        totalDrivers,
        activeDrivers,
        activeTrips,
        maintenanceCostThisMonth: maintenanceCostAgg[0]?.total || 0,
        fuelCostThisMonth: fuelCostAgg[0]?.total || 0,
      },
      vehicleStatus,
      tripStatus,
      drivers: normalizedDrivers,
      vehicles,
      liveFleet,
      recentTrips,
      recentActivities: recentActivities.map(a => ({ title: `${a.actor?.fullName || "System"} — ${a.action}`, time: a.createdAt })),
    });
  } catch (error) {
    console.error("Get Super Admin dashboard overview error:", error);
    return sendError(res, 500, "Unable to load Super Admin dashboard data.");
  }
};


const getAdminTrips = async (req, res) => {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 25, max: 100 });
    const filter = { ...dateRange(req, "scheduledStart") };
    if (req.query.status) filter.tripStatus = String(req.query.status).toUpperCase();
    if (req.query.search?.trim()) { const rx = new RegExp(escapeRegex(req.query.search.trim()), "i"); filter.$or = [{ tripId: rx }, { pickupLocation: rx }, { destination: rx }]; }
    const [total, trips] = await Promise.all([
      Trip.countDocuments(filter),
      Trip.find(filter).populate("customer", "fullName email").populate("vehicle", "registrationNumber vehicleType status").populate("driver", "fullName email phone").sort({ scheduledStart: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    return res.status(200).json({ success: true, count: trips.length, trips, pagination: paginationMeta(page, limit, total) });
  } catch (error) { console.error("Get admin trips error:", error); return sendError(res, 500, "Unable to load trip data."); }
};


const getAdminTracking = async (req, res) => {
  try {
    const { page, limit } = paginationParams(req, { limit: 50, max: 200 });
    const tracking = await TripTracking.find({}).populate("trip", "tripId tripStatus pickupLocation destination scheduledStart").populate("vehicle", "registrationNumber vehicleType status").populate("driver", "fullName phone email").sort({ recordedAt: -1 }).limit(1000).lean();
    const latestByTrip = new Map(); tracking.forEach(item => { const key = item.trip?._id?.toString() || item.trip?.toString() || item._id.toString(); if (!latestByTrip.has(key)) latestByTrip.set(key, item); });
    const rows=await getTrackingHealth([...latestByTrip.values()]); const start=(page-1)*limit; const sliced=rows.slice(start,start+limit);
    return res.status(200).json({ success:true, count:sliced.length, tracking:sliced, pagination:paginationMeta(page,limit,rows.length), generatedAt:new Date() });
  } catch(error){ console.error("Get admin tracking error:",error); return sendError(res,500,"Unable to load live tracking data."); }
};


const getAdminFuel = async (req, res) => {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 25, max: 100 });
    const filter = dateRange(req, "fuelDate");
    if (req.query.vehicleId && isValidId(req.query.vehicleId)) filter.vehicle = req.query.vehicleId;
    const [totalCount, fuel] = await Promise.all([
      FuelExpense.countDocuments(filter),
      FuelExpense.find(filter).populate("vehicle", "registrationNumber vehicleType").populate("driver", "fullName").populate("trip", "tripId").sort({ fuelDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    const totals = await FuelExpense.aggregate([{ $match: filter }, { $group: { _id:null, total:{ $sum:"$totalAmount" }, litres:{ $sum:"$litres" } } }]);
    return res.status(200).json({ success:true, count:fuel.length, total:totals[0]?.total||0, litres:totals[0]?.litres||0, fuel, pagination:paginationMeta(page,limit,totalCount) });
  } catch(error){ console.error("Get admin fuel error:",error); return sendError(res,500,"Unable to load fuel data."); }
};


const getAdminMaintenance = async (req, res) => {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 25, max: 100 });
    const vehicleFilter = req.query.vehicleId && isValidId(req.query.vehicleId) ? { vehicle: req.query.vehicleId } : {};
    const [issues, workOrders, records, schedules] = await Promise.all([
      VehicleIssue.find(vehicleFilter).populate("vehicle", "registrationNumber vehicleType status").populate("reportedBy", "fullName role").sort({ createdAt:-1 }).skip(skip).limit(limit).lean(),
      MaintenanceWorkOrder.find(vehicleFilter).populate("vehicle", "registrationNumber vehicleType status").sort({ createdAt:-1 }).skip(skip).limit(limit).lean(),
      MaintenanceRecord.find(vehicleFilter).populate("vehicle", "registrationNumber vehicleType").sort({ completionDate:-1, createdAt:-1 }).skip(skip).limit(limit).lean(),
      MaintenanceSchedule.find(vehicleFilter).populate("vehicle", "registrationNumber vehicleType status").sort({ nextServiceDate:1 }).skip(skip).limit(limit).lean(),
    ]);
    const maintenanceCost = records.reduce((sum,item)=>sum+Number(item.totalCost||0),0)+workOrders.filter(item=>!['COMPLETED','CANCELLED'].includes(item.status)).reduce((sum,item)=>sum+Number(item.totalCost||0),0);
    return res.status(200).json({success:true,issues,workOrders,records,schedules,maintenanceCost,pagination:{page,limit}});
  } catch(error){ console.error("Get admin maintenance error:",error); return sendError(res,500,"Unable to load maintenance data."); }
};


const getAdminExpenses = async (req, res) => {
  try {
    const { page, limit } = paginationParams(req, { limit: 25, max: 100 });
    const general=await Expense.find(dateRange(req,"expenseDate")).populate("vehicle","registrationNumber").populate("driver","fullName").populate("trip","tripId").sort({expenseDate:-1}).limit(500).lean();
    const trip=await TripExpense.find(dateRange(req,"expenseDate")).populate("vehicle","registrationNumber").populate("driver","fullName").populate("trip","tripId").sort({expenseDate:-1}).limit(500).lean();
    const driver=await DriverExpense.find(dateRange(req,"expenseDate")).populate("vehicle","registrationNumber").populate("driver","fullName").populate("trip","tripId").sort({expenseDate:-1}).limit(500).lean();
    const fuel=await FuelExpense.find(dateRange(req,"fuelDate")).populate("vehicle","registrationNumber").populate("driver","fullName").populate("trip","tripId").sort({fuelDate:-1}).limit(500).lean();
    const payments=await Payment.find(dateRange(req,"paymentDate")).populate("invoice","invoiceNumber").populate("customer","fullName email").sort({paymentDate:-1}).limit(500).lean();
    const expenseRows=[...general.map(x=>({...x,source:"GENERAL",date:x.expenseDate,amount:Number(x.amount||0),reference:x.expenseNumber})),...trip.map(x=>({...x,source:"TRIP",date:x.expenseDate,amount:Number(x.amount||0),reference:x.expenseNumber})),...driver.map(x=>({...x,source:"DRIVER",date:x.expenseDate,amount:Number(x.amount||0),reference:x.expenseNumber})),...fuel.map(x=>({...x,source:"FUEL",date:x.fuelDate,amount:Number(x.totalAmount||0),reference:x.fuelNumber}))].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
    const totalExpenses=expenseRows.reduce((sum,x)=>sum+Number(x.amount||0),0), totalPayments=payments.reduce((sum,x)=>sum+Number(x.amount||0),0);
    const start=(page-1)*limit;
    return res.json({success:true,expenses:expenseRows.slice(start,start+limit),payments:payments.slice(0,limit),totalExpenses,totalPayments,pagination:paginationMeta(page,limit,expenseRows.length)});
  } catch(error){console.error("Get admin expenses error:",error);return sendError(res,500,"Unable to load expense data.");}
};


const getAdminReports = async (req, res) => {
  try {
    const tripRange=dateRange(req,"scheduledStart"), expenseRange=dateRange(req,"expenseDate"), fuelRange=dateRange(req,"fuelDate"), invoiceRange=dateRange(req,"invoiceDate");
    const [usersByRole, vehicleStatus, tripStatus, expenseByCategory, invoiceStatus, paymentSummary, maintenanceSummary, budgetSummary, fuelTotal, tripExpenseTotal, driverExpenseTotal, generalExpenseTotal, revenue, monthlyTrips, monthlyExpenses, utilization] = await Promise.all([
      User.aggregate([{ $group:{_id:"$role",count:{$sum:1}} },{$sort:{count:-1}}]),
      Vehicle.aggregate([{ $group:{_id:"$status",count:{$sum:1}} },{$sort:{count:-1}}]),
      Trip.aggregate([{ $match:tripRange },{$group:{_id:"$tripStatus",count:{$sum:1}} },{$sort:{count:-1}}]),
      Expense.aggregate([{ $match:expenseRange },{$group:{_id:"$category",amount:{$sum:"$amount"},count:{$sum:1}} },{$sort:{amount:-1}}]),
      Invoice.aggregate([{ $match:invoiceRange },{ $group:{_id:"$status",count:{$sum:1},total:{$sum:"$totalAmount"},balance:{$sum:"$balanceAmount"}} },{$sort:{total:-1}}]),
      Payment.aggregate([{ $group:{_id:"$type",count:{$sum:1},amount:{$sum:"$amount"}} }]),
      MaintenanceRecord.aggregate([{ $group:{_id:null,count:{$sum:1},cost:{$sum:"$totalCost"}} }]),
      Budget.aggregate([{ $group:{_id:"$status",count:{$sum:1},allocated:{$sum:"$allocatedAmount"},spent:{$sum:"$spentAmount"}} }]),
      FuelExpense.aggregate([{ $match:fuelRange },{$group:{_id:null,total:{$sum:"$totalAmount"},litres:{$sum:"$litres"}}}]),
      TripExpense.aggregate([{ $match:expenseRange },{$group:{_id:null,total:{$sum:"$amount"}}}]),
      DriverExpense.aggregate([{ $match:expenseRange },{$group:{_id:null,total:{$sum:"$amount"}}}]),
      Expense.aggregate([{ $match:expenseRange },{$group:{_id:null,total:{$sum:"$amount"}}}]),
      Invoice.aggregate([{ $match:{...invoiceRange,status:{$ne:"CANCELLED"}} },{$group:{_id:null,total:{$sum:"$totalAmount"},paid:{$sum:"$paidAmount"},outstanding:{$sum:"$balanceAmount"}}}]),
      Trip.aggregate([{ $match:tripRange },{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$scheduledStart"}},count:{$sum:1}} },{$sort:{_id:1}}]),
      Expense.aggregate([{ $match:expenseRange },{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$expenseDate"}},amount:{$sum:"$amount"}} },{$sort:{_id:1}}]),
      Trip.aggregate([{ $match:{vehicle:{$ne:null},...tripRange} },{$group:{_id:"$vehicle",trips:{$sum:1},distance:{$sum:"$distance"}} },{$lookup:{from:"vehicles",localField:"_id",foreignField:"_id",as:"vehicle"}},{$unwind:{path:"$vehicle",preserveNullAndEmptyArrays:true}},{$project:{_id:0,vehicleId:"$_id",registrationNumber:"$vehicle.registrationNumber",trips:1,distance:1}},{$sort:{trips:-1}},{$limit:20}]),
    ]);
    const maxVehicleTrips = Math.max(1, ...utilization.map(x => Number(x.trips || 0)));
    const utilizationRows = utilization.map(x => ({ ...x, utilizationPercent: Math.round((Number(x.trips || 0) / maxVehicleTrips) * 100) }));
    return res.status(200).json({success:true,usersByRole,vehicleStatus,tripStatus,expenseByCategory,invoiceStatus,paymentSummary,maintenanceSummary:maintenanceSummary[0]||{count:0,cost:0},budgetSummary,monthlyTrips,monthlyExpenses,utilization:utilizationRows,totals:{fuel:fuelTotal[0]?.total||0,fuelLitres:fuelTotal[0]?.litres||0,tripExpenses:tripExpenseTotal[0]?.total||0,driverExpenses:driverExpenseTotal[0]?.total||0,generalExpenses:generalExpenseTotal[0]?.total||0,revenue:revenue[0]?.total||0,paidRevenue:revenue[0]?.paid||0,outstandingRevenue:revenue[0]?.outstanding||0}});
  } catch(error){console.error("Get admin reports error:",error);return sendError(res,500,"Unable to load report data.");}
};


const getAdminAuditLogs = async (req, res) => {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 30, max: 100 });
    const filter = {};
    if (req.query.action?.trim()) filter.action = new RegExp(escapeRegex(req.query.action.trim()), "i");
    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter).populate("actor", "fullName email role").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    return res.json({ success:true, logs, pagination:paginationMeta(page,limit,total) });
  } catch(error){ console.error("Get audit logs error:",error); return sendError(res,500,"Unable to load audit logs."); }
};

const toCsv = (rows, columns) => {
  const esc = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [columns.map(c => esc(c.label)).join(","), ...rows.map(row => columns.map(c => esc(c.get(row))).join(","))].join("\n");
};

const exportAdminData = async (req, res) => {
  try {
    const resource = String(req.params.resource || "").toLowerCase();
    let rows = [], columns = [];
    if (resource === "trips") {
      rows = await Trip.find({}).populate("customer","fullName email").populate("driver","fullName email").populate("vehicle","registrationNumber").sort({createdAt:-1}).limit(5000).lean();
      columns=[{label:"Trip ID",get:r=>r.tripId},{label:"Customer",get:r=>r.customer?.fullName},{label:"Route",get:r=>`${r.pickupLocation} -> ${r.destination}`},{label:"Driver",get:r=>r.driver?.fullName},{label:"Vehicle",get:r=>r.vehicle?.registrationNumber},{label:"Status",get:r=>r.tripStatus},{label:"Scheduled",get:r=>r.scheduledStart},{label:"Distance (km)",get:r=>r.distance}];
    } else if (resource === "vehicles") {
      rows=await Vehicle.find({}).populate("assignedDriver","fullName").sort({createdAt:-1}).limit(5000).lean(); columns=[{label:"Registration",get:r=>r.registrationNumber},{label:"Vehicle",get:r=>`${r.make||""} ${r.model||""}`.trim()},{label:"Type",get:r=>r.vehicleType},{label:"Driver",get:r=>r.assignedDriver?.fullName},{label:"Status",get:r=>r.status},{label:"Odometer",get:r=>r.currentOdometer}];
    } else if (resource === "drivers") {
      rows=await User.find({role:"DRIVER"}).select("fullName email phone isActive accountStatus").sort({createdAt:-1}).limit(5000).lean(); columns=[{label:"Driver",get:r=>r.fullName},{label:"Email",get:r=>r.email},{label:"Phone",get:r=>r.phone},{label:"Status",get:r=>r.accountStatus}];
    } else if (resource === "tracking") {
      rows=await TripTracking.find({}).populate("trip","tripId").populate("vehicle","registrationNumber").populate("driver","fullName").sort({recordedAt:-1}).limit(5000).lean();
      columns=[{label:"Trip",get:r=>r.trip?.tripId},{label:"Vehicle",get:r=>r.vehicle?.registrationNumber},{label:"Driver",get:r=>r.driver?.fullName},{label:"Latitude",get:r=>r.latitude},{label:"Longitude",get:r=>r.longitude},{label:"Speed",get:r=>r.speed},{label:"Recorded At",get:r=>r.recordedAt}];
    } else if (resource === "fuel") {
      rows=await FuelExpense.find({}).populate("vehicle","registrationNumber").populate("driver","fullName").sort({fuelDate:-1}).limit(5000).lean(); columns=[{label:"Fuel No.",get:r=>r.fuelNumber},{label:"Date",get:r=>r.fuelDate},{label:"Vehicle",get:r=>r.vehicle?.registrationNumber},{label:"Driver",get:r=>r.driver?.fullName},{label:"Fuel Type",get:r=>r.fuelType},{label:"Litres",get:r=>r.litres},{label:"Amount",get:r=>r.totalAmount}];
    } else if (resource === "expenses") {
      rows=await Expense.find({}).sort({expenseDate:-1}).limit(5000).lean(); columns=[{label:"Expense No.",get:r=>r.expenseNumber},{label:"Date",get:r=>r.expenseDate},{label:"Category",get:r=>r.category},{label:"Description",get:r=>r.description},{label:"Amount",get:r=>r.amount},{label:"Status",get:r=>r.status}];
    } else if (resource === "maintenance") {
      rows=await MaintenanceWorkOrder.find({}).populate("vehicle","registrationNumber").sort({createdAt:-1}).limit(5000).lean(); columns=[{label:"Work Order",get:r=>r.workOrderNumber},{label:"Vehicle",get:r=>r.vehicle?.registrationNumber},{label:"Type",get:r=>r.maintenanceType},{label:"Priority",get:r=>r.priority},{label:"Status",get:r=>r.status},{label:"Total Cost",get:r=>r.totalCost},{label:"Expected Completion",get:r=>r.expectedCompletionDate}];
    } else if (resource === "reports") {
      const [trips, invoices, fuel, maintenance] = await Promise.all([
        Trip.find({}).select("tripId tripStatus distance scheduledStart").sort({scheduledStart:-1}).limit(5000).lean(),
        Invoice.find({}).select("invoiceNumber status totalAmount paidAmount balanceAmount invoiceDate").sort({invoiceDate:-1}).limit(5000).lean(),
        FuelExpense.find({}).select("fuelNumber fuelDate litres totalAmount").sort({fuelDate:-1}).limit(5000).lean(),
        MaintenanceRecord.find({}).select("completionDate totalCost").sort({completionDate:-1}).limit(5000).lean(),
      ]);
      rows = [
        ...trips.map(r=>({category:"TRIP", reference:r.tripId, status:r.tripStatus, date:r.scheduledStart, amount:r.distance})),
        ...invoices.map(r=>({category:"INVOICE", reference:r.invoiceNumber, status:r.status, date:r.invoiceDate, amount:r.totalAmount, paid:r.paidAmount, balance:r.balanceAmount})),
        ...fuel.map(r=>({category:"FUEL", reference:r.fuelNumber, status:"RECORDED", date:r.fuelDate, amount:r.totalAmount, litres:r.litres})),
        ...maintenance.map(r=>({category:"MAINTENANCE", reference:"", status:"COMPLETED", date:r.completionDate, amount:r.totalCost})),
      ];
      columns=[{label:"Category",get:r=>r.category},{label:"Reference",get:r=>r.reference},{label:"Status",get:r=>r.status},{label:"Date",get:r=>r.date},{label:"Amount / Distance",get:r=>r.amount},{label:"Paid",get:r=>r.paid},{label:"Balance",get:r=>r.balance},{label:"Litres",get:r=>r.litres}];
    } else if (resource === "audit") {
      rows=await AuditLog.find({}).populate("actor","fullName email role").sort({createdAt:-1}).limit(5000).lean(); columns=[{label:"Time",get:r=>r.createdAt},{label:"Actor",get:r=>r.actor?.fullName},{label:"Role",get:r=>r.actor?.role},{label:"Action",get:r=>r.action},{label:"Path",get:r=>r.path},{label:"Status",get:r=>r.statusCode},{label:"IP",get:r=>r.ip}];
    } else { return sendError(res,400,"Unsupported export resource."); }
    const csv=toCsv(rows,columns); res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",`attachment; filename=fleetflow-${resource}-${new Date().toISOString().slice(0,10)}.csv`); return res.send(csv);
  } catch(error){ console.error("Admin CSV export error:",error); return sendError(res,500,"Unable to export data."); }
};

const getAdminSettings = async (req, res) => {
  try {
    const admin = await User.findById(req.user._id).select("-password -resetPasswordTokenHash -resetPasswordExpires").lean();
    if (!admin) return sendError(res, 404, "Super Admin account not found.");
    const auditLogs = await AuditLog.find({}).populate("actor", "fullName email role").sort({ createdAt: -1 }).limit(20).lean();
    return res.status(200).json({
      success: true,
      profile: { ...sanitizeUser(admin), permissions: permissionsForRole(admin.role) },
      auditLogs,
      system: {
        application: "FleetFlow",
        environment: process.env.NODE_ENV || "development",
        apiPort: Number(process.env.PORT || 5000),
        database: "MongoDB",
        authentication: "JWT + HttpOnly Cookie",
        realtime: "Socket.IO",
        frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
      },
    });
  } catch (error) {
    console.error("Get admin settings error:", error);
    return sendError(res, 500, "Unable to load settings data.");
  }
};

// Additive: powers the "Financial Overview / Customer Overview / Maintenance
// Overview / Driver Overview / Live Fleet Map" panels on the Super Admin
// overview page. The frontend already called GET /api/admin/overview-extras
// for this data; this endpoint didn't exist yet, which is what left
// `overviewExtras` unset and crashed the overview render.
const getAdminOverviewExtras = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      activeCustomers,
      newRequests,
      activeCustomerTrips,
      completedCustomerTrips,
      expenseAgg,
      fuelAgg,
      maintenanceAgg,
      tripExpenseAgg,
      revenueAgg,
      vehiclesUnderMaintenance,
      serviceDueSoon,
      overdueMaintenance,
      completedThisMonth,
      totalDrivers,
      driverStatusAgg,
      liveVehicles,
    ] = await Promise.all([
      User.countDocuments({ role: "CUSTOMER" }),
      User.countDocuments({ role: "CUSTOMER", isActive: { $ne: false }, accountStatus: { $ne: "INACTIVE" } }),
      TripRequest.countDocuments({ status: "PENDING" }),
      Trip.countDocuments({ customer: { $ne: null }, tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] } }),
      Trip.countDocuments({ customer: { $ne: null }, tripStatus: "COMPLETED" }),
      Expense.aggregate([
        { $match: { expenseDate: { $gte: monthStart, $lt: nextMonthStart }, status: { $in: ["APPROVED", "PAID"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      FuelExpense.aggregate([
        { $match: { fuelDate: { $gte: monthStart, $lt: nextMonthStart } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      MaintenanceRecord.aggregate([
        { $match: { completionDate: { $gte: monthStart, $lt: nextMonthStart } } },
        { $group: { _id: null, total: { $sum: "$totalCost" } } },
      ]),
      TripExpense.aggregate([
        { $match: { expenseDate: { $gte: monthStart, $lt: nextMonthStart }, status: { $in: ["APPROVED", "PAID"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Invoice.aggregate([
        { $match: { invoiceDate: { $gte: monthStart, $lt: nextMonthStart }, status: { $in: ["ISSUED", "PARTIALLY_PAID", "PAID"] } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Vehicle.countDocuments({ status: "MAINTENANCE" }),
      MaintenanceSchedule.countDocuments({ status: { $ne: "COMPLETED" }, nextServiceDate: { $gte: now, $lte: soon } }),
      MaintenanceSchedule.countDocuments({ status: "OVERDUE" }),
      MaintenanceRecord.countDocuments({ completionDate: { $gte: monthStart, $lt: nextMonthStart } }),
      DriverProfile.countDocuments({}),
      DriverProfile.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Vehicle.find({ status: { $in: ["ON_TRIP", "ASSIGNED"] } })
        .populate("assignedDriver", "fullName")
        .select("registrationNumber vehicleType status assignedDriver")
        .limit(20)
        .lean(),
    ]);

    const driverStatus = Object.fromEntries(driverStatusAgg.map((item) => [item._id, item.count]));

    let liveFleet = liveVehicles;
    if (liveVehicles.length) {
      const activeTrips = await Trip.find({
        vehicle: { $in: liveVehicles.map((v) => v._id) },
        tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] },
      }).select("_id tripId vehicle").lean();
      const tripByVehicle = new Map(activeTrips.map((trip) => [trip.vehicle.toString(), trip]));

      const trackingDocs = activeTrips.length
        ? await TripTracking.aggregate([
            { $match: { trip: { $in: activeTrips.map((trip) => trip._id) } } },
            { $sort: { recordedAt: -1 } },
            { $group: { _id: "$trip", doc: { $first: "$$ROOT" } } },
          ])
        : [];
      const trackingByTrip = new Map(trackingDocs.map((entry) => [entry._id.toString(), entry.doc]));

      liveFleet = liveVehicles.map((vehicle) => {
        const trip = tripByVehicle.get(vehicle._id.toString());
        const tracking = trip ? trackingByTrip.get(trip._id.toString()) : null;
        return {
          ...vehicle,
          tracking: tracking
            ? {
                latitude: tracking.latitude,
                longitude: tracking.longitude,
                speed: tracking.speed,
                currentLocation: tracking.currentLocation,
                recordedAt: tracking.recordedAt,
                trip: trip ? { tripId: trip.tripId } : null,
                driver: vehicle.assignedDriver || null,
              }
            : null,
        };
      });
    }

    return res.status(200).json({
      success: true,
      financial: {
        totalExpenses: expenseAgg[0]?.total || 0,
        fuelCost: fuelAgg[0]?.total || 0,
        maintenanceCost: maintenanceAgg[0]?.total || 0,
        tripExpenses: tripExpenseAgg[0]?.total || 0,
        revenue: revenueAgg[0]?.total || 0,
      },
      customers: {
        total: totalCustomers,
        active: activeCustomers,
        newRequests,
        activeTrips: activeCustomerTrips,
        completedTrips: completedCustomerTrips,
      },
      maintenance: {
        vehiclesUnderMaintenance,
        serviceDueSoon,
        overdue: overdueMaintenance,
        completedThisMonth,
        totalCost: maintenanceAgg[0]?.total || 0,
      },
      drivers: {
        total: totalDrivers,
        status: driverStatus,
      },
      liveFleet,
    });
  } catch (error) {
    console.error("Get admin overview extras error:", error);
    return sendError(res, 500, "Unable to load overview extras.");
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
  getAdminTrips,
  getAdminTracking,
  getAdminFuel,
  getAdminMaintenance,
  getAdminExpenses,
  getAdminReports,
  getAdminSettings,
  getAdminAuditLogs,
  exportAdminData,
  getAdminOverviewExtras,
};
