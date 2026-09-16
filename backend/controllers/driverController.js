const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Vehicle = require("../models/Vehicle");
const Trip = require("../models/Trip");
const Assignment = require("../models/Assignment");
const VehicleIssue = require("../models/VehicleIssue");
const { releasePair } = require("../utils/fleetHelpers");
const { safeNotify, notifyUsers } = require("../services/notificationService");
const { paginationParams, paginationMeta } = require("../utils/pagination");
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const clean = (s) => s?.trim();
async function getDrivers(req, res) {
  try {
    const { search = "", status = "" } = req.query;
    const users = await User.find({ role: "DRIVER" }).select("fullName email phone isActive accountStatus createdAt updatedAt lastLoginAt").sort({ createdAt: -1 }).lean();
    const profiles = await DriverProfile.find({ user: { $in: users.map(u => u._id) } }).populate({ path: "assignedVehicle", select: "registrationNumber vehicleType make model status" }).lean();
    const map = new Map(profiles.map(p => [p.user.toString(), p]));
    let drivers = users.map(u => ({ ...u, profile: map.get(u._id.toString()) || null, status: !u.isActive || u.accountStatus === "INACTIVE" ? "INACTIVE" : (map.get(u._id.toString())?.status || "AVAILABLE"), driverType: map.get(u._id.toString())?.driverType || "COMPANY_DRIVER", assignedVehicle: map.get(u._id.toString())?.assignedVehicle || null }));
    if (status) drivers = drivers.filter(d => d.status === status.toUpperCase());
    if (search.trim()) { const q = search.trim().toLowerCase(); drivers = drivers.filter(d => `${d.fullName} ${d.email} ${d.phone || ""} ${d.profile?.licenseNumber || ""}`.toLowerCase().includes(q)); }
    res.json({ success: true, count: drivers.length, drivers });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load drivers."); }
}

async function getDriver(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid driver ID.");
    const user = await User.findOne({ _id: req.params.id, role: "DRIVER" }).select("-password").lean(); if (!user) return fail(res, 404, "Driver not found.");
    const profile = await DriverProfile.findOne({ user: user._id }).populate({ path: "assignedVehicle", select: "registrationNumber vehicleType make model status" }).lean();
    const trips = await Trip.find({ driver: user._id }).select("tripId pickupLocation destination scheduledStart actualStart actualEnd tripStatus vehicle").populate("vehicle", "registrationNumber vehicleType").sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, driver: { ...user, profile, status: !user.isActive || user.accountStatus === "INACTIVE" ? "INACTIVE" : profile?.status || "AVAILABLE", driverType: profile?.driverType || "COMPANY_DRIVER", assignedVehicle: profile?.assignedVehicle || null, tripHistory: trips } });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load driver."); }
}

async function createDriver(req, res) {
  try {
    const { fullName, email, phone, password, licenseNumber, licenseExpiry, experience = 0, driverType = "COMPANY_DRIVER" } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password || !licenseNumber?.trim() || !licenseExpiry) return fail(res, 400, "Full name, email, password, license number and license expiry are required.");
    const normalizedDriverType = String(driverType || "COMPANY_DRIVER").toUpperCase();
    if (!["COMPANY_DRIVER", "OWNER_DRIVER"].includes(normalizedDriverType)) return fail(res, 400, "Invalid driver type.");
    if (password.length < 8) return fail(res, 400, "Password must be at least 8 characters.");
    const expiry = new Date(licenseExpiry); if (Number.isNaN(expiry.getTime())) return fail(res, 400, "Invalid license expiry date.");
    const normalizedEmail = email.trim().toLowerCase(); if (await User.exists({ email: normalizedEmail })) return fail(res, 409, "An account with this email already exists.");
    if (await DriverProfile.exists({ licenseNumber: licenseNumber.trim().toUpperCase() })) return fail(res, 409, "A driver with this license number already exists.");
    const user = await User.create({ fullName: fullName.trim(), email: normalizedEmail, phone: clean(phone) || null, password: await bcrypt.hash(password, 12), role: "DRIVER", isActive: true, accountStatus: "ACTIVE" });
    try { await DriverProfile.create({ user: user._id, driverType: normalizedDriverType, licenseNumber: licenseNumber.trim().toUpperCase(), licenseExpiry: expiry, experience: Number(experience) || 0, status: "AVAILABLE", availability: true }); }
    catch (e) { await User.deleteOne({ _id: user._id }); if (e.code === 11000) return fail(res, 409, "A driver with this license number already exists."); throw e; }
    const result = await User.findById(user._id).select("-password").lean(); const profile = await DriverProfile.findOne({ user: user._id }).lean();
    res.status(201).json({ success: true, message: "Driver created successfully.", driver: { ...result, profile, driverType: profile.driverType, status: "AVAILABLE" } });
  } catch (e) { console.error(e); if (e.code === 11000) return fail(res, 409, "An account with this email already exists."); fail(res, 500, "Failed to create driver."); }
}

