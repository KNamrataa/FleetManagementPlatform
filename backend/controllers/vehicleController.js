const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Assignment = require("../models/Assignment");
const { hasActiveTripForVehicle, reservePair, releasePair } = require("../utils/fleetHelpers");

const VEHICLE_STATUSES = ["AVAILABLE", "ASSIGNED", "ON_TRIP", "MAINTENANCE", "INACTIVE"];
const FUEL_TYPES = ["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID"];
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const clean = (v) => v?.trim().toUpperCase();

const validateBody = (body) => {
  if (!body.registrationNumber?.trim()) return "Registration number is required.";
  if (!body.vehicleType?.trim()) return "Vehicle type is required.";
  if (!body.make?.trim()) return "Vehicle make is required.";
  if (!body.model?.trim()) return "Vehicle model is required.";
  if (!Number.isInteger(Number(body.year)) || Number(body.year) < 1900 || Number(body.year) > new Date().getFullYear() + 1) return "Please provide a valid vehicle year.";
  if (!FUEL_TYPES.includes(clean(body.fuelType))) return "Invalid fuel type.";
  if (Number(body.capacity) < 0 || Number.isNaN(Number(body.capacity))) return "Capacity must be a valid non-negative number.";
  if (Number(body.currentOdometer) < 0 || Number.isNaN(Number(body.currentOdometer))) return "Odometer must be a valid non-negative number.";
  if (body.status && !VEHICLE_STATUSES.includes(clean(body.status))) return "Invalid vehicle status.";
  return null;
};

const populateVehicle = (query) => query.populate({ path: "assignedDriver", select: "fullName email phone role" });

async function getVehicles(req, res) {
  try {
    const { search = "", status = "" } = req.query;
    const filter = {};
    if (status && VEHICLE_STATUSES.includes(clean(status))) filter.status = clean(status);
    if (search.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ registrationNumber: rx }, { vehicleNumber: rx }, { make: rx }, { model: rx }, { vehicleType: rx }];
    }
    const vehicles = await populateVehicle(Vehicle.find(filter).sort({ createdAt: -1 }));
    res.json({ success: true, count: vehicles.length, vehicles });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load vehicles."); }
}

async function getVehicle(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid vehicle ID.");
    const vehicle = await populateVehicle(Vehicle.findById(req.params.id));
    if (!vehicle) return fail(res, 404, "Vehicle not found.");
    res.json({ success: true, vehicle });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load vehicle."); }
}

async function createVehicle(req, res) {
  try {
    const error = validateBody(req.body); if (error) return fail(res, 400, error);
    const registrationNumber = clean(req.body.registrationNumber);
    if (await Vehicle.exists({ registrationNumber })) return fail(res, 409, "A vehicle with this registration number already exists.");
    let assignedDriver = null;
    const status = clean(req.body.status || "AVAILABLE");
    if (req.body.assignedDriver) {
      if (!validId(req.body.assignedDriver)) return fail(res, 400, "Invalid driver ID.");
      const driver = await User.findOne({ _id: req.body.assignedDriver, role: "DRIVER", isActive: true, accountStatus: "ACTIVE" });
      const profile = await DriverProfile.findOne({ user: req.body.assignedDriver });
      if (!driver || !profile || !["AVAILABLE", "ASSIGNED"].includes(profile.status) || profile.assignedVehicle) return fail(res, 409, "Selected driver is not available.");
      assignedDriver = driver._id;
    }
    if (assignedDriver && status === "ON_TRIP") return fail(res, 400, "A newly created vehicle cannot start as ON_TRIP.");
    const vehicle = await Vehicle.create({ ...req.body, registrationNumber, vehicleNumber: req.body.vehicleNumber?.trim() || registrationNumber, vehicleType: req.body.vehicleType.trim(), make: req.body.make.trim(), model: req.body.model.trim(), year: Number(req.body.year), fuelType: clean(req.body.fuelType), capacity: Number(req.body.capacity), currentOdometer: Number(req.body.currentOdometer || 0), status: "AVAILABLE", assignedDriver: null });
    if (assignedDriver) {
      try {
        await reservePair(vehicle._id, assignedDriver);
        await Assignment.create({ vehicle: vehicle._id, driver: assignedDriver, assignedBy: req.user._id, assignmentStatus: "ACTIVE" });
      } catch (assignmentError) {
        await releasePair(vehicle._id, assignedDriver);
        await Vehicle.deleteOne({ _id: vehicle._id });
        throw assignmentError;
      }
    }
    const result = await populateVehicle(Vehicle.findById(vehicle._id));
    res.status(201).json({ success: true, message: "Vehicle created successfully.", vehicle: result });
  } catch (e) { console.error(e); if (e.code === 11000) return fail(res, 409, "A vehicle with this registration number already exists."); fail(res, 500, "Failed to create vehicle."); }
}

async function updateVehicle(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid vehicle ID.");
    const vehicle = await Vehicle.findById(req.params.id); if (!vehicle) return fail(res, 404, "Vehicle not found.");
    const error = validateBody({ ...vehicle.toObject(), ...req.body }); if (error) return fail(res, 400, error);
    const nextReg = clean(req.body.registrationNumber || vehicle.registrationNumber);
    const duplicate = await Vehicle.findOne({ registrationNumber: nextReg, _id: { $ne: vehicle._id } }); if (duplicate) return fail(res, 409, "A vehicle with this registration number already exists.");
    const nextStatus = clean(req.body.status || vehicle.status);
    if (vehicle.status === "ON_TRIP" && nextStatus !== "ON_TRIP") return fail(res, 409, "An ON_TRIP vehicle cannot be reassigned or changed until its trip is completed.");
    if (["ON_TRIP"].includes(nextStatus) && !vehicle.assignedDriver) return fail(res, 400, "An ON_TRIP vehicle must have an assigned driver.");
    Object.assign(vehicle, { registrationNumber: nextReg, vehicleNumber: req.body.vehicleNumber?.trim() || vehicle.vehicleNumber || nextReg, vehicleType: req.body.vehicleType.trim(), make: req.body.make.trim(), model: req.body.model.trim(), year: Number(req.body.year), fuelType: clean(req.body.fuelType), capacity: Number(req.body.capacity), currentOdometer: Number(req.body.currentOdometer), status: nextStatus });
    await vehicle.save();
    const result = await populateVehicle(Vehicle.findById(vehicle._id));
    res.json({ success: true, message: "Vehicle updated successfully.", vehicle: result });
  } catch (e) { console.error(e); if (e.code === 11000) return fail(res, 409, "A vehicle with this registration number already exists."); fail(res, 500, "Failed to update vehicle."); }
}

async function deleteVehicle(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid vehicle ID.");
    const vehicle = await Vehicle.findById(req.params.id); if (!vehicle) return fail(res, 404, "Vehicle not found.");
    if (vehicle.status === "ON_TRIP" || await hasActiveTripForVehicle(vehicle._id)) return fail(res, 409, "An active-trip vehicle cannot be deleted or deactivated.");
    if (vehicle.assignedDriver) return fail(res, 409, "Unassign the driver before deleting the vehicle.");
    await Assignment.updateMany({ vehicle: vehicle._id, assignmentStatus: "ACTIVE" }, { $set: { assignmentStatus: "UNASSIGNED", unassignedAt: new Date() } });
    await Vehicle.deleteOne({ _id: vehicle._id });
    res.json({ success: true, message: "Vehicle deleted successfully." });
  } catch (e) { console.error(e); fail(res, 500, "Failed to delete vehicle."); }
}

module.exports = { getVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle };
