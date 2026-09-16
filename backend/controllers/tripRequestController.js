const mongoose = require("mongoose");
const TripRequest = require("../models/TripRequest");
const Trip = require("../models/Trip");
const Vehicle = require("../models/Vehicle");
const DriverProfile = require("../models/DriverProfile");
const { reservePair, releasePair, hasActiveTripForVehicle, hasActiveTripForDriver } = require("../utils/fleetHelpers");
const { safeNotify, notifyRoles, notifyUsers } = require("../services/notificationService");
const { paginationParams, paginationMeta } = require("../utils/pagination");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const REQUEST_STATUSES = ["PENDING", "REVIEWED", "ACCEPTED", "REJECTED", "TRIP_CREATED", "CANCELLED"];

const populateRequest = (query) => query
  .populate("customer", "fullName email phone")
  .populate("trip", "tripId tripStatus scheduledStart scheduledEnd vehicle driver")
  .populate("acceptedBy", "fullName email")
  .populate("scheduledBy", "fullName email");

async function nextRequestNumber() {
  const latest = await TripRequest.findOne({ requestNumber: /^TRQ-\d+$/ })
    .sort({ createdAt: -1 })
    .select("requestNumber")
    .lean();
  const n = latest ? Number(latest.requestNumber.split("-")[1]) + 1 : 1001;
  return `TRQ-${String(n).padStart(4, "0")}`;
}

async function nextTripId() {
  const latest = await Trip.findOne({ tripId: /^TRP-\d+$/ }).sort({ createdAt: -1 }).select("tripId").lean();
  const n = latest ? Number(latest.tripId.split("-")[1]) + 1 : 1001;
  return `TRP-${String(n).padStart(4, "0")}`;
}

async function getTripRequests(req, res) {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 20, max: 100 });
    const filter = {};
    if (req.query.status) { const status = String(req.query.status).toUpperCase(); if (!REQUEST_STATUSES.includes(status)) return fail(res,400,"Invalid trip request status."); filter.status=status; }
    if (req.query.search?.trim()) { const raw = req.query.search.trim(); const escaped = raw.replace(/[^\w\s-]/g, "\\$&"); const rx = new RegExp(escaped, "i"); const customers=await require("../models/User").find({role:"CUSTOMER",$or:[{fullName:rx},{email:rx},{phone:rx}]}).select("_id").lean(); filter.$or=[{requestNumber:rx},{pickupLocation:rx},{destination:rx},{serviceType:rx},{vehicleType:rx},...(customers.length?[{customer:{$in:customers.map(c=>c._id)}}]:[])]; }
    const [total, requests] = await Promise.all([TripRequest.countDocuments(filter), populateRequest(TripRequest.find(filter).sort({createdAt:-1}).skip(skip).limit(limit))]);
    res.json({success:true,count:requests.length,requests,pagination:paginationMeta(page,limit,total)});
  } catch(e){ console.error("Get trip requests error:",e); fail(res,500,"Unable to load customer trip requests."); }
}

async function getTripRequest(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip request ID.");
    const request = await populateRequest(TripRequest.findById(req.params.id));
    if (!request) return fail(res, 404, "Trip request not found.");
    res.json({ success: true, request });
  } catch (e) {
    console.error("Get trip request error:", e);
    fail(res, 500, "Unable to load trip request.");
  }
}

async function createCustomerTripRequest(req, res) {
  try {
    const { pickupLocation, destination, requestedDate, requestedTime = "", serviceType = "Passenger Transportation", vehicleType = "", passengerCount = 0, cargoDetails = "", cargoWeight = 0, specialInstructions = "" } = req.body;
    if (!pickupLocation?.trim() || !destination?.trim() || !requestedDate) return fail(res, 400, "Pickup, destination and requested date are required.");
    const date = new Date(requestedDate);
    if (Number.isNaN(date.getTime())) return fail(res, 400, "Invalid requested date.");

    let request;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        request = await TripRequest.create({
          requestNumber: await nextRequestNumber(),
          customer: req.user._id,
          pickupLocation: pickupLocation.trim(),
          destination: destination.trim(),
          requestedDate: date,
          requestedTime: String(requestedTime || "").trim(),
          serviceType: String(serviceType || "").trim(),
          vehicleType: String(vehicleType || "").trim(),
          passengerCount: Number(passengerCount) || 0,
          cargoDetails: String(cargoDetails || "").trim(),
          cargoWeight: Number(cargoWeight) || 0,
          specialInstructions: String(specialInstructions || "").trim(),
          status: "PENDING",
        });
        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 2) throw error;
      }
    }
    const result = await populateRequest(TripRequest.findById(request._id));
    const io = req.app.get("io");
    await safeNotify(() => notifyRoles({ io, roles: ["FLEET_MANAGER", "SUPER_ADMIN", "TRIP_MANAGER", "DISPATCHER"], type: "TRIP_REQUEST_NEW", title: "New Trip Request", message: `${req.user.fullName || "A customer"} submitted a new trip request ${request.requestNumber}.`, link: "/dashboard", data: { requestId: request._id, requestNumber: request.requestNumber }, priority: "NORMAL" }));
    await safeNotify(() => notifyUsers({ io, recipients: [request.customer], type: "TRIP_REQUEST_SUBMITTED", title: "Trip Request Submitted", message: `Your trip request ${request.requestNumber} has been submitted successfully.`, link: "/customer/trips", data: { requestId: request._id, requestNumber: request.requestNumber } }));
    res.status(201).json({ success: true, message: "Trip request submitted successfully.", request: result });
  } catch (e) {
    console.error("Create customer trip request error:", e);
    fail(res, 500, "Failed to create trip request.");
  }
}

