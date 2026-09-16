const mongoose = require("mongoose");
const Trip = require("../models/Trip");
const TripRequest = require("../models/TripRequest");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Vehicle = require("../models/Vehicle");
const TripTracking = require("../models/TripTracking");
const { reservePair, releasePair } = require("../utils/fleetHelpers");
const { safeNotify, notifyUsers } = require("../services/notificationService");
const { paginationParams, paginationMeta } = require("../utils/pagination");

const TRIP_STATUSES = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"];
const ACTIVE_SCHEDULABLE = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PAUSED"];
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const escapeRx = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeRole = (role) => String(role || "").toUpperCase() === "DISPATCHER" ? "TRIP_MANAGER" : String(role || "").toUpperCase();

const populateTrip = (query) => query
  .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status approvalStatus ownershipType capacity insurance registration")
  .populate("driver", "fullName email phone isActive accountStatus")
  .populate("customer", "fullName email phone")
  .populate("createdBy", "fullName email")
  .lean();

function effectiveEnd(trip) {
  const start = new Date(trip.scheduledStart);
  const end = trip.scheduledEnd ? new Date(trip.scheduledEnd) : new Date(start.getTime() + 60 * 60 * 1000);
  return Number.isNaN(end.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : end;
}

async function findConflictingTrip(resourceField, resourceId, start, end, excludeTripId = null) {
  if (!resourceId) return null;
  const query = { [resourceField]: resourceId, tripStatus: { $in: ACTIVE_SCHEDULABLE } };
  if (excludeTripId) query._id = { $ne: excludeTripId };
  const candidates = await Trip.find(query).select("tripId scheduledStart scheduledEnd tripStatus driver vehicle").lean();
  return candidates.find((trip) => {
    const existingStart = new Date(trip.scheduledStart);
    const existingEnd = effectiveEnd(trip);
    return existingStart < end && existingEnd > start;
  }) || null;
}

async function validateResources({ driverId, vehicleId, start, end, passengerCount = 0, vehicleType = "", excludeTripId = null }) {
  if (!validId(driverId) || !validId(vehicleId)) return { status: 400, message: "A valid driver and vehicle are required." };

  const [driverUser, profile, vehicle] = await Promise.all([
    User.findOne({ _id: driverId, role: "DRIVER" }).select("fullName email phone isActive accountStatus").lean(),
    DriverProfile.findOne({ user: driverId }).lean(),
    Vehicle.findById(vehicleId).lean(),
  ]);

  if (!driverUser) return { status: 404, message: "Driver not found." };
  if (!driverUser.isActive || driverUser.accountStatus === "INACTIVE") return { status: 409, message: `Driver ${driverUser.fullName} is inactive.` };
  if (!profile) return { status: 409, message: `Driver ${driverUser.fullName} does not have a driver profile.` };
  if (["INACTIVE", "OFF_DUTY", "ON_TRIP"].includes(profile.status) || profile.availability === false) {
    return { status: 409, message: `Driver ${driverUser.fullName} is currently ${profile.status === "ON_TRIP" ? "on a trip" : profile.status === "OFF_DUTY" ? "off duty" : "unavailable"}.` };
  }
  if (profile.licenseExpiry && new Date(profile.licenseExpiry) < new Date()) return { status: 409, message: `Driver ${driverUser.fullName}'s license has expired.` };

  if (!vehicle) return { status: 404, message: "Vehicle not found." };
  if (vehicle.approvalStatus && vehicle.approvalStatus !== "APPROVED") return { status: 409, message: `Vehicle ${vehicle.registrationNumber} is not approved for trips.` };
  if (["MAINTENANCE", "INACTIVE"].includes(vehicle.status)) return { status: 409, message: `Vehicle ${vehicle.registrationNumber} cannot be assigned because it is ${vehicle.status.replaceAll("_", " ").toLowerCase()}.` };
  if (vehicle.ownershipType === "DRIVER_OWNED" && String(vehicle.ownerId || "") !== String(driverId)) return { status: 409, message: `Vehicle ${vehicle.registrationNumber} can only be assigned to its owner-driver.` };
  if (Number(passengerCount || 0) > Number(vehicle.capacity || 0)) return { status: 409, message: `Vehicle ${vehicle.registrationNumber} cannot be assigned because its capacity is ${vehicle.capacity} and this trip requires ${passengerCount} passengers.` };
  if (vehicleType && vehicle.vehicleType && vehicleType.toLowerCase() !== vehicle.vehicleType.toLowerCase()) return { status: 409, message: `Vehicle ${vehicle.registrationNumber} is ${vehicle.vehicleType}, not the requested ${vehicleType}.` };

  const now = new Date();
  const invalidVehicleDoc = (vehicle.documents || []).some((doc) => doc.expiryDate && new Date(doc.expiryDate) < now);
  const insuranceExpired = vehicle.insurance?.expiryDate && new Date(vehicle.insurance.expiryDate) < now;
  const registrationExpired = vehicle.registration?.expiryDate && new Date(vehicle.registration.expiryDate) < now;
  if (invalidVehicleDoc || insuranceExpired || registrationExpired) return { status: 409, message: `Vehicle ${vehicle.registrationNumber} has an expired document and cannot be assigned.` };

  const [driverConflict, vehicleConflict] = await Promise.all([
    findConflictingTrip("driver", driverId, start, end, excludeTripId),
    findConflictingTrip("vehicle", vehicleId, start, end, excludeTripId),
  ]);
  if (driverConflict) return { status: 409, conflict: true, conflictType: "DRIVER_SCHEDULE", message: `Driver ${driverUser.fullName} is already assigned to ${driverConflict.tripId} during this time.`, conflictTrip: driverConflict };
  if (vehicleConflict) return { status: 409, conflict: true, conflictType: "VEHICLE_SCHEDULE", message: `Vehicle ${vehicle.registrationNumber} is already assigned to ${vehicleConflict.tripId} during this time.`, conflictTrip: vehicleConflict };

  return { driverUser, profile, vehicle };
}

async function resourceRows() {
  const [users, profiles, vehicles, trips, customers] = await Promise.all([
    User.find({ role: "DRIVER" }).select("fullName email phone isActive accountStatus").lean(),
    DriverProfile.find({}).lean(),
    Vehicle.find({}).select("registrationNumber vehicleNumber vehicleType make model status approvalStatus ownershipType ownerId capacity assignedDriver insurance registration documents").populate("ownerId", "fullName email").lean(),
    Trip.find({ tripStatus: { $in: ACTIVE_SCHEDULABLE } }).select("tripId driver vehicle scheduledStart scheduledEnd tripStatus customer pickupLocation destination").populate("customer", "fullName").lean(),
    User.find({ role: "CUSTOMER", isActive: true, accountStatus: { $ne: "INACTIVE" } }).select("fullName email").sort({ fullName: 1 }).lean(),
  ]);
  const profileMap = new Map(profiles.map((p) => [String(p.user), p]));
  const driverTrips = new Map(); const vehicleTrips = new Map();
  trips.forEach((t) => {
    if (t.driver) driverTrips.set(String(t.driver), [...(driverTrips.get(String(t.driver)) || []), t]);
    if (t.vehicle) vehicleTrips.set(String(t.vehicle), [...(vehicleTrips.get(String(t.vehicle)) || []), t]);
  });
  const now = new Date();
  const drivers = users.map((u) => {
    const p = profileMap.get(String(u._id)); const currentTrips = driverTrips.get(String(u._id)) || [];
    const status = !u.isActive || u.accountStatus === "INACTIVE" ? "INACTIVE" : (p?.status || "AVAILABLE");
    const licenseExpired = p?.licenseExpiry && new Date(p.licenseExpiry) < now;
    return { ...u, status, availability: p?.availability !== false, profile: p || null, currentTrips, licenseExpired, eligible: Boolean(u.isActive && u.accountStatus !== "INACTIVE" && p && !licenseExpired && p.availability !== false && !["INACTIVE", "OFF_DUTY", "ON_TRIP"].includes(p.status)) };
  });
  const vehiclesOut = vehicles.map((v) => {
    const currentTrips = vehicleTrips.get(String(v._id)) || [];
    const expiredDocs = (v.documents || []).some((d) => d.expiryDate && new Date(d.expiryDate) < now) || (v.insurance?.expiryDate && new Date(v.insurance.expiryDate) < now) || (v.registration?.expiryDate && new Date(v.registration.expiryDate) < now);
    const eligible = v.approvalStatus === "APPROVED" && !["MAINTENANCE", "INACTIVE", "ON_TRIP"].includes(v.status) && !expiredDocs;
    return { ...v, currentTrips, expiredDocs, eligible };
  });
  return { drivers, vehicles: vehiclesOut, customers };
}

async function getOverview(req, res) {
  try {
    const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0); const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1); const dayAfter = new Date(start); dayAfter.setDate(dayAfter.getDate() + 2);
    const [requestCounts, tripCounts, driverCounts, vehicleCounts, conflictCount] = await Promise.all([
      TripRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Trip.aggregate([{ $group: { _id: "$tripStatus", count: { $sum: 1 } } }]),
      DriverProfile.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Vehicle.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Trip.aggregate([{ $match: { tripStatus: { $in: ACTIVE_SCHEDULABLE }, driver: { $ne: null }, vehicle: { $ne: null } } }, { $group: { _id: { driver: "$driver", vehicle: "$vehicle" }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: "count" }]),
    ]);
    const map = (rows) => Object.fromEntries(rows.map((x) => [x._id, x.count]));
    const tc = map(tripCounts), rc = map(requestCounts), dc = map(driverCounts), vc = map(vehicleCounts);
    const [today, tomorrowTrips] = await Promise.all([
      Trip.countDocuments({ scheduledStart: { $gte: start, $lt: tomorrow } }),
      Trip.countDocuments({ scheduledStart: { $gte: tomorrow, $lt: dayAfter } }),
    ]);
    return res.json({ success: true, kpis: {
      pendingTripRequests: rc.PENDING || 0, scheduledToday: today, scheduledTomorrow: tomorrowTrips,
      unassignedTrips: await Trip.countDocuments({ tripStatus: "SCHEDULED" }), assignedTrips: tc.ASSIGNED || 0,
      activeTrips: (tc.IN_PROGRESS || 0) + (tc.PAUSED || 0), delayedTrips: await Trip.countDocuments({ notes: /delay/i, tripStatus: { $nin: ["COMPLETED", "CANCELLED"] } }),
      rescheduledTrips: await Trip.countDocuments({ "rescheduleHistory.0": { $exists: true } }), cancelledTrips: tc.CANCELLED || 0, completedTrips: tc.COMPLETED || 0,
      availableDrivers: dc.AVAILABLE || 0, availableVehicles: vc.AVAILABLE || 0, driverAssignmentConflicts: conflictCount[0]?.count || 0, vehicleAssignmentConflicts: conflictCount[0]?.count || 0,
    }, tripStatus: tc, driverStatus: dc, vehicleStatus: vc, generatedAt: now });
  } catch (e) { console.error("Trip manager overview error:", e); fail(res, 500, "Unable to load Trip Manager overview."); }
}

