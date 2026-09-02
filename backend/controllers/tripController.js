const mongoose = require("mongoose");
const Trip = require("../models/Trip");
const Vehicle = require("../models/Vehicle");
const DriverProfile = require("../models/DriverProfile");
const Assignment = require("../models/Assignment");
const { reservePair, releasePair, hasActiveTripForVehicle, hasActiveTripForDriver } = require("../utils/fleetHelpers");
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const STATUSES = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function nextTripId() {
  const latest = await Trip.findOne({ tripId: /^TRP-\d+$/ }).sort({ createdAt: -1 }).select("tripId").lean();
  const n = latest ? Number(latest.tripId.split("-")[1]) + 1 : 1001;
  return `TRP-${String(n).padStart(4, "0")}`;
}
const populateTrip = (q) => q.populate("vehicle", "registrationNumber vehicleType make model status").populate("driver", "fullName email phone").populate("customer", "fullName email phone").populate("createdBy", "fullName email");

async function getTrips(req, res) {
  try {
    const { search = "", status = "" } = req.query; const filter = {};
    if (status) { if (!STATUSES.includes(status.toUpperCase())) return fail(res, 400, "Invalid trip status."); filter.tripStatus = status.toUpperCase(); }
    if (search.trim()) { const rx = new RegExp(escapeRx(search.trim()), "i"); filter.$or = [{ tripId: rx }, { pickupLocation: rx }, { destination: rx }, { notes: rx }]; }
    const trips = await populateTrip(Trip.find(filter).sort({ createdAt: -1 })); res.json({ success: true, count: trips.length, trips });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load trips."); }
}
async function getTrip(req, res) {
  try { if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID."); const trip = await populateTrip(Trip.findById(req.params.id)); if (!trip) return fail(res, 404, "Trip not found."); res.json({ success: true, trip }); }
  catch (e) { console.error(e); fail(res, 500, "Unable to load trip."); }
}
async function createTrip(req, res) {
  let reserved = false;
  let reservedVehicle = null;
  let reservedDriver = null;
  try {
    const {
      customer,
      vehicle,
      driver,
      pickupLocation,
      destination,
      scheduledStart,
      scheduledEnd,
      distance = 0,
      notes = "",
    } = req.body;

    if (!pickupLocation?.trim() || !destination?.trim() || !scheduledStart) {
      return fail(res, 400, "Pickup, destination and scheduled start are required.");
    }

    const start = new Date(scheduledStart);
    if (Number.isNaN(start.getTime())) return fail(res, 400, "Invalid scheduled start.");

    const end = scheduledEnd ? new Date(scheduledEnd) : null;
    if (end && Number.isNaN(end.getTime())) return fail(res, 400, "Invalid scheduled end.");
    if (end && end < start) return fail(res, 400, "Scheduled end must be after scheduled start.");

    if (customer && !validId(customer)) return fail(res, 400, "Invalid customer ID.");

    let status = "SCHEDULED";
    if (vehicle || driver) {
      if (!vehicle || !driver) return fail(res, 400, "Vehicle and driver must be assigned together.");
      if (!validId(vehicle) || !validId(driver)) return fail(res, 400, "Invalid vehicle or driver ID.");
      if (await hasActiveTripForVehicle(vehicle) || await hasActiveTripForDriver(driver)) {
        return fail(res, 409, "Vehicle or driver is already on another active trip.");
      }

      const pair = await reservePair(vehicle, driver);
      reserved = true;
      reservedVehicle = pair.vehicle._id;
      reservedDriver = pair.driver.user;
      status = "ASSIGNED";
    }

    let trip;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const tripId = await nextTripId();
      try {
        trip = await Trip.create({
          tripId,
          customer: customer || null,
          vehicle: vehicle || null,
          driver: driver || null,
          pickupLocation: pickupLocation.trim(),
          destination: destination.trim(),
          scheduledStart: start,
          scheduledEnd: end,
          distance: Number(distance) || 0,
          tripStatus: status,
          notes: notes.trim(),
          createdBy: req.user._id,
        });
        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 2) throw error;
      }
    }

    const result = await populateTrip(Trip.findById(trip._id));
    res.status(201).json({ success: true, message: "Trip created successfully.", trip: result });
  } catch (e) {
    console.error(e);
    if (reserved) await releasePair(reservedVehicle, reservedDriver).catch(() => {});
    fail(res, e.status || 500, e.code === 11000 ? "Unable to generate a unique trip ID. Please try again." : (e.message || "Failed to create trip."));
  }
}