async function updateDriver(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid driver ID.");
    const user = await User.findOne({ _id: req.params.id, role: "DRIVER" }); if (!user) return fail(res, 404, "Driver not found.");
    const { fullName, email, phone, licenseNumber, licenseExpiry, experience, status, driverType } = req.body;
    if (fullName !== undefined && fullName.trim().length < 2) return fail(res, 400, "Full name must be at least 2 characters.");
    if (email !== undefined) { const e = email.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return fail(res, 400, "Invalid email address."); const dup = await User.findOne({ email: e, _id: { $ne: user._id } }); if (dup) return fail(res, 409, "An account with this email already exists."); user.email = e; }
    if (fullName !== undefined) user.fullName = fullName.trim(); if (phone !== undefined) user.phone = phone.trim() || null;
    const profile = await DriverProfile.findOne({ user: user._id }); if (!profile) return fail(res, 404, "Driver profile not found.");
    if (licenseNumber !== undefined) { const ln = licenseNumber.trim().toUpperCase(); const dup = await DriverProfile.findOne({ licenseNumber: ln, user: { $ne: user._id } }); if (dup) return fail(res, 409, "A driver with this license number already exists."); profile.licenseNumber = ln; }
    if (licenseExpiry !== undefined) { const d = new Date(licenseExpiry); if (Number.isNaN(d.getTime())) return fail(res, 400, "Invalid license expiry date."); profile.licenseExpiry = d; }
    if (experience !== undefined) { if (Number(experience) < 0) return fail(res, 400, "Experience cannot be negative."); profile.experience = Number(experience); }
    if (driverType !== undefined) { const nextDriverType = String(driverType).toUpperCase(); if (!["COMPANY_DRIVER", "OWNER_DRIVER"].includes(nextDriverType)) return fail(res, 400, "Invalid driver type."); if (nextDriverType === "COMPANY_DRIVER" && await Vehicle.exists({ ownershipType: "DRIVER_OWNED", ownerId: user._id })) return fail(res, 409, "An Owner-Driver who owns a vehicle cannot be changed to Company Driver until the owned vehicle is transferred or removed."); profile.driverType = nextDriverType; }
    if (status !== undefined) { const allowed = ["AVAILABLE", "ASSIGNED", "ON_TRIP", "OFF_DUTY", "INACTIVE"]; if (!allowed.includes(status.toUpperCase())) return fail(res, 400, "Invalid driver status."); if (status.toUpperCase() === "INACTIVE") { if (await Trip.exists({ driver: user._id, tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] } })) return fail(res, 409, "Driver with an active trip cannot be deactivated."); user.isActive = false; user.accountStatus = "INACTIVE"; profile.status = "INACTIVE"; profile.availability = false; } else { user.isActive = true; user.accountStatus = "ACTIVE"; profile.status = status.toUpperCase(); profile.availability = !["OFF_DUTY", "ON_TRIP", "INACTIVE"].includes(status.toUpperCase()); } }
    await user.save(); await profile.save();
    res.json({ success: true, message: "Driver updated successfully.", driver: { ...(await User.findById(user._id).select("-password").lean()), profile: await DriverProfile.findById(profile._id).populate("assignedVehicle", "registrationNumber vehicleType status").lean() } });
  } catch (e) { console.error(e); fail(res, 500, "Failed to update driver."); }
}

