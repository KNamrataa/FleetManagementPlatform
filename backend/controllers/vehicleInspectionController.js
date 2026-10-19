const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");
const VehicleInspection = require("../models/VehicleInspection");
const VehicleIssue = require("../models/VehicleIssue");
const Trip = require("../models/Trip");
const DriverProfile = require("../models/DriverProfile");
const { notifyRoles, notifyUsers, safeNotify } = require("../services/notificationService");

const CHECKLIST = [
  { item: "Tyres and wheels", critical: true },
  { item: "Brakes", critical: true },
  { item: "Lights and indicators", critical: false },
  { item: "Mirrors and visibility", critical: false },
  { item: "Seat belts", critical: true },
  { item: "Steering and suspension", critical: true },
  { item: "Engine and fluid leaks", critical: false },
  { item: "Horn and dashboard warnings", critical: false },
  { item: "Safety equipment", critical: false },
  { item: "Body condition and load security", critical: false },
];
const validId = id => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const activeIssueStatuses = ["OPEN", "IN_REVIEW", "IN_PROGRESS"];

function normalizePhoto(photo) {
  if (typeof photo !== "string" || !photo.startsWith("data:image/")) throw new Error("Inspection photos must be valid image data.");
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photo)) throw new Error("Only JPG, PNG and WEBP inspection photos are allowed.");
  if (photo.length > 950_000) throw new Error("Each inspection photo must be smaller than approximately 700 KB after compression.");
  return photo;
}

async function getChecklist(req, res) {
  try {
    const profile = await DriverProfile.findOne({ user: req.user._id }).populate("assignedVehicle", "_id registrationNumber vehicleType currentOdometer status safetyHold safetyHoldReason").lean();
    let vehicle = profile?.assignedVehicle || null;
    if (!vehicle) vehicle = await Vehicle.findOne({ ownershipType: "DRIVER_OWNED", ownerId: req.user._id }).select("_id registrationNumber vehicleType currentOdometer status safetyHold safetyHoldReason").lean();
    res.json({ success: true, checklist: CHECKLIST.map(({ item }) => ({ item })), vehicle, checklistVersion: 1 });
  } catch (e) { console.error("DVI checklist error:", e); fail(res, 500, "Unable to load inspection checklist."); }
}

