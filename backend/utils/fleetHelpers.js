const Vehicle = require("../models/Vehicle");
const DriverProfile = require("../models/DriverProfile");
const Assignment = require("../models/Assignment");
const User = require("../models/User");

const activeTripStatuses = ["ASSIGNED", "IN_PROGRESS", "PAUSED"];

async function getDriverProfile(driverId) {
  return DriverProfile.findOne({ user: driverId });
}

async function validateAvailablePair(vehicleId, driverId) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };
  if (!["AVAILABLE", "ASSIGNED"].includes(vehicle.status)) return { error: "Vehicle is not available for assignment." };

  if (vehicle.ownershipType === "DRIVER_OWNED") {
    if (vehicle.approvalStatus !== "APPROVED") return { error: "This driver-owned vehicle is not approved for trip assignment." };
    if (!vehicle.ownerId) return { error: "This driver-owned vehicle has no owner-driver." };
    if (vehicle.ownerId.toString() !== driverId.toString()) return { error: "This driver-owned vehicle can only be assigned to its owner-driver." };
  }

  if (vehicle.assignedDriver && vehicle.assignedDriver.toString() !== driverId.toString()) return { error: "Vehicle is already assigned to another driver." };

  const driver = await DriverProfile.findOne({ user: driverId });
  if (!driver) return { error: "Driver profile not found." };
  if (driver.status === "INACTIVE" || driver.status === "OFF_DUTY" || driver.availability === false) return { error: "Driver is not available for assignment." };
  if (driver.assignedVehicle && driver.assignedVehicle.toString() !== vehicleId.toString()) return { error: "Driver is already assigned to another vehicle." };
  if (vehicle.ownershipType === "DRIVER_OWNED" && driver.driverType !== "OWNER_DRIVER") return { error: "The owner of a driver-owned vehicle must be an Owner-Driver." };
  return { vehicle, driver };
}

async function reservePair(vehicleId, driverId) {
  const checked = await validateAvailablePair(vehicleId, driverId);
  if (checked.error) throw Object.assign(new Error(checked.error), { status: 409 });
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: vehicleId, status: { $in: ["AVAILABLE", "ASSIGNED"] }, $or: [{ assignedDriver: null }, { assignedDriver: driverId }] },
    { $set: { assignedDriver: driverId, status: "ASSIGNED" } },
    { new: true }
  );
  if (!vehicle) throw Object.assign(new Error("Vehicle could not be reserved."), { status: 409 });
  try {
    const driver = await DriverProfile.findOneAndUpdate(
      { user: driverId, status: { $nin: ["INACTIVE", "OFF_DUTY", "ON_TRIP"] }, availability: true, $or: [{ assignedVehicle: null }, { assignedVehicle: vehicleId }] },
      { $set: { assignedVehicle: vehicleId, status: "ASSIGNED" } },
      { new: true }
    );
    if (!driver) throw new Error("Driver could not be reserved.");
    return { vehicle, driver };
  } catch (error) {
    await Vehicle.updateOne({ _id: vehicleId, assignedDriver: driverId }, { $set: { assignedDriver: null, status: "AVAILABLE" } });
    throw Object.assign(new Error(error.message), { status: 409 });
  }
}

async function releasePair(vehicleId, driverId) {
  if (vehicleId) await Vehicle.updateOne({ _id: vehicleId, assignedDriver: driverId }, { $set: { assignedDriver: null, status: "AVAILABLE" } });
  if (driverId) await DriverProfile.updateOne({ user: driverId, assignedVehicle: vehicleId }, { $set: { assignedVehicle: null, status: "AVAILABLE", availability: true } });
}

async function hasActiveTripForVehicle(vehicleId, excludeTripId = null) {
  const Trip = require("../models/Trip");
  const q = { vehicle: vehicleId, tripStatus: { $in: activeTripStatuses } };
  if (excludeTripId) q._id = { $ne: excludeTripId };
  return Trip.exists(q);
}

async function hasActiveTripForDriver(driverId, excludeTripId = null) {
  const Trip = require("../models/Trip");
  const q = { driver: driverId, tripStatus: { $in: activeTripStatuses } };
  if (excludeTripId) q._id = { $ne: excludeTripId };
  return Trip.exists(q);
}

async function syncAssignmentRecords() {
  const assignedVehicles = await Vehicle.find({ assignedDriver: { $ne: null } }).select("_id assignedDriver status").lean();

  // Repair stale ACTIVE assignment documents first. The vehicle/driver fields are
  // the source of truth for the current relationship.
  const activeAssignments = await Assignment.find({ assignmentStatus: "ACTIVE" }).select("_id vehicle driver").lean();
  for (const assignment of activeAssignments) {
    const vehicle = assignedVehicles.find(v => v._id.toString() === assignment.vehicle.toString());
    if (!vehicle || vehicle.assignedDriver.toString() !== assignment.driver.toString()) {
      await Assignment.updateOne({ _id: assignment._id }, { $set: { assignmentStatus: "UNASSIGNED", unassignedAt: new Date() } });
    }
  }

  let fallbackAssigner = await User.findOne({ role: { $in: ["FLEET_MANAGER", "SUPER_ADMIN"] }, isActive: true, accountStatus: "ACTIVE" }).select("_id").lean();
  for (const vehicle of assignedVehicles) {
    const active = await Assignment.findOne({ vehicle: vehicle._id, assignmentStatus: "ACTIVE" }).select("_id driver").lean();
    if (active) continue;

    const profile = await DriverProfile.findOne({ user: vehicle.assignedDriver }).select("user assignedVehicle").lean();
    if (!profile || !profile.assignedVehicle || profile.assignedVehicle.toString() !== vehicle._id.toString()) continue;

    await Assignment.create({
      vehicle: vehicle._id,
      driver: vehicle.assignedDriver,
      assignedBy: fallbackAssigner?._id || vehicle.assignedDriver,
      assignmentStatus: "ACTIVE",
      assignedAt: new Date(),
    });
  }

  return Assignment.find({ assignmentStatus: "ACTIVE" })
    .populate("vehicle", "registrationNumber vehicleType make model status")
    .populate("driver", "fullName email phone")
    .populate("assignedBy", "fullName email")
    .sort({ assignedAt: -1 })
    .lean();
}

module.exports = { activeTripStatuses, getDriverProfile, validateAvailablePair, reservePair, releasePair, hasActiveTripForVehicle, hasActiveTripForDriver, syncAssignmentRecords };