async function setDriverStatus(req, res) {
  return updateDriver({ ...req, body: { ...req.body, status: req.body.status || (req.body.isActive ? "AVAILABLE" : "INACTIVE") } }, res);
}

async function unassignDriver(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid driver ID.");
    const profile = await DriverProfile.findOne({ user: req.params.id }); if (!profile) return fail(res, 404, "Driver profile not found.");
    if (await Trip.exists({ driver: req.params.id, tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] } })) return fail(res, 409, "Driver has an active trip and cannot be unassigned.");
    const vehicleId = profile.assignedVehicle; await releasePair(vehicleId, req.params.id); await Assignment.updateMany({ driver: req.params.id, assignmentStatus: "ACTIVE" }, { $set: { assignmentStatus: "UNASSIGNED", unassignedAt: new Date() } });
    res.json({ success: true, message: "Driver unassigned successfully." });
  } catch (e) { console.error(e); fail(res, 500, "Failed to unassign driver."); }
}

async function getDriverDashboard(req, res) {
  try {
    const driverId = req.user._id;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const [profile, todayTrips, activeTrip, completedTrips, distanceAgg, issuesCount] = await Promise.all([
      DriverProfile.findOne({ user: driverId })
        .populate("assignedVehicle", "registrationNumber vehicleNumber vehicleType make model year fuelType capacity currentOdometer status")
        .lean(),
      Trip.find({ driver: driverId, scheduledStart: { $gte: startOfToday, $lt: endOfToday } })
        .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
        .populate("customer", "fullName email")
        .sort({ scheduledStart: 1 })
        .lean(),
      Trip.findOne({ driver: driverId, tripStatus: { $in: ["IN_PROGRESS", "PAUSED"] } })
        .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
        .populate("customer", "fullName email")
        .sort({ actualStart: -1 })
        .lean(),
      Trip.countDocuments({ driver: driverId, tripStatus: "COMPLETED" }),
      Trip.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(driverId), tripStatus: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$distance" } } },
      ]),
      VehicleIssue.countDocuments({ reportedBy: driverId }),
    ]);

    let dashboardVehicle = profile?.assignedVehicle || null;
    if (profile?.driverType === "OWNER_DRIVER") {
      const ownedVehicle = await Vehicle.findOne({ ownershipType: "DRIVER_OWNED", ownerId: driverId })
        .sort({ createdAt: -1 })
        .lean();
      if (ownedVehicle) dashboardVehicle = ownedVehicle;
    }
    const driverStatus = profile?.status || "AVAILABLE";
    res.json({
      success: true,
      dashboard: {
        todayTrips: todayTrips.length,
        todayTripsList: todayTrips,
        activeTrip: activeTrip || null,
        completedTrips,
        totalDistance: distanceAgg[0]?.total || 0,
        assignedVehicle: dashboardVehicle,
        driverStatus,
        driverType: profile?.driverType || "COMPANY_DRIVER",
        issueCount: issuesCount,
        profile: profile || null,
      },
    });
  } catch (e) {
    console.error("Driver dashboard error:", e);
    fail(res, 500, "Unable to load driver dashboard.");
  }
}