async function submitInspection(req, res) {
  try {
    const { vehicleId, tripId, inspectionType, odometerReading, checklist, generalNotes = "" } = req.body || {};
    if (!validId(vehicleId)) return fail(res, 400, "Select a valid vehicle.");
    const type = String(inspectionType || "").toUpperCase();
    if (!["PRE_TRIP", "POST_TRIP"].includes(type)) return fail(res, 400, "Inspection type must be Before Trip or After Trip.");
    const reading = Number(odometerReading);
    if (!Number.isFinite(reading) || reading < 0) return fail(res, 400, "Enter a valid non-negative odometer reading.");
    if (!Array.isArray(checklist) || checklist.length !== CHECKLIST.length) return fail(res, 400, "Complete every required checklist item before submitting.");
    if (String(generalNotes).length > 3000) return fail(res, 400, "General notes are too long.");

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return fail(res, 404, "Vehicle not found.");
    const profile = await DriverProfile.findOne({ user: req.user._id }).select("assignedVehicle driverType").lean();
    const ownsVehicle = vehicle.ownershipType === "DRIVER_OWNED" && String(vehicle.ownerId || "") === String(req.user._id);
    const assignedVehicle = String(profile?.assignedVehicle || "") === String(vehicle._id) || String(vehicle.assignedDriver || "") === String(req.user._id);
    if (!ownsVehicle && !assignedVehicle) return fail(res, 403, "You can only inspect your assigned or registered vehicle.");

    let trip = null;
    if (tripId) {
      if (!validId(tripId)) return fail(res, 400, "Invalid trip reference.");
      trip = await Trip.findOne({ _id: tripId, driver: req.user._id }).select("_id vehicle tripStatus").lean();
      if (!trip) return fail(res, 403, "The selected trip does not belong to you.");
      if (trip.vehicle && String(trip.vehicle) !== String(vehicle._id)) return fail(res, 400, "The selected trip is not assigned to this vehicle.");
    }

    const previousReading = Number(vehicle.currentOdometer || 0);
    if (reading < previousReading) return fail(res, 400, `Odometer reading cannot be below the latest accepted reading (${previousReading} km).`);
    const photoCount = checklist.reduce((sum, row) => sum + (Array.isArray(row.photos) ? row.photos.length : 0), 0);
    if (photoCount > 3) return fail(res, 400, "Attach no more than 3 photographs per inspection.");
    const byName = new Map(checklist.map(row => [String(row.item || "").trim(), row]));
    const allowedStatuses = ["PASS", "FAIL", "NOT_APPLICABLE"];
    const normalized = [];
    const defects = [];
    for (const spec of CHECKLIST) {
      const row = byName.get(spec.item);
      if (!row || !allowedStatuses.includes(String(row.status || "").toUpperCase())) return fail(res, 400, `Please complete checklist item: ${spec.item}.`);
      const status = String(row.status).toUpperCase();
      const notes = String(row.notes || "").trim();
      if (notes.length > 1000) return fail(res, 400, `Notes for ${spec.item} are too long.`);
      const photos = (Array.isArray(row.photos) ? row.photos : []).map(normalizePhoto);
      let severity = String(row.severity || "LOW").toUpperCase();
      if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) severity = "LOW";
      if (status === "FAIL") {
        if (notes.length < 5) return fail(res, 400, `Add a description of at least 5 characters for ${spec.item}.`);
        if (spec.critical) severity = "CRITICAL";
        normalized.push({ item: spec.item, status, severity, notes, photos });
        defects.push({ checklistItem: spec.item, severity, description: notes, photos });
      } else {
        normalized.push({ item: spec.item, status, severity: "LOW", notes, photos });
      }
    }

    const critical = defects.some(d => d.severity === "CRITICAL");
    const inspection = await VehicleInspection.create({
      vehicle: vehicle._id, driver: req.user._id, trip: trip?._id || null, inspectionType: type,
      odometerReading: reading, checklist: normalized,
      defects: defects.map(d => ({ checklistItem: d.checklistItem, severity: d.severity, description: d.description })),
      overallStatus: critical ? "SAFETY_HOLD" : defects.length ? "DEFECTS_FOUND" : "PASSED",
      generalNotes: String(generalNotes).trim(),
    });

    // Save the latest accepted odometer without overwriting a newer concurrent reading.
    const odometerUpdate = await Vehicle.updateOne({ _id: vehicle._id, $or: [{ currentOdometer: { $lte: reading } }, { currentOdometer: { $exists: false } }] }, { $max: { currentOdometer: reading } });
    if (odometerUpdate.matchedCount === 0) {
      await VehicleInspection.deleteOne({ _id: inspection._id });
      return fail(res, 409, "The vehicle odometer changed while this inspection was being submitted. Refresh and try again.");
    }

    if (critical) {
      await Vehicle.updateOne({ _id: vehicle._id }, { $set: { safetyHold: true, safetyHoldReason: "Critical defect reported during digital vehicle inspection; maintenance review required.", safetyHoldAt: new Date() } });
    }
    const issueIds = [];
    for (const defect of defects) {
      const issueType = /brake/i.test(defect.checklistItem) ? "BRAKE" : /tyre|wheel/i.test(defect.checklistItem) ? "TYRE" : /light|mirror|horn|dashboard|electrical/i.test(defect.checklistItem) ? "ELECTRICAL" : /engine|fluid/i.test(defect.checklistItem) ? "ENGINE" : "OTHER";
      const issue = await VehicleIssue.create({ vehicle: vehicle._id, reportedBy: req.user._id, trip: trip?._id || null, issueType, severity: defect.severity, description: `[Digital inspection ${inspection._id}] ${defect.checklistItem}: ${defect.description}` });
      issueIds.push(issue._id);
      const savedDefect = inspection.defects.find(d => d.checklistItem === defect.checklistItem);
      if (savedDefect) savedDefect.issue = issue._id;
    }
    if (issueIds.length) await inspection.save();

    if (critical) {
      const criticalIssue = await VehicleIssue.findOne({ _id: { $in: issueIds }, severity: "CRITICAL" }).select("_id description").lean();
      await Vehicle.updateOne({ _id: vehicle._id }, { $set: { safetyHold: true, safetyHoldReason: criticalIssue?.description || "Critical defect reported during digital vehicle inspection.", safetyHoldIssue: criticalIssue?._id || issueIds[0], safetyHoldAt: new Date() } });
    }

    const io = req.app.get("io");
    if (defects.length) {
      await safeNotify(() => notifyRoles({ io, roles: ["MAINTENANCE_MANAGER", "FLEET_MANAGER", "SUPER_ADMIN"], type: critical ? "VEHICLE_SAFETY_HOLD" : "VEHICLE_INSPECTION_DEFECT", title: critical ? "Critical vehicle safety defect" : "Vehicle inspection defect reported", message: `${vehicle.registrationNumber}: ${defects.length} defect(s) reported during ${type === "PRE_TRIP" ? "pre-trip" : "post-trip"} inspection.${critical ? " Vehicle placed on safety hold." : ""}`, link: "/maintenance/inspections", data: { inspectionId: String(inspection._id), vehicleId: String(vehicle._id), issueIds: issueIds.map(String) }, priority: critical ? "URGENT" : "HIGH" }));
    }
    res.status(201).json({ success: true, message: critical ? "Inspection submitted. A critical defect was reported and the vehicle is on safety hold." : defects.length ? "Inspection submitted and maintenance issues were created." : "Inspection submitted successfully.", inspection: inspection.toObject(), safetyHold: critical || vehicle.safetyHold });
  } catch (e) {
    console.error("Submit vehicle inspection error:", e);
    const invalid = e.name === "ValidationError" || e.name === "CastError" || /photo|image|validation|duplicate/i.test(String(e.message || ""));
    fail(res, invalid ? 400 : 500, invalid ? e.message : "Unable to submit vehicle inspection.");
  }
}

