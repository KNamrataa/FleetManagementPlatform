const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Assignment = require("../models/Assignment");
const { hasActiveTripForVehicle, reservePair, releasePair } = require("../utils/fleetHelpers");
const { safeNotify, notifyRoles } = require("../services/notificationService");

const VEHICLE_STATUSES = ["AVAILABLE", "ASSIGNED", "ON_TRIP", "MAINTENANCE", "INACTIVE"];
const FUEL_TYPES = ["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID"];
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const clean = (v) => v?.trim().toUpperCase();
const DRIVER_OWNED_APPROVAL_STATUSES = ["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED"];
const DRIVER_OWNED_DOCUMENT_TYPES = ["RC", "INSURANCE", "PUC", "PERMIT", "OTHER"];

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

const populateVehicle = (query) => query
  .populate({ path: "assignedDriver", select: "fullName email phone role" })
  .populate({ path: "ownerId", select: "fullName email phone role" });

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
    const lightweightVehicles = vehicles.map((vehicle) => {
      const value = vehicle.toObject ? vehicle.toObject() : vehicle;
      return { ...value, documents: (value.documents || []).map(({ data, ...document }) => document) };
    });
    res.json({ success: true, count: lightweightVehicles.length, vehicles: lightweightVehicles });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load vehicles."); }
}

