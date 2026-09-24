const mongoose = require("mongoose");
const User = require("../models/User");
const Trip = require("../models/Trip");
const Vehicle = require("../models/Vehicle");
const Assignment = require("../models/Assignment");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const TripRequest = require("../models/TripRequest");
const TripTracking = require("../models/TripTracking");
const { reservePair, releasePair, hasActiveTripForVehicle, hasActiveTripForDriver } = require("../utils/fleetHelpers");
const { safeNotify, notifyRoles, notifyUsers } = require("../services/notificationService");
const { paginationParams, paginationMeta } = require("../utils/pagination");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const ok = (res, data = {}, message) => res.status(200).json({ success: true, ...(message ? { message } : {}), ...data });
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const ACTIVE_TRIP_STATUSES = ["IN_PROGRESS", "PAUSED"];
const CUSTOMER_TRIP_STATUSES = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"];
const REQUEST_STATUSES = ["PENDING", "REVIEWED", "ACCEPTED", "REJECTED", "TRIP_CREATED", "CANCELLED"];
const SERVICE_TYPES = ["Passenger Transportation", "Cargo Transportation", "Goods Delivery", "Full Truck Load", "Other"];

const customerId = (req) => req.user._id;
const escapeRx = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function dayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function populateTrip(query) {
  return query
    .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model year fuelType capacity currentOdometer status")
    .populate("driver", "fullName email phone")
    .populate("customer", "fullName email phone")
    .populate("createdBy", "fullName email");
}

function invoiceView(invoice) {
  const paid = Number(invoice.paidAmount || 0);
  const total = Number(invoice.totalAmount || 0);
  return {
    ...invoice,
    paidAmount: paid,
    totalAmount: total,
    balanceAmount: Math.max(0, Number(invoice.balanceAmount ?? total - paid)),
  };
}

async function getCustomerDashboard(req, res) {
  try {
    const id = customerId(req);
    const { start, end } = dayBounds();
    const [activeTrips, pendingRequests, completedTrips, invoiceRows, recentRequests, recentInvoices] = await Promise.all([
      populateTrip(Trip.find({ customer: id, tripStatus: { $in: ACTIVE_TRIP_STATUSES } }).sort({ scheduledStart: 1 }).limit(20)).lean(),
      TripRequest.countDocuments({ customer: id, status: "PENDING" }),
      Trip.countDocuments({ customer: id, tripStatus: "COMPLETED" }),
      Invoice.find({ customer: id, status: { $ne: "CANCELLED" } }).select("totalAmount paidAmount balanceAmount status").lean(),
      TripRequest.find({ customer: id }).sort({ createdAt: -1 }).limit(5).populate("trip", "tripId tripStatus").lean(),
      Invoice.find({ customer: id }).sort({ invoiceDate: -1 }).limit(5).populate("trip", "tripId").lean(),
    ]);

    const outstandingBilling = invoiceRows.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.balanceAmount ?? Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0))), 0);
    const todaysTrips = await Trip.countDocuments({ customer: id, scheduledStart: { $gte: start, $lt: end } });

    return ok(res, {
      dashboard: {
        activeTripsCount: activeTrips.length,
        pendingRequestsCount: pendingRequests,
        completedTripsCount: completedTrips,
        outstandingBillingAmount: outstandingBilling,
        todaysTripsCount: todaysTrips,
        activeTrips,
        recentRequests,
        recentInvoices: recentInvoices.map(invoiceView),
      },
    });
  } catch (error) {
    console.error("Customer dashboard error:", error);
    return fail(res, 500, "Unable to load customer dashboard.");
  }
}