async function getRequests(req, res) {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 20, max: 100 }); const filter = {};
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query.priority) filter.priority = String(req.query.priority).toUpperCase();
    if (req.query.customer && validId(req.query.customer)) filter.customer = req.query.customer;
    if (req.query.from || req.query.to) { filter.requestedDate = {}; if (req.query.from) filter.requestedDate.$gte = new Date(req.query.from); if (req.query.to) { const d=new Date(req.query.to); d.setHours(23,59,59,999); filter.requestedDate.$lte=d; } }
    if (req.query.search?.trim()) { const rx = new RegExp(escapeRx(req.query.search.trim()), "i"); const customers = await User.find({ role: "CUSTOMER", $or: [{ fullName: rx }, { email: rx }, { phone: rx }] }).select("_id").lean(); filter.$or = [{ requestNumber: rx }, { pickupLocation: rx }, { destination: rx }, { serviceType: rx }, ...(customers.length ? [{ customer: { $in: customers.map(c => c._id) } }] : [])]; }
    const [total, requests] = await Promise.all([TripRequest.countDocuments(filter), TripRequest.find(filter).populate("customer", "fullName email phone").populate("trip", "tripId tripStatus scheduledStart scheduledEnd driver vehicle").sort({ createdAt: -1 }).skip(skip).limit(limit).lean()]);
    return res.json({ success: true, count: requests.length, requests, pagination: paginationMeta(page, limit, total) });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load trip requests."); }
}