async function getVehicleDocument(req, res) {
  try {
    if (!validId(req.params.id) || !validId(req.params.documentId)) {
      return fail(res, 400, "Invalid vehicle or document ID.");
    }

    // Fleet Manager/Super Admin document access is intentionally limited to
    // the existing vehicle-management authorization on vehicleRoutes.js.
    const vehicle = await Vehicle.findById(req.params.id).select("documents").lean();
    if (!vehicle) return fail(res, 404, "Vehicle not found.");

    const document = (vehicle.documents || []).find(
      (item) => item._id && item._id.toString() === req.params.documentId
    );
    if (!document) return fail(res, 404, "Vehicle document not found.");
    if (!document.data) return fail(res, 404, "Vehicle document content is unavailable.");

    const dataUrl = String(document.data);
    const match = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(?:;(base64))?,(.*)$/s);
    if (!match) return fail(res, 400, "Stored vehicle document has an invalid format.");

    const mimeType = document.mimeType || match[1] || "application/octet-stream";
    const isBase64 = match[2] === "base64";
    const payload = match[3] || "";
    let buffer;

    try {
      buffer = isBase64
        ? Buffer.from(payload.replace(/\s/g, ""), "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8");
    } catch (decodeError) {
      console.error("Vehicle document decode error:", decodeError);
      return fail(res, 400, "Unable to read the stored vehicle document.");
    }

    if (!buffer.length) return fail(res, 404, "Vehicle document is empty.");

    const safeFileName = String(document.fileName || "vehicle-document")
      .replace(/[\\/\r\n\"<>:|?*]+/g, "_")
      .trim() || "vehicle-document";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${safeFileName}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (e) {
    console.error("Get vehicle document error:", e);
    return fail(res, 500, "Unable to open vehicle document.");
  }
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
    const vehicle = await Vehicle.create({ ...req.body, registrationNumber, vehicleNumber: req.body.vehicleNumber?.trim() || registrationNumber, vehicleType: req.body.vehicleType.trim(), make: req.body.make.trim(), model: req.body.model.trim(), year: Number(req.body.year), fuelType: clean(req.body.fuelType), capacity: Number(req.body.capacity), currentOdometer: Number(req.body.currentOdometer || 0), status: "AVAILABLE", assignedDriver: null, ownershipType: "COMPANY_OWNED", ownerId: null, approvalStatus: "APPROVED", approvalReason: "" });
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
    const merged = { ...vehicle.toObject(), ...req.body };
    const error = validateBody(merged); if (error) return fail(res, 400, error);
    const nextReg = clean(merged.registrationNumber);
    const duplicate = await Vehicle.findOne({ registrationNumber: nextReg, _id: { $ne: vehicle._id } }); if (duplicate) return fail(res, 409, "A vehicle with this registration number already exists.");
    const nextStatus = clean(merged.status);
    if (vehicle.status === "ON_TRIP" && nextStatus !== "ON_TRIP") return fail(res, 409, "An ON_TRIP vehicle cannot be reassigned or changed until its trip is completed.");
    if (vehicle.status === "MAINTENANCE" && nextStatus !== "MAINTENANCE" && req.user.role !== "MAINTENANCE_MANAGER") return fail(res, 409, "A vehicle under maintenance can only be released by the Maintenance Manager.");
    if (nextStatus === "MAINTENANCE" && vehicle.status !== "MAINTENANCE") {
      if (await hasActiveTripForVehicle(vehicle._id)) return fail(res, 409, "An active-trip vehicle cannot be moved into maintenance.");
      if (vehicle.assignedDriver) {
        const oldDriver = vehicle.assignedDriver;
        await DriverProfile.updateOne({ user: oldDriver, assignedVehicle: vehicle._id }, { $set: { assignedVehicle: null, status: "AVAILABLE", availability: true } });
        await Assignment.updateMany({ vehicle: vehicle._id, assignmentStatus: "ACTIVE" }, { $set: { assignmentStatus: "UNASSIGNED", unassignedAt: new Date() } });
        vehicle.assignedDriver = null;
      }
    }
    if (["ON_TRIP"].includes(nextStatus) && !vehicle.assignedDriver) return fail(res, 400, "An ON_TRIP vehicle must have an assigned driver.");
    const previousStatus = vehicle.status;
    Object.assign(vehicle, { registrationNumber: nextReg, vehicleNumber: merged.vehicleNumber?.trim() || vehicle.vehicleNumber || nextReg, vehicleType: merged.vehicleType.trim(), make: merged.make.trim(), model: merged.model.trim(), year: Number(merged.year), fuelType: clean(merged.fuelType), capacity: Number(merged.capacity), currentOdometer: Number(merged.currentOdometer), status: nextStatus });
    await vehicle.save();
    const io = req.app.get("io");
    if (nextStatus === "MAINTENANCE" && previousStatus !== "MAINTENANCE") {
      await safeNotify(() => notifyRoles({
        io,
        roles: ["MAINTENANCE_MANAGER"],
        type: "VEHICLE_SENT_TO_MAINTENANCE",
        title: "Vehicle Sent to Maintenance",
        message: `Vehicle ${vehicle.registrationNumber} has been marked for maintenance. Create a work order to schedule the service.`,
        link: "/maintenance/vehicles",
        data: { vehicleId: vehicle._id, vehicleNumber: vehicle.vehicleNumber, registrationNumber: vehicle.registrationNumber },
        priority: "HIGH",
      }));
    }
    const result = await populateVehicle(Vehicle.findById(vehicle._id));
    res.json({ success: true, message: "Vehicle updated successfully.", vehicle: result });
  } catch (e) { console.error(e); if (e.code === 11000) return fail(res, 409, "A vehicle with this registration number already exists."); fail(res, 500, "Failed to update vehicle."); }
}


async function createOwnerVehicle(req, res) {
  try {
    const profile = await DriverProfile.findOne({ user: req.user._id });
    if (!profile || profile.driverType !== "OWNER_DRIVER") return fail(res, 403, "Only Owner-Drivers can register a driver-owned vehicle.");
    const error = validateBody(req.body);
    if (error) return fail(res, 400, error);
    const registrationNumber = clean(req.body.registrationNumber);
    if (await Vehicle.exists({ registrationNumber })) return fail(res, 409, "A vehicle with this registration number already exists.");

    const vehicle = await Vehicle.create({
      registrationNumber,
      vehicleNumber: req.body.vehicleNumber?.trim() || registrationNumber,
      vehicleType: req.body.vehicleType.trim(),
      make: req.body.make.trim(),
      model: req.body.model.trim(),
      year: Number(req.body.year),
      fuelType: clean(req.body.fuelType),
      capacity: Number(req.body.capacity),
      currentOdometer: Number(req.body.currentOdometer || 0),
      status: "AVAILABLE",
      assignedDriver: null,
      ownershipType: "DRIVER_OWNED",
      ownerId: req.user._id,
      approvalStatus: "PENDING_APPROVAL",
      approvalReason: "",
      insurance: req.body.insurance || {},
      registration: req.body.registration || {},
    });

    const result = await populateVehicle(Vehicle.findById(vehicle._id));
    const io = req.app.get("io");
    await safeNotify(() => notifyRoles({
      io,
      roles: ["FLEET_MANAGER", "SUPER_ADMIN"],
      type: "OWNER_VEHICLE_SUBMITTED",
      title: "Owner-Driver Vehicle Submitted",
      message: `${req.user.fullName || "An Owner-Driver"} registered vehicle ${vehicle.registrationNumber} and it is awaiting approval.`,
      link: "/fleet-manager/vehicles",
      data: { vehicleId: vehicle._id, registrationNumber: vehicle.registrationNumber, ownerId: req.user._id },
      priority: "NORMAL",
    }));
    res.status(201).json({ success: true, message: "Driver-owned vehicle registered and submitted for approval.", vehicle: result });
  } catch (e) {
    console.error("Create owner vehicle error:", e);
    if (e.code === 11000) return fail(res, 409, "A vehicle with this registration number already exists.");
    fail(res, 500, "Failed to register your vehicle.");
  }
}

async function getOwnerVehicle(req, res) {
  try {
    const profile = await DriverProfile.findOne({ user: req.user._id }).select("driverType").lean();
    if (!profile || profile.driverType !== "OWNER_DRIVER") return fail(res, 403, "Only Owner-Drivers can access driver-owned vehicle management.");
    const vehicle = await populateVehicle(Vehicle.findOne({ ownershipType: "DRIVER_OWNED", ownerId: req.user._id }).sort({ createdAt: -1 }));
    if (!vehicle) return res.json({ success: true, vehicle: null, driverType: profile.driverType, message: "You have not registered a driver-owned vehicle." });
    res.json({ success: true, vehicle, driverType: profile.driverType });
  } catch (e) {
    console.error("Get owner vehicle error:", e);
    fail(res, 500, "Unable to load your driver-owned vehicle.");
  }
}

async function updateOwnerVehicle(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid vehicle ID.");
    const profile = await DriverProfile.findOne({ user: req.user._id }).select("driverType").lean();
    if (!profile || profile.driverType !== "OWNER_DRIVER") return fail(res, 403, "Only Owner-Drivers can manage a driver-owned vehicle.");
    const vehicle = await Vehicle.findOne({ _id: req.params.id, ownershipType: "DRIVER_OWNED", ownerId: req.user._id });
    if (!vehicle) return fail(res, 404, "Driver-owned vehicle not found for your account.");
    if (vehicle.status === "ON_TRIP") return fail(res, 409, "An active-trip vehicle cannot be edited until its trip is completed.");

    const merged = { ...vehicle.toObject(), ...req.body };
    const error = validateBody(merged);
    if (error) return fail(res, 400, error);
    const nextReg = clean(merged.registrationNumber);
    const duplicate = await Vehicle.findOne({ registrationNumber: nextReg, _id: { $ne: vehicle._id } });
    if (duplicate) return fail(res, 409, "A vehicle with this registration number already exists.");

    const changedCoreFields = ["registrationNumber", "vehicleNumber", "vehicleType", "make", "model", "year", "fuelType", "capacity", "currentOdometer", "insurance", "registration"].some((key) => req.body[key] !== undefined);
    Object.assign(vehicle, {
      registrationNumber: nextReg,
      vehicleNumber: merged.vehicleNumber?.trim() || vehicle.vehicleNumber || nextReg,
      vehicleType: merged.vehicleType.trim(),
      make: merged.make.trim(),
      model: merged.model.trim(),
      year: Number(merged.year),
      fuelType: clean(merged.fuelType),
      capacity: Number(merged.capacity),
      currentOdometer: Number(merged.currentOdometer),
      insurance: merged.insurance || vehicle.insurance,
      registration: merged.registration || vehicle.registration,
    });
    if (changedCoreFields && vehicle.approvalStatus === "APPROVED") {
      vehicle.approvalStatus = "PENDING_APPROVAL";
      vehicle.approvalReason = "Vehicle details changed and require re-approval.";
    }
    if (vehicle.approvalStatus === "REJECTED") vehicle.approvalReason = "";
    await vehicle.save();
    const result = await populateVehicle(Vehicle.findById(vehicle._id));
    res.json({ success: true, message: changedCoreFields && vehicle.approvalStatus === "PENDING_APPROVAL" ? "Vehicle updated and sent for re-approval." : "Vehicle updated successfully.", vehicle: result });
  } catch (e) {
    console.error("Update owner vehicle error:", e);
    if (e.code === 11000) return fail(res, 409, "A vehicle with this registration number already exists.");
    fail(res, 500, "Failed to update your vehicle.");
  }
}