async function updateTripRequestStatus(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip request ID.");
    const { status, rejectionReason = "" } = req.body;
    const nextStatus = String(status || "").toUpperCase();
    if (!REQUEST_STATUSES.includes(nextStatus)) return fail(res, 400, "Invalid trip request status.");

    const request = await TripRequest.findById(req.params.id);
    if (!request) return fail(res, 404, "Trip request not found.");
    if (["TRIP_CREATED", "CANCELLED"].includes(request.status)) return fail(res, 409, `A ${request.status.toLowerCase().replace("_", " ")} request cannot be changed.`);
    if (nextStatus === "TRIP_CREATED") return fail(res, 400, "Use the schedule action to create the trip.");

    request.status = nextStatus;
    if (nextStatus === "ACCEPTED") {
      request.acceptedBy = req.user._id;
      request.acceptedAt = new Date();
    }
    if (nextStatus === "REJECTED") request.rejectionReason = String(rejectionReason || "").trim();
    await request.save();

    const result = await populateRequest(TripRequest.findById(request._id));
    const io = req.app.get("io");
    const messages = {
      REVIEWED: "Your trip request has been reviewed.",
      ACCEPTED: "Your trip request has been accepted.",
      REJECTED: `Your trip request has been rejected${request.rejectionReason ? `: ${request.rejectionReason}` : "."}`,
      CANCELLED: "Your trip request has been cancelled.",
    };
    if (messages[nextStatus]) await safeNotify(() => notifyUsers({ io, recipients: [request.customer], type: `TRIP_REQUEST_${nextStatus}`, title: `Trip Request ${nextStatus.replace("_", " ")}`, message: `${messages[nextStatus]} (${request.requestNumber})`, link: "/customer/trips", data: { requestId: request._id, requestNumber: request.requestNumber, status: nextStatus }, priority: nextStatus === "REJECTED" ? "HIGH" : "NORMAL" }));
    res.json({ success: true, message: `Trip request marked ${nextStatus.replace("_", " ").toLowerCase()}.`, request: result });
  } catch (e) {
    console.error("Update trip request status error:", e);
    fail(res, 500, "Failed to update trip request.");
  }
}

async function scheduleTripRequest(req, res) {
  let reserved = false;
  let reservedVehicle = null;
  let reservedDriver = null;
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip request ID.");
    const { vehicle, driver, scheduledStart, scheduledEnd = null, distance = 0, notes = "" } = req.body;
    if (!validId(vehicle) || !validId(driver)) return fail(res, 400, "A valid vehicle and driver are required.");
    if (!scheduledStart) return fail(res, 400, "Scheduled start is required.");

    const request = await TripRequest.findById(req.params.id);
    if (!request) return fail(res, 404, "Trip request not found.");
    if (["REJECTED", "CANCELLED", "TRIP_CREATED"].includes(request.status)) return fail(res, 409, `This request is ${request.status.toLowerCase().replace("_", " ")} and cannot be scheduled.`);

    const start = new Date(scheduledStart);
    if (Number.isNaN(start.getTime())) return fail(res, 400, "Invalid scheduled start.");
    const end = scheduledEnd ? new Date(scheduledEnd) : null;
    if (end && Number.isNaN(end.getTime())) return fail(res, 400, "Invalid scheduled end.");
    if (end && end < start) return fail(res, 400, "Scheduled end must be after scheduled start.");
    if (await hasActiveTripForVehicle(vehicle) || await hasActiveTripForDriver(driver)) return fail(res, 409, "Vehicle or driver is already on another active trip.");

    const pair = await reservePair(vehicle, driver);
    reserved = true;
    reservedVehicle = pair.vehicle._id;
    reservedDriver = pair.driver.user;

    let trip;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        trip = await Trip.create({
          tripId: await nextTripId(),
          customer: request.customer,
          vehicle: vehicle,
          driver: driver,
          pickupLocation: request.pickupLocation,
          destination: request.destination,
          scheduledStart: start,
          scheduledEnd: end,
          distance: Number(distance) || 0,
          tripStatus: "ASSIGNED",
          notes: String(notes || request.specialInstructions || "").trim(),
          createdBy: req.user._id,
        });
        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 2) throw error;
      }
    }

    request.status = "TRIP_CREATED";
    request.trip = trip._id;
    request.scheduledBy = req.user._id;
    request.scheduledAt = new Date();
    if (!request.acceptedAt) {
      request.acceptedBy = req.user._id;
      request.acceptedAt = new Date();
    }
    await request.save();

    const populatedTrip = await Trip.findById(trip._id)
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("driver", "fullName email phone")
      .populate("customer", "fullName email phone")
      .lean();

    const io = req.app.get("io");
    await safeNotify(() => notifyUsers({ io, recipients: [request.customer], type: "TRIP_SCHEDULED", title: "Trip Scheduled", message: `Your request ${request.requestNumber} is now scheduled as trip ${trip.tripId}.`, link: `/customer/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId, requestId: request._id } }));
    await safeNotify(() => notifyUsers({ io, recipients: [driver], type: "TRIP_ASSIGNED", title: "New Trip Assigned", message: `Trip ${trip.tripId} has been assigned to you.`, link: `/driver/trips/${trip._id}`, data: { tripId: trip._id, tripNumber: trip.tripId } }));
    res.status(201).json({ success: true, message: "Trip request accepted and scheduled successfully.", trip: populatedTrip });
  } catch (e) {
    console.error("Schedule trip request error:", e);
    if (reserved) await releasePair(reservedVehicle, reservedDriver).catch(() => {});
    fail(res, e.status || 500, e.message || "Failed to schedule trip request.");
  }
}

module.exports = { getTripRequests, getTripRequest, createCustomerTripRequest, updateTripRequestStatus, scheduleTripRequest };