async function getTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await populateTrip(Trip.findById(req.params.id));
    if (!trip) return fail(res, 404, "Trip not found.");
    return res.json({ success: true, trip });
  } catch (e) { console.error(e); return fail(res, 500, "Unable to load trip details."); }
}

async function getTrips(req, res) {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 25, max: 100 }); const filter = {};
    if (req.query.status) filter.tripStatus = String(req.query.status).toUpperCase();
    if (req.query.driver && validId(req.query.driver)) filter.driver = req.query.driver;
    if (req.query.customer && validId(req.query.customer)) filter.customer = req.query.customer;
    if (req.query.priority) filter.priority = String(req.query.priority).toUpperCase();
    if (req.query.vehicle && validId(req.query.vehicle)) filter.vehicle = req.query.vehicle;
    if (req.query.from || req.query.to) { filter.scheduledStart = {}; if (req.query.from) filter.scheduledStart.$gte = new Date(req.query.from); if (req.query.to) { const d = new Date(req.query.to); d.setHours(23,59,59,999); filter.scheduledStart.$lte = d; } }
    if (req.query.search?.trim()) { const rx = new RegExp(escapeRx(req.query.search.trim()), "i"); filter.$or = [{ tripId: rx }, { pickupLocation: rx }, { destination: rx }, { notes: rx }]; }
    const [total, trips] = await Promise.all([Trip.countDocuments(filter), populateTrip(Trip.find(filter).sort({ scheduledStart: 1 }).skip(skip).limit(limit))]);
    return res.json({ success: true, count: trips.length, trips, pagination: paginationMeta(page, limit, total) });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load trips."); }
}