async function addOwnerVehicleDocument(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid vehicle ID.");
    const profile = await DriverProfile.findOne({ user: req.user._id }).select("driverType").lean();
    if (!profile || profile.driverType !== "OWNER_DRIVER") return fail(res, 403, "Only Owner-Drivers can upload vehicle documents.");
    const vehicle = await Vehicle.findOne({ _id: req.params.id, ownershipType: "DRIVER_OWNED", ownerId: req.user._id });
    if (!vehicle) return fail(res, 404, "Driver-owned vehicle not found for your account.");
    if (vehicle.approvalStatus === "SUSPENDED") return fail(res, 409, "A suspended vehicle cannot be updated until Fleet Manager action is completed.");

    const { documentType, fileName, data, mimeType = "application/octet-stream", expiryDate = null } = req.body || {};
    const type = String(documentType || "").toUpperCase();
    if (!DRIVER_OWNED_DOCUMENT_TYPES.includes(type)) return fail(res, 400, "Invalid vehicle document type.");
    if (!String(fileName || "").trim()) return fail(res, 400, "Document file name is required.");
    if (!String(data || "").startsWith("data:")) return fail(res, 400, "Document content must be provided as a data URL.");
    if (String(data).length > 3_500_000) return fail(res, 400, "Document is too large. Please upload a file smaller than about 2.5 MB.");
    const expiry = expiryDate ? new Date(expiryDate) : null;
    if (expiryDate && Number.isNaN(expiry.getTime())) return fail(res, 400, "Invalid document expiry date.");

    vehicle.documents = (vehicle.documents || []).filter((doc) => doc.documentType !== type);
    vehicle.documents.push({ documentType: type, fileName: String(fileName).trim(), data: String(data), mimeType: String(mimeType), expiryDate: expiry, uploadedAt: new Date() });
    if (vehicle.approvalStatus === "REJECTED") vehicle.approvalStatus = "PENDING_APPROVAL";
    await vehicle.save();
    const result = await populateVehicle(Vehicle.findById(vehicle._id));
    res.status(201).json({ success: true, message: `${type} document uploaded successfully.`, vehicle: result });
  } catch (e) {
    console.error("Add owner vehicle document error:", e);
    fail(res, 500, "Failed to upload vehicle document.");
  }
}