async function getDriverInspections(req, res) {
  try {
    const rows = await VehicleInspection.find({ driver: req.user._id }).populate("vehicle", "registrationNumber vehicleType").populate("trip", "tripId tripStatus").sort({ submittedAt: -1 }).limit(100).lean();
    res.json({ success: true, inspections: rows });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load inspection history."); }
}

async function getMaintenanceInspections(req, res) {
  try {
    const filter = {};
    if (req.query.status && ["PASSED", "DEFECTS_FOUND", "SAFETY_HOLD"].includes(String(req.query.status).toUpperCase())) filter.overallStatus = String(req.query.status).toUpperCase();
    const rows = await VehicleInspection.find(filter).populate("vehicle", "registrationNumber vehicleType status safetyHold safetyHoldReason").populate("driver", "fullName email").populate("trip", "tripId tripStatus").populate("defects.issue", "issueType severity status description").populate("releasedBy", "fullName").sort({ submittedAt: -1 }).limit(250).lean();
    res.json({ success: true, inspections: rows });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load vehicle inspections."); }
}

async function releaseSafetyHold(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid inspection ID.");
    const inspection = await VehicleInspection.findById(req.params.id);
    if (!inspection) return fail(res, 404, "Inspection not found.");
    if (inspection.overallStatus !== "SAFETY_HOLD") return fail(res, 409, "This inspection did not place the vehicle on safety hold.");
    const linkedIssueIds = inspection.defects.map(d => d.issue).filter(Boolean);
    if (!linkedIssueIds.length) return fail(res, 409, "No linked maintenance issues were found; review the issue records before release.");
    const unresolvedLinked = await VehicleIssue.exists({ _id: { $in: linkedIssueIds }, status: { $nin: ["RESOLVED", "CLOSED"] } });
    if (unresolvedLinked) return fail(res, 409, "Resolve all defects linked to this inspection before releasing the vehicle.");
    const blockingIssue = await VehicleIssue.exists({ vehicle: inspection.vehicle, severity: { $in: ["HIGH", "CRITICAL"] }, status: { $in: activeIssueStatuses } });
    if (blockingIssue) return fail(res, 409, "Another unresolved high-priority or critical issue still blocks vehicle release.");
    const vehicle = await Vehicle.findById(inspection.vehicle);
    if (!vehicle) return fail(res, 404, "Vehicle not found.");
    // Preserve the vehicle's assignment when releasing a safety hold. The maintenance
    // workflow may change status to MAINTENANCE, but the assignment references remain
    // the source of truth for whether the vehicle was assigned before the hold.
    const assignedProfile = await DriverProfile.findOne({ assignedVehicle: vehicle._id }).select("_id assignedVehicle").lean();
    const hasExistingAssignment = Boolean(vehicle.assignedDriver || assignedProfile);
    if (vehicle.status === "MAINTENANCE") {
      vehicle.status = hasExistingAssignment ? "ASSIGNED" : "AVAILABLE";
    }
    vehicle.safetyHold = false; vehicle.safetyHoldReason = ""; vehicle.safetyHoldIssue = null; vehicle.safetyHoldAt = null;
    await vehicle.save();
    inspection.releasedBy = req.user._id; inspection.releasedAt = new Date(); await inspection.save();
    await safeNotify(() => notifyUsers({ io: req.app.get("io"), recipients: [inspection.driver], type: "VEHICLE_SAFETY_HOLD_RELEASED", title: "Vehicle safety hold released", message: `The safety hold for ${vehicle.registrationNumber} has been cleared after maintenance review.`, link: "/driver/inspections", data: { inspectionId: String(inspection._id), vehicleId: String(vehicle._id) }, priority: "NORMAL" }));
    res.json({ success: true, message: "Safety hold released. The vehicle must still satisfy normal status and assignment rules.", inspection, vehicle });
  } catch (e) { console.error(e); fail(res, 500, "Unable to release vehicle safety hold."); }
}

module.exports = { getChecklist, submitInspection, getDriverInspections, getMaintenanceInspections, releaseSafetyHold };