async function updateTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await Trip.findById(req.params.id); if (!trip) return fail(res, 404, "Trip not found.");
    if (["COMPLETED", "CANCELLED", "IN_PROGRESS"].includes(trip.tripStatus)) return fail(res, 409, "This trip cannot be edited in its current status.");
    const { customer, vehicle, driver, pickupLocation, destination, scheduledStart, scheduledEnd, distance, notes } = req.body;
    const nextVehicle = vehicle === undefined ? trip.vehicle : vehicle || null; const nextDriver = driver === undefined ? trip.driver : driver || null;
    if ((nextVehicle && !nextDriver) || (!nextVehicle && nextDriver)) return fail(res, 400, "Vehicle and driver must be assigned together.");
    if (nextVehicle && (!validId(nextVehicle) || !validId(nextDriver))) return fail(res, 400, "Invalid vehicle or driver ID.");
    const changedPair = String(nextVehicle || "") !== String(trip.vehicle || "") || String(nextDriver || "") !== String(trip.driver || "");
    if (changedPair && nextVehicle) { if (await hasActiveTripForVehicle(nextVehicle, trip._id) || await hasActiveTripForDriver(nextDriver, trip._id)) return fail(res, 409, "Vehicle or driver is already on another active trip."); await releasePair(trip.vehicle, trip.driver); await reservePair(nextVehicle, nextDriver); }
    else if (changedPair) await releasePair(trip.vehicle, trip.driver);
    if (customer !== undefined) trip.customer = customer || null; if (pickupLocation !== undefined) trip.pickupLocation = pickupLocation.trim(); if (destination !== undefined) trip.destination = destination.trim(); if (scheduledStart !== undefined) { const d = new Date(scheduledStart); if (Number.isNaN(d.getTime())) return fail(res, 400, "Invalid scheduled start."); trip.scheduledStart = d; } if (scheduledEnd !== undefined) trip.scheduledEnd = scheduledEnd ? new Date(scheduledEnd) : null; if (distance !== undefined) trip.distance = Number(distance) || 0; if (notes !== undefined) trip.notes = notes.trim(); trip.vehicle = nextVehicle; trip.driver = nextDriver; trip.tripStatus = nextVehicle ? "ASSIGNED" : "SCHEDULED";
    await trip.save(); const result = await populateTrip(Trip.findById(trip._id)); res.json({ success: true, message: "Trip updated successfully.", trip: result });
  } catch (e) { console.error(e); fail(res, e.status || 500, e.message || "Failed to update trip."); }
}

async function startTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID."); const trip = await Trip.findById(req.params.id); if (!trip) return fail(res, 404, "Trip not found."); if (!trip.vehicle || !trip.driver) return fail(res, 409, "Trip must have a vehicle and driver before it can start."); if (!["SCHEDULED", "ASSIGNED"].includes(trip.tripStatus)) return fail(res, 409, "Trip cannot be started in its current status.");
    if (await hasActiveTripForVehicle(trip.vehicle, trip._id) || await hasActiveTripForDriver(trip.driver, trip._id)) return fail(res, 409, "Vehicle or driver is already on another active trip.");
    const vehicle = await Vehicle.findOneAndUpdate({ _id: trip.vehicle, status: "ASSIGNED", assignedDriver: trip.driver }, { $set: { status: "ON_TRIP" } }, { new: true }); if (!vehicle) return fail(res, 409, "Vehicle is not ready to start this trip.");
    const driver = await DriverProfile.findOneAndUpdate({ user: trip.driver, assignedVehicle: trip.vehicle, status: "ASSIGNED", availability: true }, { $set: { status: "ON_TRIP", availability: false } }, { new: true }); if (!driver) { await Vehicle.updateOne({ _id: trip.vehicle, status: "ON_TRIP", assignedDriver: trip.driver }, { $set: { status: "ASSIGNED" } }); return fail(res, 409, "Driver is not ready to start this trip."); }
    trip.tripStatus = "IN_PROGRESS"; trip.actualStart = new Date(); await trip.save(); const result = await populateTrip(Trip.findById(trip._id)); res.json({ success: true, message: "Trip started successfully.", trip: result });
  } catch (e) { console.error(e); fail(res, 500, "Failed to start trip."); }
}

async function completeTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID."); const trip = await Trip.findById(req.params.id); if (!trip) return fail(res, 404, "Trip not found."); if (trip.tripStatus !== "IN_PROGRESS") return fail(res, 409, "Only an in-progress trip can be completed.");
    const distance = req.body.distance !== undefined ? Number(req.body.distance) : null; if (distance !== null && (Number.isNaN(distance) || distance < 0)) return fail(res, 400, "Invalid distance.");
    trip.tripStatus = "COMPLETED"; trip.actualEnd = new Date(); if (distance !== null) trip.distance = distance; await trip.save();
    await Vehicle.updateOne({ _id: trip.vehicle, assignedDriver: trip.driver, status: "ON_TRIP" }, { $set: { status: "ASSIGNED" } }); await DriverProfile.updateOne({ user: trip.driver, assignedVehicle: trip.vehicle, status: "ON_TRIP" }, { $set: { status: "ASSIGNED", availability: true } });
    const result = await populateTrip(Trip.findById(trip._id)); res.json({ success: true, message: "Trip completed successfully.", trip: result });
  } catch (e) { console.error(e); fail(res, 500, "Failed to complete trip."); }
}

async function cancelTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID."); const trip = await Trip.findById(req.params.id); if (!trip) return fail(res, 404, "Trip not found."); if (["COMPLETED", "CANCELLED"].includes(trip.tripStatus)) return fail(res, 409, "Trip is already closed."); if (trip.tripStatus === "IN_PROGRESS") return fail(res, 409, "An in-progress trip cannot be cancelled; complete it instead.");
    await releasePair(trip.vehicle, trip.driver); await Assignment.updateMany({ vehicle: trip.vehicle, driver: trip.driver, assignmentStatus: "ACTIVE" }, { $set: { assignmentStatus: "UNASSIGNED", unassignedAt: new Date() } }); trip.tripStatus = "CANCELLED"; await trip.save(); const result = await populateTrip(Trip.findById(trip._id)); res.json({ success: true, message: "Trip cancelled successfully.", trip: result });
  } catch (e) { console.error(e); fail(res, 500, "Failed to cancel trip."); }
}
module.exports = { getTrips, getTrip, createTrip, updateTrip, startTrip, completeTrip, cancelTrip };