async function createTripRequest(req, res) {
  try {
    const body = req.body || {};
    if (!body.pickupLocation?.trim() || !body.destination?.trim()) return fail(res, 400, "Pickup and destination are required.");
    if (!body.requestedDate || Number.isNaN(new Date(body.requestedDate).getTime())) return fail(res, 400, "A valid requested date is required.");
    if (!body.requestedTime?.trim()) return fail(res, 400, "Requested time is required.");
    if (!body.serviceType?.trim() || !SERVICE_TYPES.includes(body.serviceType.trim())) return fail(res, 400, "Invalid service type.");

    const passengerCount = Math.max(0, Number(body.passengerCount || 0));
    const cargoWeight = Math.max(0, Number(body.cargoWeight || 0));
    const quantity = Math.max(0, Number(body.quantity || 0));
    if (![passengerCount, cargoWeight, quantity].every(Number.isFinite)) return fail(res, 400, "Passenger, cargo and quantity values must be valid numbers.");

    const requestNumber = `REQ-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const request = await TripRequest.create({
      requestNumber,
      customer: customerId(req),
      pickupLocation: body.pickupLocation.trim(),
      destination: body.destination.trim(),
      requestedDate: new Date(body.requestedDate),
      requestedTime: body.requestedTime.trim(),
      serviceType: body.serviceType.trim(),
      vehicleType: String(body.vehicleType || "").trim(),
      passengerCount,
      cargoDetails: String(body.cargoDetails || "").trim(),
      cargoWeight,
      quantity,
      specialInstructions: String(body.specialInstructions || "").trim(),
      status: "PENDING",
    });

    const io = req.app.get("io");
    await safeNotify(
      () => notifyRoles({ io, 
        roles: ["FLEET_MANAGER", "SUPER_ADMIN", "TRIP_MANAGER", "DISPATCHER"],
         type: "TRIP_REQUEST_NEW",
          title: "New Trip Request", 
          message: `${req.user.fullName || "A customer"} submitted trip request ${request.requestNumber}.`,
          link: "/dashboard", data: { requestId: request._id, requestNumber: request.requestNumber } }));
    await safeNotify(() => notifyUsers(
      { io, recipients: [request.customer], 
        type: "TRIP_REQUEST_SUBMITTED", 
        title: "Trip Request Submitted",
         message: `Your trip request ${request.requestNumber} has been submitted successfully.`, 
         link: "/customer/trips", data: { requestId: request._id, requestNumber: request.requestNumber } }));
    return res.status(201).json({ success: true, message: "Trip request submitted successfully.", request });
  } catch (error) {
    console.error("Create customer trip request error:", error);
    return fail(res, 400, error.message || "Unable to submit trip request.");
  }
}

async function getTripRequests(req, res) {
  try {
    const filter = { customer: customerId(req) };
    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      if (!REQUEST_STATUSES.includes(status)) return fail(res, 400, "Invalid request status.");
      filter.status = status;
    }
    if (req.query.search?.trim()) {
      const rx = new RegExp(escapeRx(req.query.search.trim()), "i");
      filter.$or = [{ requestNumber: rx }, { pickupLocation: rx }, { destination: rx }, { serviceType: rx }];
    }
    const requests = await TripRequest.find(filter).sort({ createdAt: -1 }).populate("trip", "tripId tripStatus").lean();
    return ok(res, { requests, count: requests.length });
  } catch (error) {
    console.error("Customer trip requests error:", error);
    return fail(res, 500, "Unable to load trip requests.");
  }
}

async function getTripRequest(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid request ID.");
    const request = await TripRequest.findOne({ _id: req.params.id, customer: customerId(req) }).populate("trip", "tripId tripStatus pickupLocation destination scheduledStart").lean();
    if (!request) return fail(res, 404, "Trip request not found.");
    return ok(res, { request });
  } catch (error) {
    console.error("Customer trip request detail error:", error);
    return fail(res, 500, "Unable to load trip request.");
  }
}

function buildTripFilter(req) {
  const filter = { customer: customerId(req) };
  const { search = "", status = "", date = "" } = req.query;
  if (status) {
    const normalized = String(status).toUpperCase();
    if (!CUSTOMER_TRIP_STATUSES.includes(normalized)) throw new Error("Invalid trip status.");
    filter.tripStatus = normalized;
  }
  if (search.trim()) {
    const rx = new RegExp(escapeRx(search.trim()), "i");
    filter.$or = [{ tripId: rx }, { pickupLocation: rx }, { destination: rx }];
  }
  if (date) {
    const { start, end } = dayBounds(new Date(date));
    if (Number.isNaN(start.getTime())) throw new Error("Invalid date.");
    filter.scheduledStart = { $gte: start, $lt: end };
  }
  return filter;
}

async function getCustomerTrips(req, res) {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 20, max: 100 });
    const filter = buildTripFilter(req);
    const [total, trips] = await Promise.all([
      Trip.countDocuments(filter),
      populateTrip(Trip.find(filter).sort({ scheduledStart: -1 }).skip(skip).limit(limit)).lean(),
    ]);
    return ok(res, { trips, count: trips.length, pagination: paginationMeta(page, limit, total) });
  } catch (error) {
    console.error("Customer trips error:", error);
    return fail(res, 400, error.message || "Unable to load your trips.");
  }
}

async function getCustomerTrip(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await populateTrip(Trip.findOne({ _id: req.params.id, customer: customerId(req) })).lean();
    if (!trip) return fail(res, 404, "Trip not found for your account.");
    return ok(res, { trip });
  } catch (error) {
    console.error("Customer trip detail error:", error);
    return fail(res, 500, "Unable to load trip details.");
  }
}

async function getCustomerTracking(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await populateTrip(Trip.findOne({ _id: req.params.id, customer: customerId(req) })).lean();
    if (!trip) return fail(res, 404, "Trip not found for your account.");
    if (!ACTIVE_TRIP_STATUSES.includes(trip.tripStatus)) {
      return ok(res, { tracking: null, available: false, message: "Live tracking is available only for active trips." });
    }
    const tracking = await TripTracking.findOne({ trip: trip._id }).sort({ recordedAt: -1 }).populate("vehicle", "registrationNumber").populate("driver", "fullName").lean();
    return ok(res, {
      available: true,
      tracking: tracking || null,
      trip: {
        _id: trip._id,
        tripId: trip.tripId,
        tripStatus: trip.tripStatus,
        vehicle: trip.vehicle,
        driver: trip.driver,
        distance: trip.distance,
        pickupLocation: trip.pickupLocation,
        destination: trip.destination,
      },
      message: tracking ? "Live tracking loaded." : "Live tracking data has not been reported for this trip yet.",
    });
  } catch (error) {
    console.error("Customer tracking error:", error);
    return fail(res, 500, "Unable to load live tracking.");
  }
}

async function getTripHistory(req, res) {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 20, max: 100 });
    const filter = { customer: customerId(req), tripStatus: "COMPLETED" };
    const [total, trips] = await Promise.all([
      Trip.countDocuments(filter),
      populateTrip(Trip.find(filter).sort({ actualEnd: -1 }).skip(skip).limit(limit)).lean(),
    ]);
    return ok(res, { trips, count: trips.length, pagination: paginationMeta(page, limit, total) });
  } catch (error) {
    console.error("Customer trip history error:", error);
    return fail(res, 500, "Unable to load trip history.");
  }
}

async function getCustomerInvoices(req, res) {
  try {
    const invoices = await Invoice.find({ customer: customerId(req) })
      .populate("trip", "tripId pickupLocation destination scheduledStart scheduledEnd tripStatus")
      .sort({ invoiceDate: -1 })
      .lean();
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const payments = invoiceIds.length
      ? await Payment.find({ invoice: { $in: invoiceIds }, type: "RECEIVED", $or: [{ customer: customerId(req) }, { customer: null }] })
          .sort({ paymentDate: -1 })
          .lean()
      : [];
    const byInvoice = new Map();
    for (const payment of payments) {
      const key = String(payment.invoice);
      if (!byInvoice.has(key)) byInvoice.set(key, []);
      byInvoice.get(key).push(payment);
    }
    const data = invoices.map((invoice) => ({ ...invoiceView(invoice), payments: byInvoice.get(String(invoice._id)) || [] }));
    const totalInvoiced = data.filter((x) => x.status !== "CANCELLED").reduce((sum, x) => sum + Number(x.totalAmount || 0), 0);
    const totalPaid = data.filter((x) => x.status !== "CANCELLED").reduce((sum, x) => sum + Number(x.paidAmount || 0), 0);
    return ok(res, { invoices: data, summary: { totalInvoiced, totalPaid, outstandingAmount: Math.max(0, totalInvoiced - totalPaid) } });
  } catch (error) {
    console.error("Customer invoices error:", error);
    return fail(res, 500, "Unable to load your billing information.");
  }
}

async function getCustomerInvoice(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid invoice ID.");
    const invoice = await Invoice.findOne({ _id: req.params.id, customer: customerId(req) })
      .populate("trip", "tripId pickupLocation destination scheduledStart scheduledEnd actualStart actualEnd tripStatus distance")
      .populate("customer", "fullName email phone")
      .lean();
    if (!invoice) return fail(res, 404, "Invoice not found for your account.");
    const payments = await Payment.find({ invoice: invoice._id, type: "RECEIVED", $or: [{ customer: customerId(req) }, { customer: null }] }).sort({ paymentDate: -1 }).lean();
    return ok(res, { invoice: { ...invoiceView(invoice), payments } });
  } catch (error) {
    console.error("Customer invoice detail error:", error);
    return fail(res, 500, "Unable to load invoice details.");
  }
}

async function getCustomerProfile(req, res) {
  try {
    const user = await User.findOne({ _id: customerId(req), role: "CUSTOMER" }).select("fullName email phone role isActive accountStatus createdAt updatedAt").lean();
    if (!user) return fail(res, 404, "Customer account not found.");
    return ok(res, { profile: user });
  } catch (error) {
    console.error("Customer profile error:", error);
    return fail(res, 500, "Unable to load your profile.");
  }
}

async function updateCustomerProfile(req, res) {
  try {
    const allowed = ["fullName", "phone"];
    const unexpected = Object.keys(req.body || {}).filter((key) => !allowed.includes(key));
    if (unexpected.length) return fail(res, 400, "Only name and phone can be updated.");
    const user = await User.findOne({ _id: customerId(req), role: "CUSTOMER" });
    if (!user) return fail(res, 404, "Customer account not found.");
    if (req.body.fullName !== undefined) {
      const fullName = String(req.body.fullName).trim();
      if (fullName.length < 2 || fullName.length > 100) return fail(res, 400, "Full name must contain 2 to 100 characters.");
      user.fullName = fullName;
    }
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (phone && !/^[+0-9()\-\s]{7,20}$/.test(phone)) return fail(res, 400, "Enter a valid phone number.");
      user.phone = phone || null;
    }
    await user.save();
    const profile = await User.findById(user._id).select("fullName email phone role isActive accountStatus createdAt updatedAt").lean();
    return ok(res, { profile }, "Profile updated successfully.");
  } catch (error) {
    console.error("Update customer profile error:", error);
    return fail(res, 500, "Unable to update your profile.");
  }
}

async function listRequestsForOperations(req, res) {
  try {
    const requests = await TripRequest.find({}).sort({ createdAt: -1 }).populate("customer", "fullName email phone").populate("trip", "tripId tripStatus").lean();
    return ok(res, { requests });
  } catch (error) {
    console.error("Operational trip requests error:", error);
    return fail(res, 500, "Unable to load trip requests.");
  }
}

async function convertTripRequest(req, res) {
  let reserved = false;
  let reservedVehicle = null;
  let reservedDriver = null;
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid request ID.");
    const request = await TripRequest.findById(req.params.id);
    if (!request) return fail(res, 404, "Trip request not found.");
    if (!["REVIEWED", "ACCEPTED"].includes(request.status)) return fail(res, 409, "Only reviewed or accepted requests can be converted into a trip.");
    if (request.trip) return fail(res, 409, "A trip has already been created from this request.");

    const { vehicle = null, driver = null, scheduledStart, scheduledEnd, distance = 0, notes = "" } = req.body || {};
    if (vehicle && !validId(vehicle)) return fail(res, 400, "Invalid vehicle ID.");
    if (driver && !validId(driver)) return fail(res, 400, "Invalid driver ID.");
    if ((vehicle && !driver) || (!vehicle && driver)) return fail(res, 400, "Vehicle and driver must be assigned together.");

    let assignedVehicle = null;
    let assignedDriver = null;
    let status = "SCHEDULED";
    if (vehicle && driver) {
      if (await hasActiveTripForVehicle(vehicle) || await hasActiveTripForDriver(driver)) return fail(res, 409, "Vehicle or driver is already on another active trip.");
      const pair = await reservePair(vehicle, driver);
      assignedVehicle = pair.vehicle._id;
      assignedDriver = pair.driver.user;
      reservedVehicle = assignedVehicle;
      reservedDriver = assignedDriver;
      reserved = true;
      status = "ASSIGNED";
    }

    const start = scheduledStart ? new Date(scheduledStart) : new Date(`${new Date(request.requestedDate).toISOString().slice(0, 10)}T${request.requestedTime}`);
    if (Number.isNaN(start.getTime())) return fail(res, 400, "Invalid scheduled start.");
    const end = scheduledEnd ? new Date(scheduledEnd) : null;
    if (end && Number.isNaN(end.getTime())) return fail(res, 400, "Invalid scheduled end.");
    if (end && end < start) return fail(res, 400, "Scheduled end must be after scheduled start.");

    const latest = await Trip.findOne({ tripId: /^TRP-\d+$/ }).sort({ createdAt: -1 }).select("tripId").lean();
    const next = latest ? Number(latest.tripId.split("-")[1]) + 1 : 1001;
    const trip = await Trip.create({
      tripId: `TRP-${String(next).padStart(4, "0")}`,
      customer: request.customer,
      vehicle: assignedVehicle,
      driver: assignedDriver,
      pickupLocation: request.pickupLocation,
      destination: request.destination,
      scheduledStart: start,
      scheduledEnd: end,
      distance: Math.max(0, Number(distance || 0)),
      tripStatus: status,
      notes: String(notes || request.specialInstructions || "").trim(),
      createdBy: req.user._id,
    });

    request.status = "TRIP_CREATED";
    request.trip = trip._id;
    request.reviewedBy = request.reviewedBy || req.user._id;
    request.reviewedAt = request.reviewedAt || new Date();
    await request.save();

    const result = await populateTrip(Trip.findById(trip._id));
    return res.status(201).json({ success: true, message: "Trip created from customer request.", trip: result, request });
  } catch (error) {
    console.error("Convert customer request error:", error);
    if (reserved) await releasePair(reservedVehicle, reservedDriver).catch(() => {});
    return fail(res, error.code === 11000 ? 409 : 400, error.code === 11000 ? "Unable to generate a unique trip ID. Please try again." : error.message || "Unable to convert trip request.");
  }
}

async function updateRequestStatus(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid request ID.");
    const status = String(req.body?.status || "").toUpperCase();
    if (!["REVIEWED", "ACCEPTED", "REJECTED", "CANCELLED"].includes(status)) return fail(res, 400, "Invalid request status.");
    const request = await TripRequest.findById(req.params.id);
    if (!request) return fail(res, 404, "Trip request not found.");
    if (request.status === "TRIP_CREATED") return fail(res, 409, "A trip has already been created from this request.");
    request.status = status;
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.rejectionReason = status === "REJECTED" ? String(req.body?.rejectionReason || "").trim() : "";
    await request.save();
    return ok(res, { request }, "Trip request status updated.");
  } catch (error) {
    console.error("Update trip request status error:", error);
    return fail(res, 400, error.message || "Unable to update trip request.");
  }
}

module.exports = {
  getCustomerDashboard,
  createTripRequest,
  getTripRequests,
  getTripRequest,
  getCustomerTrips,
  getCustomerTrip,
  getCustomerTracking,
  getTripHistory,
  getCustomerInvoices,
  getCustomerInvoice,
  getCustomerProfile,
  updateCustomerProfile,
  listRequestsForOperations,
  updateRequestStatus,
  convertTripRequest,
};