async function getMyVehicle(req, res) {
  try {
    const profile = await DriverProfile.findOne({ user: req.user._id })
      .populate("assignedVehicle", "registrationNumber vehicleNumber vehicleType make model year fuelType capacity currentOdometer status assignedDriver ownershipType ownerId approvalStatus approvalReason documents insurance registration createdAt updatedAt")
      .lean();
    const driverType = profile?.driverType || "COMPANY_DRIVER";
    let vehicle = profile?.assignedVehicle || null;

    if (driverType === "OWNER_DRIVER") {
      const ownedVehicle = await Vehicle.findOne({ ownershipType: "DRIVER_OWNED", ownerId: req.user._id })
        .sort({ createdAt: -1 })
        .lean();
      if (ownedVehicle) vehicle = ownedVehicle;
    }

    if (!vehicle) {
      return res.json({ success: true, vehicle: null, driverType, message: driverType === "OWNER_DRIVER" ? "You have not registered a driver-owned vehicle." : "No vehicle is currently assigned to you." });
    }
    if (vehicle.ownershipType === "DRIVER_OWNED" && (!vehicle.ownerId || vehicle.ownerId.toString() !== req.user._id.toString())) {
      return res.json({ success: true, vehicle: null, driverType, message: "No vehicle is currently assigned to you." });
    }
    if (vehicle.ownershipType === "DRIVER_OWNED" && vehicle.assignedDriver && vehicle.assignedDriver.toString() !== req.user._id.toString()) {
      return fail(res, 403, "This vehicle is not assigned to your Owner-Driver account.");
    }
    res.json({ success: true, vehicle, driverType });
  } catch (e) {
    console.error("My vehicle error:", e);
    fail(res, 500, "Unable to load your vehicle.");
  }
}


async function createOwnerVehicle(req, res) {
  const vehicleController = require("./vehicleController");
  return vehicleController.createOwnerVehicle(req, res);
}

async function updateOwnerVehicle(req, res) {
  const vehicleController = require("./vehicleController");
  return vehicleController.updateOwnerVehicle(req, res);
}

async function addOwnerVehicleDocument(req, res) {
  const vehicleController = require("./vehicleController");
  return vehicleController.addOwnerVehicleDocument(req, res);
}

async function submitOwnerVehicleApproval(req, res) {
  const vehicleController = require("./vehicleController");
  return vehicleController.submitOwnerVehicleApproval(req, res);
}

async function getMyTrips(req, res) {
  try {
    const { search = "", status = "", date = "" } = req.query;
    const filter = { driver: req.user._id };
    if (status) {
      const allowed = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"];
      if (!allowed.includes(status.toUpperCase())) return fail(res, 400, "Invalid trip status.");
      filter.tripStatus = status.toUpperCase();
    }
    if (date) {
      const day = new Date(date);
      if (Number.isNaN(day.getTime())) return fail(res, 400, "Invalid date filter.");
      day.setHours(0, 0, 0, 0);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      filter.scheduledStart = { $gte: day, $lt: next };
    }
    if (search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(escaped, "i");
      const matchingCustomers = await User.find({ role: "CUSTOMER", $or: [{ fullName: rx }, { email: rx }, { phone: rx }] }).select("_id").lean();
      filter.$or = [{ tripId: rx }, { pickupLocation: rx }, { destination: rx }, { notes: rx }, { customer: { $in: matchingCustomers.map((customer) => customer._id) } }];
    }
    const { page, limit, skip } = paginationParams(req, { limit: 20, max: 100 });
    const [total, trips] = await Promise.all([
      Trip.countDocuments(filter),
      Trip.find(filter)
        .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
        .populate("customer", "fullName email phone")
        .sort({ scheduledStart: -1 }).skip(skip).limit(limit).lean(),
    ]);
    res.json({ success: true, count: trips.length, trips, pagination: paginationMeta(page, limit, total) });
  } catch (e) {
    console.error("My trips error:", e);
    fail(res, 500, "Unable to load your trips.");
  }
}

async function getMyTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await Trip.findOne({ _id: req.params.id, driver: req.user._id })
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model year fuelType capacity currentOdometer status")
      .populate("customer", "fullName email phone")
      .populate("driver", "fullName email phone")
      .lean();
    if (!trip) return fail(res, 404, "Trip not found for your account.");
    res.json({ success: true, trip });
  } catch (e) {
    console.error("My trip detail error:", e);
    fail(res, 500, "Unable to load trip details.");
  }
}

