const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Vehicle = require("../models/Vehicle");
const Trip = require("../models/Trip");
const Assignment = require("../models/Assignment");
const { releasePair } = require("../utils/fleetHelpers");
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const clean = (s) => s?.trim();

async function getDrivers(req, res) {
  try {
    const { search = "", status = "" } = req.query;
    const users = await User.find({ role: "DRIVER" }).select("fullName email phone isActive accountStatus createdAt updatedAt lastLoginAt").sort({ createdAt: -1 }).lean();
    const profiles = await DriverProfile.find({ user: { $in: users.map(u => u._id) } }).populate({ path: "assignedVehicle", select: "registrationNumber vehicleType make model status" }).lean();
    const map = new Map(profiles.map(p => [p.user.toString(), p]));
    let drivers = users.map(u => ({ ...u, profile: map.get(u._id.toString()) || null, status: !u.isActive || u.accountStatus === "INACTIVE" ? "INACTIVE" : (map.get(u._id.toString())?.status || "AVAILABLE"), assignedVehicle: map.get(u._id.toString())?.assignedVehicle || null }));
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
    res.json({ success: true, driver: { ...user, profile, status: !user.isActive || user.accountStatus === "INACTIVE" ? "INACTIVE" : profile?.status || "AVAILABLE", assignedVehicle: profile?.assignedVehicle || null, tripHistory: trips } });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load driver."); }
}

async function createDriver(req, res) {
  try {
    const { fullName, email, phone, password, licenseNumber, licenseExpiry, experience = 0 } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password || !licenseNumber?.trim() || !licenseExpiry) return fail(res, 400, "Full name, email, password, license number and license expiry are required.");
    if (password.length < 8) return fail(res, 400, "Password must be at least 8 characters.");
    const expiry = new Date(licenseExpiry); if (Number.isNaN(expiry.getTime())) return fail(res, 400, "Invalid license expiry date.");
    const normalizedEmail = email.trim().toLowerCase(); if (await User.exists({ email: normalizedEmail })) return fail(res, 409, "An account with this email already exists.");
    if (await DriverProfile.exists({ licenseNumber: licenseNumber.trim().toUpperCase() })) return fail(res, 409, "A driver with this license number already exists.");
    const user = await User.create({ fullName: fullName.trim(), email: normalizedEmail, phone: clean(phone) || null, password: await bcrypt.hash(password, 12), role: "DRIVER", isActive: true, accountStatus: "ACTIVE" });
    try { await DriverProfile.create({ user: user._id, licenseNumber: licenseNumber.trim().toUpperCase(), licenseExpiry: expiry, experience: Number(experience) || 0, status: "AVAILABLE", availability: true }); }
    catch (e) { await User.deleteOne({ _id: user._id }); if (e.code === 11000) return fail(res, 409, "A driver with this license number already exists."); throw e; }
    const result = await User.findById(user._id).select("-password").lean(); const profile = await DriverProfile.findOne({ user: user._id }).lean();
    res.status(201).json({ success: true, message: "Driver created successfully.", driver: { ...result, profile, status: "AVAILABLE" } });
  } catch (e) { console.error(e); if (e.code === 11000) return fail(res, 409, "An account with this email already exists."); fail(res, 500, "Failed to create driver."); }
}

async function updateDriver(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid driver ID.");
    const user = await User.findOne({ _id: req.params.id, role: "DRIVER" }); if (!user) return fail(res, 404, "Driver not found.");
    const { fullName, email, phone, licenseNumber, licenseExpiry, experience, status } = req.body;
    if (fullName !== undefined && fullName.trim().length < 2) return fail(res, 400, "Full name must be at least 2 characters.");
    if (email !== undefined) { const e = email.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return fail(res, 400, "Invalid email address."); const dup = await User.findOne({ email: e, _id: { $ne: user._id } }); if (dup) return fail(res, 409, "An account with this email already exists."); user.email = e; }
    if (fullName !== undefined) user.fullName = fullName.trim(); if (phone !== undefined) user.phone = phone.trim() || null;
    const profile = await DriverProfile.findOne({ user: user._id }); if (!profile) return fail(res, 404, "Driver profile not found.");
    if (licenseNumber !== undefined) { const ln = licenseNumber.trim().toUpperCase(); const dup = await DriverProfile.findOne({ licenseNumber: ln, user: { $ne: user._id } }); if (dup) return fail(res, 409, "A driver with this license number already exists."); profile.licenseNumber = ln; }
    if (licenseExpiry !== undefined) { const d = new Date(licenseExpiry); if (Number.isNaN(d.getTime())) return fail(res, 400, "Invalid license expiry date."); profile.licenseExpiry = d; }
    if (experience !== undefined) { if (Number(experience) < 0) return fail(res, 400, "Experience cannot be negative."); profile.experience = Number(experience); }
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
module.exports = { getDrivers, getDriver, createDriver, updateDriver, setDriverStatus, unassignDriver };