async function getResources(req, res) { try { const data = await resourceRows(); return res.json({ success: true, ...data }); } catch (e) { console.error(e); return fail(res, 500, "Unable to load dispatch resources."); } }

async function createTrip(req, res) {
  let reserved = false; let reservedVehicle = null; let reservedDriver = null;
  try {
    const { requestId, vehicle, driver, scheduledStart, scheduledEnd = null, distance = 0, notes = "" } = req.body;
    if (!validId(requestId)) return fail(res, 400, "A valid trip request ID is required.");
    const request = await TripRequest.findById(requestId);
    if (!request) return fail(res, 404, "Trip request not found.");
    if (["REJECTED", "CANCELLED", "TRIP_CREATED"].includes(request.status)) return fail(res, 409, `This request is ${request.status.toLowerCase().replace("_", " ")} and cannot create another trip.`);
    const start = new Date(scheduledStart || request.requestedDate); if (Number.isNaN(start.getTime())) return fail(res, 400, "Invalid scheduled start.");
    const end = scheduledEnd ? new Date(scheduledEnd) : new Date(start.getTime() + 60 * 60 * 1000); if (end <= start) return fail(res, 400, "Scheduled end must be after scheduled start.");
    const check = await validateResources({ driverId: driver, vehicleId: vehicle, start, end, passengerCount: request.passengerCount, vehicleType: request.vehicleType });
    if (check.message) return fail(res, check.status || 409, check.message, { conflict: check.conflict || false, conflictType: check.conflictType });
    const pair = await reservePair(vehicle, driver); reserved = true; reservedVehicle = pair.vehicle._id; reservedDriver = pair.driver.user;
    const trip = await Trip.create({ tripId: await nextTripId(), customer: request.customer, vehicle, driver, priority: request.priority || "NORMAL", pickupLocation: request.pickupLocation, destination: request.destination, scheduledStart: start, scheduledEnd: end, distance: Number(distance) || 0, tripStatus: "ASSIGNED", notes: String(notes || request.specialInstructions || "").trim(), createdBy: req.user._id });
    request.status = "TRIP_CREATED"; request.trip = trip._id; request.scheduledBy = req.user._id; request.scheduledAt = new Date(); request.acceptedBy = request.acceptedBy || req.user._id; request.acceptedAt = request.acceptedAt || new Date(); await request.save();
    const result = await populateTrip(Trip.findById(trip._id)); const io = req.app.get("io");
    await safeNotify(() => notifyUsers({ io, recipients: [trip.customer], type: "TRIP_SCHEDULED", title: "Trip Scheduled", message: `Your request ${request.requestNumber} is now scheduled as trip ${trip.tripId}.`, link: `/customer/trips/${trip._id}`, data: { tripId: trip._id, requestId: request._id } }));
    await safeNotify(() => notifyUsers({ io, recipients: [trip.driver], type: "TRIP_ASSIGNED", title: "New Trip Assigned", message: `Trip ${trip.tripId} has been assigned to you.`, link: `/driver/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId } }));
    return res.status(201).json({ success: true, message: "Trip created and assigned successfully.", trip: result });
  } catch (e) { if (reserved) await releasePair(reservedVehicle, reservedDriver).catch(() => {}); console.error(e); return fail(res, e.status || 500, e.message || "Failed to create trip."); }
}

async function assignDriver(req, res) { return assignResource(req, res, "driver"); }
async function assignVehicle(req, res) { return assignResource(req, res, "vehicle"); }
async function assignResource(req, res, kind) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await Trip.findById(req.params.id); if (!trip) return fail(res, 404, "Trip not found.");
    if (["COMPLETED", "CANCELLED", "IN_PROGRESS", "PAUSED"].includes(trip.tripStatus)) return fail(res, 409, "This trip cannot be reassigned in its current status.");
    const nextDriver = kind === "driver" ? req.body.driverId : String(trip.driver || ""); const nextVehicle = kind === "vehicle" ? req.body.vehicleId : String(trip.vehicle || "");
    if (!nextDriver || !nextVehicle || !validId(nextDriver) || !validId(nextVehicle)) return fail(res, 400, "Both an eligible driver and vehicle are required.");
    const end = trip.scheduledEnd ? new Date(trip.scheduledEnd) : new Date(new Date(trip.scheduledStart).getTime() + 60 * 60 * 1000);
    const check = await validateResources({ driverId: nextDriver, vehicleId: nextVehicle, start: new Date(trip.scheduledStart), end, excludeTripId: trip._id });
    if (check.message) return fail(res, check.status || 409, check.message, { conflict: check.conflict || false, conflictType: check.conflictType });
    const changed = String(trip.driver || "") !== String(nextDriver) || String(trip.vehicle || "") !== String(nextVehicle);
    if (changed) { await releasePair(trip.vehicle, trip.driver); await reservePair(nextVehicle, nextDriver); }
    trip.driver = nextDriver; trip.vehicle = nextVehicle; trip.tripStatus = "ASSIGNED"; trip.driverAcceptedAt = null; trip._statusChangedBy = req.user._id; await trip.save();
    const result = await populateTrip(Trip.findById(trip._id)); const io = req.app.get("io");
    await safeNotify(() => notifyUsers({ io, recipients: [nextDriver], type: "TRIP_ASSIGNED", title: "Trip Assignment Updated", message: `Trip ${trip.tripId} has been assigned to you.`, link: `/driver/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId } }));
    return res.json({ success: true, message: `${kind === "driver" ? "Driver" : "Vehicle"} assigned successfully.`, trip: result });
  } catch (e) { console.error(e); return fail(res, e.status || 500, e.message || "Unable to assign resource."); }
}