async function acceptMyTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await Trip.findOne({ _id: req.params.id, driver: req.user._id });
    if (!trip) return fail(res, 404, "Trip not found for your account.");
    if (trip.tripStatus !== "ASSIGNED") return fail(res, 409, "Only an assigned trip can be accepted.");
    if (!trip.vehicle) return fail(res, 409, "This trip does not have a vehicle assigned.");

    const profile = await DriverProfile.findOne({ user: req.user._id, assignedVehicle: trip.vehicle });
    if (!profile || profile.status !== "ASSIGNED" || profile.availability !== true) {
      return fail(res, 409, "You are not in a valid assigned state for this trip.");
    }
    const vehicle = await Vehicle.findOne({ _id: trip.vehicle, assignedDriver: req.user._id, status: "ASSIGNED" });
    if (!vehicle) return fail(res, 409, "The assigned vehicle could not be verified.");

    const acceptedAt = trip.driverAcceptedAt || new Date();
    trip.driverAcceptedAt = acceptedAt;
    await trip.save();
    const io = req.app.get("io");
    await safeNotify(() => notifyUsers({
      io,
      recipients: [trip.customer],
      type: "TRIP_ACCEPTED_BY_DRIVER",
      title: "Driver Accepted Trip",
      message: `Your driver has accepted trip ${trip.tripId}.`,
      link: `/customer/trips/${trip._id}`,
      data: { tripId: trip._id, tripNumber: trip.tripId, status: trip.tripStatus, driverAcceptedAt: acceptedAt },
    }));
    const result = await Trip.findById(trip._id)
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("customer", "fullName email phone")
      .lean();
    res.json({ success: true, message: "Trip accepted successfully.", trip: result });
  } catch (e) {
    console.error("Driver accept trip error:", e);
    fail(res, e.status || 500, e.message || "Failed to accept trip.");
  }
}

async function startMyTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const driverId = req.user._id;
    const trip = await Trip.findOne({ _id: req.params.id, driver: driverId });
    if (!trip) return fail(res, 404, "Trip not found for your account.");
    if (!trip.vehicle) return fail(res, 409, "This trip does not have a vehicle assigned.");
    if (trip.tripStatus !== "ASSIGNED") return fail(res, 409, "Only an assigned trip can be started from the driver portal.");
    if (!trip.driverAcceptedAt) return fail(res, 409, "Accept the assigned trip before starting it.");

    const activeDriverTrip = await Trip.exists({ driver: driverId, tripStatus: { $in: ["IN_PROGRESS", "PAUSED"] }, _id: { $ne: trip._id } });
    const activeVehicleTrip = await Trip.exists({ vehicle: trip.vehicle, tripStatus: { $in: ["IN_PROGRESS", "PAUSED"] }, _id: { $ne: trip._id } });
    if (activeDriverTrip) return fail(res, 409, "You already have another trip in progress.");
    if (activeVehicleTrip) return fail(res, 409, "The vehicle is already on another active trip.");

    const profile = await DriverProfile.findOne({ user: driverId });
    if (!profile || !profile.assignedVehicle || profile.assignedVehicle.toString() !== trip.vehicle.toString()) return fail(res, 409, "You are not currently assigned to this trip's vehicle.");
    if (!profile.availability || !["ASSIGNED", "AVAILABLE"].includes(profile.status)) return fail(res, 409, "Your driver status does not allow this trip to start.");

    const vehicle = await Vehicle.findOne({ _id: trip.vehicle });
    if (!vehicle || vehicle.assignedDriver?.toString() !== driverId.toString()) return fail(res, 409, "This vehicle is not assigned to you.");
    if (!["ASSIGNED", "AVAILABLE"].includes(vehicle.status)) return fail(res, 409, "Vehicle is not ready to start this trip.");

    const now = new Date();
    const oldVehicleStatus = vehicle.status;
    const oldDriverStatus = profile.status;
    const oldAvailability = profile.availability;
    try {
      vehicle.status = "ON_TRIP";
      await vehicle.save();
      profile.status = "ON_TRIP";
      profile.availability = false;
      await profile.save();
      trip.tripStatus = "IN_PROGRESS";
      trip.actualStart = now;
      await trip.save();
    } catch (e) {
      vehicle.status = oldVehicleStatus; await vehicle.save().catch(() => {});
      profile.status = oldDriverStatus; profile.availability = oldAvailability; await profile.save().catch(() => {});
      throw e;
    }

    const io = req.app.get("io");
    await safeNotify(() => notifyUsers({
      io,
      recipients: [trip.customer],
      type: "TRIP_STARTED",
      title: "Trip Started",
      message: `Trip ${trip.tripId} has started.`,
      link: `/customer/trips/${trip._id}`,
      data: { tripId: trip._id, tripNumber: trip.tripId, status: trip.tripStatus },
    }));
    await safeNotify(() => notifyUsers({
      io,
      recipients: [trip.driver],
      type: "TRIP_STARTED",
      title: "Trip Started",
      message: `Trip ${trip.tripId} is now in progress.`,
      link: `/driver/trips/${trip._id}`,
      data: { tripId: trip._id, tripNumber: trip.tripId, status: trip.tripStatus },
    }));

    const result = await Trip.findById(trip._id)
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("customer", "fullName email phone")
      .lean();
    res.json({ success: true, message: "Trip started successfully.", trip: result });
  } catch (e) {
    console.error("Driver start trip error:", e);
    fail(res, e.status || 500, e.message || "Failed to start trip.");
  }
}

