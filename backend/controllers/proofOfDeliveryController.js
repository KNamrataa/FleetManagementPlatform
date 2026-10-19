const mongoose = require("mongoose");
const Trip = require("../models/Trip");
const ProofOfDelivery = require("../models/ProofOfDelivery");
const { notifyRoles, safeNotify } = require("../services/notificationService");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const MANAGER_ROLES = ["TRIP_MANAGER", "DISPATCHER", "FLEET_MANAGER", "SUPER_ADMIN", "VIEWER"];

function validatePhoto(photo) {
  if (!photo || typeof photo.data !== "string" ||
      !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photo.data)) {
    throw new Error("Photos must be JPG, PNG, or WEBP image files.");
  }
  if (photo.data.length > 1_100_000) throw new Error("Each photo must be smaller than approximately 800 KB.");
  const latitude = photo.latitude == null ? null : Number(photo.latitude);
  const longitude = photo.longitude == null ? null : Number(photo.longitude);
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error("Invalid photo latitude.");
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error("Invalid photo longitude.");
  return { data: photo.data, caption: String(photo.caption || "").trim().slice(0, 250), latitude, longitude, uploadedAt: new Date() };
}
function validatePhotos(list, label) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 3) throw new Error(`Upload no more than 3 ${label} photos.`);
  return list.map(validatePhoto);
}
function validateSignature(value) {
  if (!value) return "";
  if (typeof value !== "string" || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(value) || value.length > 1_100_000) {
    throw new Error("Recipient signature must be a valid PNG or JPEG image under 800 KB.");
  }
  return value;
}

async function getDriverTrips(req, res) {
  try {
    const trips = await Trip.find({ driver: req.user._id, tripStatus: { $nin: ["CANCELLED"] } })
      .select("tripId customer vehicle pickupLocation destination scheduledStart actualStart actualEnd tripStatus")
      .populate("customer", "fullName email")
      .populate("vehicle", "registrationNumber")
      .sort({ scheduledStart: -1 }).limit(100).lean();
    const proofs = await ProofOfDelivery.find({ driver: req.user._id }).select("trip deliveryStatus deliveryTimestamp").lean();
    const byTrip = new Map(proofs.map(p => [String(p.trip), p]));
    res.json({ success: true, trips: trips.map(t => ({ ...t, proofOfDelivery: byTrip.get(String(t._id)) || null })) });
  } catch (e) {
    console.error("POD driver trips error:", e);
    fail(res, 500, "Unable to load trips for Proof of Delivery.");
  }
}