async function scheduleTrip(req, res) { return rescheduleTrip(req, res, false); }
async function rescheduleTrip(req, res, isInternal = true) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await Trip.findById(req.params.id); if (!trip) return fail(res, 404, "Trip not found.");
    if (["COMPLETED", "CANCELLED", "IN_PROGRESS", "PAUSED"].includes(trip.tripStatus)) return fail(res, 409, "This trip cannot be rescheduled in its current status.");
    const start = new Date(req.body.scheduledStart); if (Number.isNaN(start.getTime())) return fail(res, 400, "A valid scheduled start is required.");
    const end = req.body.scheduledEnd ? new Date(req.body.scheduledEnd) : new Date(start.getTime() + 60 * 60 * 1000); if (end <= start) return fail(res, 400, "Scheduled end must be after scheduled start.");
    const nextDriver = req.body.driverId || trip.driver; const nextVehicle = req.body.vehicleId || trip.vehicle;
    const check = await validateResources({ driverId: nextDriver, vehicleId: nextVehicle, start, end, excludeTripId: trip._id });
    if (check.message) return fail(res, check.status || 409, check.message, { conflict: check.conflict || false, conflictType: check.conflictType });
    const old = { scheduledStart: trip.scheduledStart, scheduledEnd: trip.scheduledEnd, driver: trip.driver, vehicle: trip.vehicle };
    const pairChanged = String(nextDriver) !== String(trip.driver || "") || String(nextVehicle) !== String(trip.vehicle || "");
    if (pairChanged) { await releasePair(trip.vehicle, trip.driver); await reservePair(nextVehicle, nextDriver); }
    trip.scheduledStart = start; trip.scheduledEnd = end; trip.driver = nextDriver; trip.vehicle = nextVehicle; trip.tripStatus = nextDriver && nextVehicle ? "ASSIGNED" : "SCHEDULED"; trip._statusChangedBy = req.user._id;
    trip.rescheduleHistory = [...(trip.rescheduleHistory || []), { oldScheduledStart: old.scheduledStart, oldScheduledEnd: old.scheduledEnd, newScheduledStart: start, newScheduledEnd: end, oldDriver: old.driver || null, newDriver: nextDriver || null, oldVehicle: old.vehicle || null, newVehicle: nextVehicle || null, reason: String(req.body.reason || "").trim(), rescheduledBy: req.user._id, rescheduledAt: new Date() }];
    await trip.save();
    const result = await populateTrip(Trip.findById(trip._id)); const io = req.app.get("io");
    await safeNotify(() => notifyUsers({ io, recipients: [trip.customer, trip.driver].filter(Boolean), type: "TRIP_RESCHEDULED", title: "Trip Rescheduled", message: `Trip ${trip.tripId} has been rescheduled to ${start.toLocaleString()}.`, link: `/customer/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId, scheduledStart: start } }));
    return res.json({ success: true, message: "Trip rescheduled successfully.", trip: result });
  } catch (e) { console.error(e); return fail(res, e.status || 500, e.message || "Unable to reschedule trip."); }
}

async function cancelTripManager(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID."); const trip = await Trip.findById(req.params.id); if (!trip) return fail(res, 404, "Trip not found.");
    if (["COMPLETED", "CANCELLED"].includes(trip.tripStatus)) return fail(res, 409, "Trip is already closed."); if (["IN_PROGRESS", "PAUSED"].includes(trip.tripStatus)) return fail(res, 409, "An active trip cannot be cancelled by Trip Manager.");
    const reason = String(req.body.reason || "").trim(); await releasePair(trip.vehicle, trip.driver);
    trip.tripStatus = "CANCELLED"; trip.cancellationReason = reason; trip.cancelledBy = req.user._id; trip.cancelledAt = new Date(); trip._statusChangedBy = req.user._id; await trip.save();
    const io = req.app.get("io"); await safeNotify(() => notifyUsers({ io, recipients: [trip.customer, trip.driver].filter(Boolean), type: "TRIP_CANCELLED", title: "Trip Cancelled", message: `Trip ${trip.tripId} has been cancelled${reason ? `: ${reason}` : "."}`, link: `/customer/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId, status: trip.tripStatus } , priority: "HIGH" }));
    return res.json({ success: true, message: "Trip cancelled successfully.", trip: await populateTrip(Trip.findById(trip._id)) });
  } catch (e) { console.error(e); return fail(res, 500, "Unable to cancel trip."); }
}