async function pauseMyTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const driverId = req.user._id;
    const trip = await Trip.findOne({ _id: req.params.id, driver: driverId });
    if (!trip) return fail(res, 404, "Trip not found for your account.");
    if (trip.tripStatus !== "IN_PROGRESS") return fail(res, 409, "Only an in-progress trip can be paused.");
    trip.tripStatus = "PAUSED";
    await trip.save();
    const io = req.app.get("io");
    await safeNotify(() => notifyUsers({ io, recipients: [trip.customer], type: "TRIP_PAUSED", title: "Trip Paused", message: `Trip ${trip.tripId} has been paused.`, link: `/customer/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId, status: trip.tripStatus } }));
    const result = await Trip.findById(trip._id)
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("customer", "fullName email phone")
      .lean();
    res.json({ success: true, message: "Trip paused successfully.", trip: result });
  } catch (e) {
    console.error("Driver pause trip error:", e);
    fail(res, e.status || 500, e.message || "Failed to pause trip.");
  }
}

async function resumeMyTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const driverId = req.user._id;
    const trip = await Trip.findOne({ _id: req.params.id, driver: driverId });
    if (!trip) return fail(res, 404, "Trip not found for your account.");
    if (trip.tripStatus !== "PAUSED") return fail(res, 409, "Only a paused trip can be resumed.");
    trip.tripStatus = "IN_PROGRESS";
    await trip.save();
    const io = req.app.get("io");
    await safeNotify(() => notifyUsers({ io, recipients: [trip.customer], type: "TRIP_RESUMED", title: "Trip Resumed", message: `Trip ${trip.tripId} has resumed.`, link: `/customer/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId, status: trip.tripStatus } }));
    const result = await Trip.findById(trip._id)
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("customer", "fullName email phone")
      .lean();
    res.json({ success: true, message: "Trip resumed successfully.", trip: result });
  } catch (e) {
    console.error("Driver resume trip error:", e);
    fail(res, e.status || 500, e.message || "Failed to resume trip.");
  }
}