async function submitOwnerVehicleApproval(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid vehicle ID.");
    const profile = await DriverProfile.findOne({ user: req.user._id }).select("driverType").lean();
    if (!profile || profile.driverType !== "OWNER_DRIVER") return fail(res, 403, "Only Owner-Drivers can submit a driver-owned vehicle.");
    const vehicle = await Vehicle.findOne({ _id: req.params.id, ownershipType: "DRIVER_OWNED", ownerId: req.user._id });
    if (!vehicle) return fail(res, 404, "Driver-owned vehicle not found for your account.");
    if (vehicle.approvalStatus === "APPROVED") return fail(res, 409, "This vehicle is already approved.");
    if (vehicle.approvalStatus === "SUSPENDED") return fail(res, 409, "A suspended vehicle cannot be submitted for approval.");
    const documentTypes = new Set((vehicle.documents || []).map((doc) => doc.documentType));
    if (!documentTypes.has("RC") || !documentTypes.has("INSURANCE")) return fail(res, 400, "Upload both RC and Insurance documents before submitting the vehicle for approval.");
    vehicle.approvalStatus = "PENDING_APPROVAL";
    vehicle.approvalReason = "";
    await vehicle.save();
    const result = await populateVehicle(Vehicle.findById(vehicle._id));
    const io = req.app.get("io");
    await safeNotify(() => notifyRoles({ io, roles: ["FLEET_MANAGER", "SUPER_ADMIN"], type: "OWNER_VEHICLE_APPROVAL_REQUESTED", title: "Vehicle Approval Requested", message: `${req.user.fullName || "An Owner-Driver"} submitted ${vehicle.registrationNumber} for approval.`, link: "/fleet-manager/vehicles", data: { vehicleId: vehicle._id, ownerId: req.user._id }, priority: "NORMAL" }));
    res.json({ success: true, message: "Vehicle submitted for Fleet Manager approval.", vehicle: result });
  } catch (e) {
    console.error("Submit owner vehicle approval error:", e);
    fail(res, 500, "Failed to submit vehicle for approval.");
  }
}