async function getRescheduled(req, res) { try { const trips = await populateTrip(Trip.find({ "rescheduleHistory.0": { $exists: true } }).sort({ updatedAt: -1 }).limit(200)); return res.json({ success: true, count: trips.length, trips }); } catch (e) { return fail(res, 500, "Unable to load rescheduled trips."); } }
async function getCancelled(req, res) { try { const trips = await populateTrip(Trip.find({ tripStatus: "CANCELLED" }).sort({ cancelledAt: -1, updatedAt: -1 }).limit(200)); return res.json({ success: true, count: trips.length, trips }); } catch (e) { return fail(res, 500, "Unable to load cancelled trips."); } }
async function getActive(req, res) { try { const trips = await populateTrip(Trip.find({ tripStatus: { $in: ["IN_PROGRESS", "PAUSED"] } }).sort({ actualStart: -1, scheduledStart: 1 }).limit(200)); return res.json({ success: true, count: trips.length, trips }); } catch (e) { return fail(res, 500, "Unable to load active trips."); } }
async function getDelayed(req, res) { try { const trips = await populateTrip(Trip.find({ tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS", "PAUSED"] }, $or: [{ notes: /delay/i }, { scheduledStart: { $lt: new Date(Date.now() - 15 * 60 * 1000) } }] }).sort({ scheduledStart: 1 }).limit(200)); return res.json({ success: true, count: trips.length, trips }); } catch (e) { return fail(res, 500, "Unable to load delayed trips."); } }
async function getLiveTracking(req, res) { try { const rows = await TripTracking.find({}).populate("trip", "tripId tripStatus pickupLocation destination").populate("vehicle", "registrationNumber vehicleType status").populate("driver", "fullName phone").sort({ recordedAt: -1 }).limit(1000).lean(); const latest = new Map(); rows.forEach(r => { const key = String(r.trip?._id || r.trip); if (!latest.has(key)) latest.set(key, r); }); return res.json({ success: true, tracking: [...latest.values()] }); } catch (e) { return fail(res, 500, "Unable to load live tracking."); } }
async function getConflicts(req, res) { try { const trips = await Trip.find({ tripStatus: { $in: ACTIVE_SCHEDULABLE }, driver: { $ne: null }, vehicle: { $ne: null } }).populate("driver", "fullName").populate("vehicle", "registrationNumber").sort({ scheduledStart: 1 }).lean(); const conflicts=[]; for(let i=0;i<trips.length;i++){for(let j=i+1;j<trips.length;j++){const a=trips[i],b=trips[j]; if(String(a.driver?._id||a.driver)===String(b.driver?._id||b.driver) || String(a.vehicle?._id||a.vehicle)===String(b.vehicle?._id||b.vehicle)){const aEnd=effectiveEnd(a), bEnd=effectiveEnd(b); if(new Date(a.scheduledStart)<bEnd && aEnd>new Date(b.scheduledStart)) conflicts.push({resource:String(a.driver?._id||a.driver)===String(b.driver?._id||b.driver)?"DRIVER":"VEHICLE",first:a,second:b});}}} return res.json({success:true,count:conflicts.length,conflicts}); } catch(e){ return fail(res,500,"Unable to detect trip conflicts."); } }
async function getNotifications(req,res){ try { const Notification=require("../models/Notification"); const {page,limit,skip}=paginationParams(req,{limit:25,max:100}); const [total,notifications]=await Promise.all([Notification.countDocuments({recipient:req.user._id}),Notification.find({recipient:req.user._id}).sort({createdAt:-1}).skip(skip).limit(limit).lean()]); return res.json({success:true,count:notifications.length,notifications,pagination:paginationMeta(page,limit,total)}); } catch(e){ return fail(res,500,"Unable to load notifications."); } }

async function nextTripId() { const latest = await Trip.findOne({ tripId: /^TRP-\d+$/ }).sort({ createdAt: -1 }).select("tripId").lean(); const n = latest ? Number(latest.tripId.split("-")[1]) + 1 : 1001; return `TRP-${String(n).padStart(4, "0")}`; }

module.exports = { getOverview, getRequests, getTrips, getTrip, getResources, createTrip, assignDriver, assignVehicle, scheduleTrip, rescheduleTrip: (req,res)=>rescheduleTrip(req,res,true), cancelTripManager, getRescheduled, getCancelled, getActive, getDelayed, getLiveTracking, getConflicts, getNotifications, normalizeRole };