async function completeMyTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const driverId = req.user._id;
    const { finalOdometer, distance, notes = "", confirmation = true } = req.body;
    if (!confirmation) return fail(res, 400, "Completion confirmation is required.");
    if (finalOdometer !== undefined && (Number.isNaN(Number(finalOdometer)) || Number(finalOdometer) < 0)) return fail(res, 400, "Final odometer must be a valid non-negative number.");
    if (distance !== undefined && (Number.isNaN(Number(distance)) || Number(distance) < 0)) return fail(res, 400, "Distance must be a valid non-negative number.");

    const trip = await Trip.findOne({ _id: req.params.id, driver: driverId });
    if (!trip) return fail(res, 404, "Trip not found for your account.");
    if (!["IN_PROGRESS", "PAUSED"].includes(trip.tripStatus)) return fail(res, 409, "Only an in-progress or paused trip can be completed.");

    const profile = await DriverProfile.findOne({ user: driverId });
    if (!profile || profile.status !== "ON_TRIP" || !profile.assignedVehicle || profile.assignedVehicle.toString() !== String(trip.vehicle)) return fail(res, 409, "Your driver assignment is not in a valid state for completion.");
    const vehicle = await Vehicle.findOne({ _id: trip.vehicle, assignedDriver: driverId, status: "ON_TRIP" });
    if (!vehicle) return fail(res, 409, "The assigned vehicle is not in an active trip state.");

    const oldTrip = { tripStatus: trip.tripStatus, actualEnd: trip.actualEnd, distance: trip.distance, notes: trip.notes };
    const oldVehicleStatus = vehicle.status;
    const oldDriverStatus = profile.status;
    const oldAvailability = profile.availability;
    const now = new Date();
    try {
      trip.tripStatus = "COMPLETED";
      trip.actualEnd = now;
      if (distance !== undefined) trip.distance = Number(distance);
      if (notes.trim()) trip.notes = notes.trim();
      await trip.save();

      if (finalOdometer !== undefined) vehicle.currentOdometer = Number(finalOdometer);
      vehicle.status = "ASSIGNED";
      await vehicle.save();

      profile.status = "ASSIGNED";
      profile.availability = true;
      await profile.save();
    } catch (e) {
      trip.tripStatus = oldTrip.tripStatus; trip.actualEnd = oldTrip.actualEnd; trip.distance = oldTrip.distance; trip.notes = oldTrip.notes; await trip.save().catch(() => {});
      vehicle.status = oldVehicleStatus; await vehicle.save().catch(() => {});
      profile.status = oldDriverStatus; profile.availability = oldAvailability; await profile.save().catch(() => {});
      throw e;
    }

    const io = req.app.get("io");
    await safeNotify(() => notifyUsers({ io, recipients: [trip.customer], type: "TRIP_COMPLETED", title: "Trip Completed", message: `Trip ${trip.tripId} has been completed.`, link: `/customer/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId, status: trip.tripStatus } }));

    const result = await Trip.findById(trip._id)
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status currentOdometer")
      .populate("customer", "fullName email phone")
      .lean();
    res.json({ success: true, message: "Trip completed successfully.", trip: result });
  } catch (e) {
    console.error("Driver complete trip error:", e);
    fail(res, e.status || 500, e.message || "Failed to complete trip.");
  }
}

async function getMyProfile(req, res) {
  try {
    const [user, profile] = await Promise.all([
      User.findById(req.user._id).select("fullName email phone role isActive accountStatus lastLoginAt createdAt updatedAt").lean(),
      DriverProfile.findOne({ user: req.user._id }).populate("assignedVehicle", "registrationNumber vehicleNumber vehicleType make model status").lean(),
    ]);
    if (!user) return fail(res, 404, "Driver account not found.");
    res.json({ success: true, profile: { user, driverProfile: profile || null } });
  } catch (e) {
    console.error("Driver profile error:", e);
    fail(res, 500, "Unable to load your profile.");
  }
}

async function updateMyProfile(req, res) {
  try {
    const allowed = ["phone"];
    const unexpected = Object.keys(req.body).filter(k => !allowed.includes(k));
    if (unexpected.length) return fail(res, 400, "Only personal contact fields can be updated.");
    const user = await User.findOne({ _id: req.user._id, role: "DRIVER" });
    if (!user) return fail(res, 404, "Driver account not found.");
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (phone && !/^[+0-9()\-\s]{7,20}$/.test(phone)) return fail(res, 400, "Enter a valid phone number.");
      user.phone = phone || null;
    }
    await user.save();
    res.json({ success: true, message: "Profile updated successfully.", user: await User.findById(user._id).select("fullName email phone role isActive accountStatus lastLoginAt createdAt updatedAt").lean() });
  } catch (e) {
    console.error("Update driver profile error:", e);
    fail(res, 500, "Failed to update your profile.");
  }
}

async function createVehicleIssue(req, res) {
  try {
    const { issueType, severity, description, trip } = req.body;
    const allowedTypes = VehicleIssue.ISSUE_TYPES;
    const allowedSeverities = VehicleIssue.SEVERITIES;
    if (!allowedTypes.includes(String(issueType || "").toUpperCase())) return fail(res, 400, "Invalid issue type.");
    if (!allowedSeverities.includes(String(severity || "").toUpperCase())) return fail(res, 400, "Invalid severity.");
    if (!description?.trim() || description.trim().length < 5) return fail(res, 400, "Issue description is required.");

    const profile = await DriverProfile.findOne({ user: req.user._id });
    if (!profile?.assignedVehicle) return fail(res, 409, "You do not currently have a vehicle assigned.");
    const vehicle = await Vehicle.findOne({ _id: profile.assignedVehicle, assignedDriver: req.user._id });
    if (!vehicle) return fail(res, 409, "Your current vehicle assignment could not be verified.");

    let tripId = null;
    if (trip) {
      if (!validId(trip)) return fail(res, 400, "Invalid trip ID.");
      const driverTrip = await Trip.findOne({ _id: trip, driver: req.user._id, vehicle: vehicle._id });
      if (!driverTrip) return fail(res, 403, "The selected trip does not belong to you.");
      tripId = driverTrip._id;
    } else {
      const activeTrip = await Trip.findOne({ driver: req.user._id, vehicle: vehicle._id, tripStatus: "IN_PROGRESS" }).select("_id").lean();
      tripId = activeTrip?._id || null;
    }

    const issue = await VehicleIssue.create({
      vehicle: vehicle._id,
      reportedBy: req.user._id,
      trip: tripId,
      issueType: String(issueType).toUpperCase(),
      severity: String(severity).toUpperCase(),
      description: description.trim(),
      status: "OPEN",
    });
    const result = await VehicleIssue.findById(issue._id)
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("trip", "tripId tripStatus pickupLocation destination")
      .lean();
    res.status(201).json({ success: true, message: "Vehicle issue reported successfully.", issue: result });
  } catch (e) {
    console.error("Create vehicle issue error:", e);
    fail(res, 500, "Failed to report vehicle issue.");
  }
}

async function getMyIssues(req, res) {
  try {
    const issues = await VehicleIssue.find({ reportedBy: req.user._id })
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("trip", "tripId tripStatus pickupLocation destination")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, count: issues.length, issues });
  } catch (e) {
    console.error("Get driver issues error:", e);
    fail(res, 500, "Unable to load your vehicle issues.");
  }
}

async function getMyIssue(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid issue ID.");
    const issue = await VehicleIssue.findOne({ _id: req.params.id, reportedBy: req.user._id })
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("trip", "tripId tripStatus pickupLocation destination")
      .populate("resolvedBy", "fullName email")
      .lean();
    if (!issue) return fail(res, 404, "Issue not found for your account.");
    res.json({ success: true, issue });
  } catch (e) {
    console.error("Get driver issue error:", e);
    fail(res, 500, "Unable to load issue details.");
  }
}

module.exports = { getDrivers, getDriver, createDriver, updateDriver, setDriverStatus, unassignDriver, getDriverDashboard, getMyVehicle, createOwnerVehicle, updateOwnerVehicle, addOwnerVehicleDocument, submitOwnerVehicleApproval, getMyTrips, getMyTrip, acceptMyTrip, startMyTrip, pauseMyTrip, resumeMyTrip, completeMyTrip, getMyProfile, updateMyProfile, createVehicleIssue, getMyIssues, getMyIssue };