async function updateVehicleApproval(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid vehicle ID.");
    const nextStatus = String(req.body?.approvalStatus || "").toUpperCase();
    if (!DRIVER_OWNED_APPROVAL_STATUSES.includes(nextStatus)) return fail(res, 400, "Invalid vehicle approval status.");
    if (!["FLEET_MANAGER", "SUPER_ADMIN"].includes(req.user.role)) return fail(res, 403, "You are not authorized to review vehicle approvals.");
    const vehicle = await Vehicle.findOne({ _id: req.params.id, ownershipType: "DRIVER_OWNED" });
    if (!vehicle) return fail(res, 404, "Driver-owned vehicle not found.");
    if (!vehicle.ownerId) return fail(res, 409, "This driver-owned vehicle has no owner.");
    const owner = await User.findOne({ _id: vehicle.ownerId, role: "DRIVER", isActive: true, accountStatus: "ACTIVE" }).lean();
    const ownerProfile = owner ? await DriverProfile.findOne({ user: owner._id }).select("driverType").lean() : null;
    if (!owner || !ownerProfile || ownerProfile.driverType !== "OWNER_DRIVER") return fail(res, 409, "The vehicle owner is not a valid Owner-Driver.");
    const reason = String(req.body?.approvalReason || "").trim();
    if ((nextStatus === "REJECTED" || nextStatus === "SUSPENDED") && !reason) return fail(res, 400, "A reason is required when rejecting or suspending a vehicle.");

    vehicle.approvalStatus = nextStatus;
    vehicle.approvalReason = reason;
    if (nextStatus === "APPROVED") {
      if (vehicle.status === "INACTIVE") vehicle.status = "AVAILABLE";
      if (vehicle.status !== "MAINTENANCE" && vehicle.status !== "ON_TRIP") vehicle.status = "AVAILABLE";
      vehicle.approvalReason = "";
    }
    if (nextStatus === "SUSPENDED" && !["ON_TRIP", "MAINTENANCE"].includes(vehicle.status)) vehicle.status = "INACTIVE";
    await vehicle.save();
    const result = await populateVehicle(Vehicle.findById(vehicle._id));
    const io = req.app.get("io");
    const messages = {
      APPROVED: `Your vehicle ${vehicle.registrationNumber} has been approved and is available for trips.`,
      REJECTED: `Your vehicle ${vehicle.registrationNumber} was rejected${reason ? `: ${reason}` : "."}`,
      SUSPENDED: `Your vehicle ${vehicle.registrationNumber} has been suspended${reason ? `: ${reason}` : "."}`,
      PENDING_APPROVAL: `Your vehicle ${vehicle.registrationNumber} is awaiting Fleet Manager approval.`,
    };
    await safeNotify(() => notifyUsers({ io, recipients: [vehicle.ownerId], type: `OWNER_VEHICLE_${nextStatus}`, title: `Vehicle ${nextStatus.replaceAll("_", " ")}`, message: messages[nextStatus], link: "/driver/vehicle", data: { vehicleId: vehicle._id, approvalStatus: nextStatus, reason } }));
    res.json({ success: true, message: `Vehicle approval status updated to ${nextStatus.replaceAll("_", " ")}.`, vehicle: result });
  } catch (e) {
    console.error("Update vehicle approval error:", e);
    fail(res, 500, "Failed to update vehicle approval status.");
  }
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

module.exports = { getVehicles, getVehicle, getVehicleDocument, createVehicle, updateVehicle, deleteVehicle, createOwnerVehicle, getOwnerVehicle, updateOwnerVehicle, addOwnerVehicleDocument, submitOwnerVehicleApproval, updateVehicleApproval };