async function submitProof(req, res) {
  try {
    const body = req.body || {};
    if (!validId(body.tripId)) return fail(res, 400, "Select a valid trip.");
    const deliveryStatus = String(body.deliveryStatus || "").toUpperCase();
    if (!["DELIVERED", "PARTIALLY_DELIVERED", "FAILED"].includes(deliveryStatus)) return fail(res, 400, "Select a valid delivery outcome.");
    const trip = await Trip.findOne({ _id: body.tripId, driver: req.user._id }).select("_id tripId driver customer tripStatus").lean();
    if (!trip) return fail(res, 403, "You can submit proof only for a trip assigned to you.");
    if (trip.tripStatus === "CANCELLED") return fail(res, 409, "Proof cannot be submitted for a cancelled trip.");
    const existing = await ProofOfDelivery.findOne({ trip: trip._id }).select("_id").lean();
    if (existing) return fail(res, 409, "Proof of Delivery has already been submitted for this trip. Contact an authorized manager if it needs correction.");

    const notes = String(body.notes || "").trim();
    const failureReason = String(body.failureReason || "").trim();
    const partialDeliveryDetails = String(body.partialDeliveryDetails || "").trim();
    const recipientName = String(body.recipientName || "").trim();
    const recipientConfirmation = String(body.recipientConfirmation || "").trim();
    if (notes.length > 3000 || failureReason.length > 1500 || partialDeliveryDetails.length > 1500 || recipientName.length > 160 || recipientConfirmation.length > 1000) {
      return fail(res, 400, "One or more fields exceed the allowed length.");
    }
    if (deliveryStatus === "FAILED" && failureReason.length < 5) return fail(res, 400, "Provide a reason of at least 5 characters for a failed delivery.");
    if (deliveryStatus === "PARTIALLY_DELIVERED" && partialDeliveryDetails.length < 5) return fail(res, 400, "Describe what was delivered and what remains.");
    if (deliveryStatus === "DELIVERED" && !recipientConfirmation && !body.recipientSignature) return fail(res, 400, "Add a recipient confirmation or signature for a successful delivery.");
    if (deliveryStatus === "DELIVERED" && !recipientName) return fail(res, 400, "Enter the recipient's name for a successful delivery.");

    const arrivalPhotos = validatePhotos(body.arrivalPhotos, "arrival");
    const deliveryPhotos = validatePhotos(body.deliveryPhotos, "delivery");
    if (!arrivalPhotos.length && !deliveryPhotos.length) return fail(res, 400, "Upload at least one arrival or delivery photo as evidence.");
    const recipientSignature = validateSignature(body.recipientSignature);
    const latitude = body.latitude == null || body.latitude === "" ? null : Number(body.latitude);
    const longitude = body.longitude == null || body.longitude === "" ? null : Number(body.longitude);
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return fail(res, 400, "Invalid GPS latitude.");
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return fail(res, 400, "Invalid GPS longitude.");

    const proof = await ProofOfDelivery.create({
      trip: trip._id, driver: req.user._id, customer: trip.customer || null, deliveryStatus,
      arrivalPhotos, deliveryPhotos, recipientName, recipientConfirmation, recipientSignature,
      deliveryTimestamp: new Date(), notes, failureReason, partialDeliveryDetails, latitude, longitude
    });
    const io = req.app.get("io");
    await safeNotify(() => notifyRoles({
      io, roles: ["TRIP_MANAGER", "DISPATCHER", "FLEET_MANAGER", "SUPER_ADMIN"],
      type: deliveryStatus === "DELIVERED" ? "DELIVERY_PROOF_SUBMITTED" : "DELIVERY_ATTENTION_REQUIRED",
      title: deliveryStatus === "DELIVERED" ? "Proof of delivery submitted" : "Delivery needs attention",
      message: `${trip.tripId}: ${deliveryStatus.replaceAll("_", " ").toLowerCase()} delivery evidence submitted.`,
      link: "/trip-manager/proof-of-delivery",
      data: { tripId: String(trip._id), proofId: String(proof._id), deliveryStatus },
      priority: deliveryStatus === "DELIVERED" ? "NORMAL" : "HIGH"
    }));
    res.status(201).json({ success: true, message: "Proof of Delivery submitted successfully.", proof });
  } catch (e) {
    console.error("Submit Proof of Delivery error:", e);
    if (e.code === 11000) return fail(res, 409, "Proof of Delivery has already been submitted for this trip.");
    const invalid = e.name === "ValidationError" || e.name === "CastError" || /photo|signature|latitude|longitude/i.test(String(e.message || ""));
    fail(res, invalid ? 400 : 500, invalid ? e.message : "Unable to submit Proof of Delivery.");
  }
}

async function getCustomerProofs(req, res) {
  try {
    const proofs = await ProofOfDelivery.find({ customer: req.user._id })
      .populate("trip", "tripId pickupLocation destination scheduledStart actualStart actualEnd tripStatus")
      .populate("driver", "fullName")
      .sort({ deliveryTimestamp: -1 }).limit(200).lean();
    res.json({ success: true, proofs });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load delivery history."); }
}

async function getManagerProofs(req, res) {
  try {
    const filter = {};
    if (req.query.status && ["DELIVERED", "PARTIALLY_DELIVERED", "FAILED"].includes(String(req.query.status).toUpperCase())) filter.deliveryStatus = String(req.query.status).toUpperCase();
    const proofs = await ProofOfDelivery.find(filter)
      .populate("trip", "tripId pickupLocation destination scheduledStart tripStatus")
      .populate("driver", "fullName email")
      .populate("customer", "fullName email")
      .sort({ deliveryTimestamp: -1 }).limit(300).lean();
    res.json({ success: true, proofs });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load Proof of Delivery records."); }
}

async function getOneProof(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid Proof of Delivery ID.");
    const proof = await ProofOfDelivery.findById(req.params.id)
      .populate("trip", "tripId pickupLocation destination scheduledStart tripStatus")
      .populate("driver", "fullName email")
      .populate("customer", "fullName email").lean();
    if (!proof) return fail(res, 404, "Proof of Delivery record not found.");
    if (req.user.role === "CUSTOMER" && String(proof.customer?._id || proof.customer || "") !== String(req.user._id)) return fail(res, 403, "You can only view delivery evidence for your own trips.");
    if (req.user.role === "DRIVER" && String(proof.driver?._id || proof.driver || "") !== String(req.user._id)) return fail(res, 403, "You can only view your own delivery evidence.");
    res.json({ success: true, proof });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load delivery evidence."); }
}

module.exports = { getDriverTrips, submitProof, getCustomerProofs, getManagerProofs, getOneProof, MANAGER_ROLES };
