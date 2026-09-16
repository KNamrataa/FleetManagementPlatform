const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const Trip = require("../models/Trip");
const VehicleIssue = require("../models/VehicleIssue");
const MaintenanceWorkOrder = require("../models/MaintenanceWorkOrder");
const MaintenanceRecord = require("../models/MaintenanceRecord");
const MaintenanceSchedule = require("../models/MaintenanceSchedule");
const Assignment = require("../models/Assignment");
const { safeNotify, notifyRoles } = require("../services/notificationService");

const validId = id => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const escape = s => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function scheduleStatus(schedule, vehicle) {
  if (schedule.status === "COMPLETED") return "COMPLETED";
  const now = new Date();
  const dateDue = schedule.nextServiceDate && new Date(schedule.nextServiceDate) <= now;
  const kmDue = schedule.nextServiceOdometer != null && Number(vehicle.currentOdometer || 0) >= Number(schedule.nextServiceOdometer);
  if (dateDue || kmDue) return "OVERDUE";
  const dateSoon = schedule.nextServiceDate && (new Date(schedule.nextServiceDate) - now) <= 7 * 86400000;
  const kmSoon = schedule.nextServiceOdometer != null && Number(schedule.nextServiceOdometer) - Number(vehicle.currentOdometer || 0) <= 500;
  if (dateSoon || kmSoon) return "DUE_SOON";
  return "SCHEDULED";
}

async function dashboard(req, res) {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [vehicles, openIssues, highIssues, activeOrders, completedOrders, costs, schedules, recentRequests, recentOrders] = await Promise.all([
      Vehicle.countDocuments(),
      VehicleIssue.countDocuments({ status: { $in: ["OPEN", "IN_REVIEW", "IN_PROGRESS"] } }),
      VehicleIssue.countDocuments({ severity: { $in: ["HIGH", "CRITICAL"] }, status: { $nin: ["RESOLVED", "CLOSED"] } }),
      MaintenanceWorkOrder.countDocuments({ status: { $in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } }),
      MaintenanceWorkOrder.countDocuments({ status: "COMPLETED" }),
      MaintenanceRecord.aggregate([{ $match: { completionDate: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: "$totalCost" } } }]),
      MaintenanceSchedule.find({ status: { $ne: "COMPLETED" } }).populate("vehicle", "vehicleNumber registrationNumber currentOdometer").lean(),
      VehicleIssue.find().populate("vehicle", "vehicleNumber registrationNumber").populate("reportedBy", "fullName").sort({ createdAt: -1 }).limit(6).lean(),
      MaintenanceWorkOrder.find().populate("vehicle", "vehicleNumber registrationNumber").sort({ createdAt: -1 }).limit(6).lean(),
    ]);
    const dueSchedules = schedules.map(s => ({ ...s, calculatedStatus: scheduleStatus(s, s.vehicle) })).filter(s => ["DUE_SOON", "OVERDUE"].includes(s.calculatedStatus));
    res.json({ success: true, kpis: {
      totalVehicles: vehicles,
      vehiclesUnderMaintenance: await Vehicle.countDocuments({ status: "MAINTENANCE" }),
      openRequests: openIssues,
      highPriorityRequests: highIssues,
      activeWorkOrders: activeOrders,
      completedWorkOrders: completedOrders,
      vehiclesDueForService: dueSchedules.length,
      totalMaintenanceCost: costs[0]?.total || 0,
    }, recentRequests, activeWorkOrders: recentOrders.filter(x => x.status !== "COMPLETED" && x.status !== "CANCELLED"), upcomingServices: dueSchedules.slice(0, 6) });
  } catch (e) { console.error("Maintenance dashboard error:", e); fail(res, 500, "Unable to load maintenance dashboard."); }
}

async function requests(req, res) {
  try {
    const { status, severity, issueType, vehicleId, search } = req.query;
    const filter = {};
    if (status) filter.status = String(status).toUpperCase();
    if (severity) filter.severity = String(severity).toUpperCase();
    if (issueType) filter.issueType = String(issueType).toUpperCase();
    if (validId(vehicleId)) filter.vehicle = vehicleId;
    const issues = await VehicleIssue.find(filter)
      .populate("vehicle", "vehicleNumber registrationNumber vehicleType make model status currentOdometer")
      .populate("reportedBy", "fullName email phone")
      .populate("trip", "tripId tripStatus pickupLocation destination")
      .populate("resolvedBy", "fullName")
      .sort({ createdAt: -1 }).lean();
    const q = String(search || "").trim().toLowerCase();
    const result = q ? issues.filter(i => [i.vehicle?.vehicleNumber, i.vehicle?.registrationNumber, i.reportedBy?.fullName, i.issueType, i.description, i.status].some(v => String(v || "").toLowerCase().includes(q))) : issues;
    res.json({ success: true, count: result.length, issues: result });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load maintenance requests."); }
}

async function getRequest(req, res) {
  if (!validId(req.params.id)) return fail(res, 400, "Invalid maintenance request ID.");
  const issue = await VehicleIssue.findById(req.params.id).populate("vehicle", "vehicleNumber registrationNumber vehicleType make model status currentOdometer").populate("reportedBy", "fullName email phone").populate("trip", "tripId tripStatus pickupLocation destination").populate("resolvedBy", "fullName email").lean();
  if (!issue) return fail(res, 404, "Maintenance request not found.");
  res.json({ success: true, issue });
}

async function updateRequestStatus(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid maintenance request ID.");
    const status = String(req.body?.status || "").toUpperCase();
    const resolutionNotes = String(req.body?.resolutionNotes || "");
    const allowed = { OPEN: ["IN_REVIEW"], IN_REVIEW: ["IN_PROGRESS", "OPEN"], IN_PROGRESS: ["RESOLVED"], RESOLVED: ["CLOSED"], CLOSED: [] };
    const issue = await VehicleIssue.findById(req.params.id);
    if (!issue) return fail(res, 404, "Maintenance request not found.");
    if (!allowed[issue.status]?.includes(status)) return fail(res, 409, `Cannot change issue from ${issue.status} to ${status}.`);
    issue.status = status;
    if (resolutionNotes.trim()) issue.resolutionNotes = resolutionNotes.trim();
    if (status === "RESOLVED" || status === "CLOSED") { issue.resolvedAt = new Date(); issue.resolvedBy = req.user._id; }
    await issue.save();
    res.json({ success: true, message: "Maintenance request updated.", issue });
  } catch (e) { console.error(e); fail(res, 500, "Failed to update maintenance request."); }
}

async function createWorkOrder(req, res) {
  try {
    const {
      maintenanceRequest,
      vehicle,
      maintenanceType = "Repair",
      priority = "MEDIUM",
      description = "",
      assignedMechanic = "",
      expectedCompletionDate,
      odometerAtStart,
      notes = "",
    } = req.body || {};

    if (!validId(vehicle)) {
      return fail(res, 400, "Please select a valid vehicle.");
    }

    const normalizedPriority = String(priority || "MEDIUM").toUpperCase();
    const allowedPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    if (!allowedPriorities.includes(normalizedPriority)) {
      return fail(res, 400, "Invalid work order priority.");
    }

    const normalizedType = String(maintenanceType || "Repair").trim();
    const normalizedDescription = String(description || "").trim();
    if (!normalizedType) return fail(res, 400, "Maintenance type is required.");
    if (normalizedDescription.length < 5) return fail(res, 400, "Work order description must be at least 5 characters.");

    const targetVehicle = await Vehicle.findById(vehicle);
    if (!targetVehicle) return fail(res, 404, "Vehicle not found.");
    if (maintenanceRequest) {
      if (!validId(maintenanceRequest)) {
        return fail(res, 400, "Invalid maintenance request ID.");
      }

      const issue = await VehicleIssue.findById(maintenanceRequest);
      if (!issue) return fail(res, 404, "Maintenance request not found.");
      if (String(issue.vehicle) !== String(vehicle)) {
        return fail(res, 400, "Maintenance request does not belong to the selected vehicle.");
      }
      if (["RESOLVED", "CLOSED"].includes(issue.status)) {
        return fail(res, 409, "A resolved or closed maintenance request cannot receive a new work order.");
      }

      const existing = await MaintenanceWorkOrder.findOne({
        maintenanceRequest,
        status: { $nin: ["COMPLETED", "CANCELLED"] },
      }).lean();
      if (existing) {
        return fail(res, 409, `An active work order (${existing.workOrderNumber}) already exists for this request.`);
      }
    }
    const year = new Date().getFullYear();
    let workOrderNumber;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const latest = await MaintenanceWorkOrder.findOne({
        workOrderNumber: new RegExp(`^WO-${year}-\\d{4}$`),
      }).sort({ workOrderNumber: -1 }).select("workOrderNumber").lean();
      const latestNumber = latest ? Number(String(latest.workOrderNumber).split("-").pop()) : 0;
      workOrderNumber = `WO-${year}-${String(latestNumber + 1 + attempt).padStart(4, "0")}`;
      if (!(await MaintenanceWorkOrder.exists({ workOrderNumber }))) break;
      workOrderNumber = null;
    }
    if (!workOrderNumber) return fail(res, 500, "Could not generate a unique work order number. Please try again.");

    let startOdometer = targetVehicle.currentOdometer;
    if (odometerAtStart !== undefined && odometerAtStart !== "") {
      startOdometer = Number(odometerAtStart);
      if (!Number.isFinite(startOdometer) || startOdometer < Number(targetVehicle.currentOdometer || 0)) {
        return fail(res, 400, "Starting odometer cannot be lower than the vehicle's current odometer.");
      }
    }

    const order = await MaintenanceWorkOrder.create({
      workOrderNumber,
      vehicle: targetVehicle._id,
      maintenanceRequest: maintenanceRequest || null,
      maintenanceType: normalizedType,
      priority: normalizedPriority,
      description: normalizedDescription,
      assignedMechanic: String(assignedMechanic || "").trim(),
      expectedCompletionDate: expectedCompletionDate || null,
      odometerAtStart: startOdometer,
      notes: String(notes || "").trim(),
      createdBy: req.user._id,
      status: "PENDING",
    });

    if (maintenanceRequest) {
      await VehicleIssue.findByIdAndUpdate(maintenanceRequest, {
        status: "IN_PROGRESS",
      });
    }

    const result = await MaintenanceWorkOrder.findById(order._id)
      .populate("vehicle", "vehicleNumber registrationNumber vehicleType make model status currentOdometer")
      .populate("maintenanceRequest", "issueType severity description status")
      .populate("createdBy", "fullName email")
      .lean();
    const io = req.app.get("io");
    await safeNotify(() => notifyRoles({
      io,
      roles: ["FLEET_MANAGER", "SUPER_ADMIN"],
      type: "MAINTENANCE_WORK_ORDER_CREATED",
      title: "Maintenance Work Order Created",
      message: `Work order ${workOrderNumber} was created for vehicle ${targetVehicle.registrationNumber}.`,
      link: "/maintenance/work-orders",
      data: { workOrderId: order._id, workOrderNumber, vehicleId: targetVehicle._id },
    }));

    return res.status(201).json({
      success: true,
      message: `Work order ${workOrderNumber} created successfully.`,
      workOrder: result,
    });
  } catch (error) {
    console.error("Create maintenance work order error:", error);

    if (error?.code === 11000) {
      return fail(res, 409, "A work order was created at the same time. Please click Create Work Order again.");
    }

    if (error?.name === "ValidationError") {
      const details = Object.values(error.errors || {})
        .map(item => item.message)
        .filter(Boolean)
        .join(" ");
      return fail(res, 400, details || "The work order contains invalid data.");
    }

    return fail(res, 500, error?.message || "Failed to create work order.");
  }
}
async function workOrders(req, res) {
  try {
    const orders = await MaintenanceWorkOrder.find().populate("vehicle", "vehicleNumber registrationNumber vehicleType make model status currentOdometer").populate("maintenanceRequest", "issueType severity description status").populate("createdBy", "fullName").populate("completedBy", "fullName").populate("releasedBy", "fullName").sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: orders.length, workOrders: orders });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load work orders."); }
}

async function getWorkOrder(req, res) {
  if (!validId(req.params.id)) return fail(res, 400, "Invalid work order ID.");
  const order = await MaintenanceWorkOrder.findById(req.params.id).populate("vehicle", "vehicleNumber registrationNumber vehicleType make model status currentOdometer").populate("maintenanceRequest").populate("createdBy", "fullName email").populate("completedBy", "fullName email").populate("releasedBy", "fullName email").lean();
  if (!order) return fail(res, 404, "Work order not found.");
  res.json({ success: true, workOrder: order });
}

async function updateWorkOrder(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid work order ID.");
    const order = await MaintenanceWorkOrder.findById(req.params.id);
    if (!order) return fail(res, 404, "Work order not found.");
    if (["COMPLETED", "CANCELLED"].includes(order.status)) return fail(res, 409, "Completed or cancelled work orders cannot be edited.");
    const fields = ["maintenanceType", "priority", "description", "assignedMechanic", "expectedCompletionDate", "notes"];
    fields.forEach(k => { if (req.body[k] !== undefined) order[k] = typeof req.body[k] === "string" ? req.body[k].trim() : req.body[k]; });
    if (req.body.laborCost !== undefined) order.laborCost = Math.max(0, Number(req.body.laborCost) || 0);
    if (req.body.partsCost !== undefined) order.partsCost = Math.max(0, Number(req.body.partsCost) || 0);
    if (req.body.otherCost !== undefined) order.otherCost = Math.max(0, Number(req.body.otherCost) || 0);
    if (req.body.status) order.status = req.body.status;
    await order.save();
    res.json({ success: true, message: "Work order updated.", workOrder: order });
  } catch (e) { console.error(e); fail(res, 500, "Failed to update work order."); }
}

async function startWorkOrder(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid work order ID.");
    const order = await MaintenanceWorkOrder.findById(req.params.id);
    if (!order) return fail(res, 404, "Work order not found.");
    if (!["PENDING", "ASSIGNED", "ON_HOLD"].includes(order.status)) return fail(res, 409, "This work order cannot be started from its current status.");
    const vehicle = await Vehicle.findById(order.vehicle);
    if (!vehicle) return fail(res, 404, "Vehicle not found.");
    if (await Trip.exists({ vehicle: vehicle._id, tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] } })) {
      return fail(res, 409, "Vehicle has an active trip and cannot enter maintenance.");
    }

    const anotherActiveOrder = await MaintenanceWorkOrder.findOne({
      vehicle: vehicle._id,
      _id: { $ne: order._id },
      status: { $in: ["IN_PROGRESS"] },
    }).lean();
    if (anotherActiveOrder) {
      return fail(res, 409, `Vehicle already has an active work order (${anotherActiveOrder.workOrderNumber}).`);
    }

    vehicle.status = "MAINTENANCE";
    if (vehicle.assignedDriver) {
      const assignedDriver = vehicle.assignedDriver;
      await DriverProfile.updateOne({ user: assignedDriver, assignedVehicle: vehicle._id }, { $set: { assignedVehicle: null, status: "AVAILABLE", availability: true } });
      await Assignment.updateMany({ vehicle: vehicle._id, assignmentStatus: "ACTIVE" }, { $set: { assignmentStatus: "UNASSIGNED", unassignedAt: new Date() } });
      vehicle.assignedDriver = null;
    }
    await vehicle.save();
    order.status = "IN_PROGRESS";
    order.startDate = new Date();
    order.odometerAtStart = order.odometerAtStart ?? vehicle.currentOdometer;
    await order.save();
    await Assignment.updateMany({ vehicle: vehicle._id, assignmentStatus: "ACTIVE" }, { $set: { assignmentStatus: "UNASSIGNED", unassignedAt: new Date() } });
    const io = req.app.get("io");
    await safeNotify(() => notifyRoles({
      io,
      roles: ["FLEET_MANAGER", "SUPER_ADMIN"],
      type: "MAINTENANCE_STARTED",
      title: "Maintenance Started",
      message: `Work order ${order.workOrderNumber} has started for vehicle ${vehicle.registrationNumber}.`,
      link: "/fleet-manager/vehicles",
      data: { workOrderId: order._id, workOrderNumber: order.workOrderNumber, vehicleId: vehicle._id },
    }));
    res.json({ success: true, message: "Work started and vehicle moved to maintenance.", workOrder: await MaintenanceWorkOrder.findById(order._id).populate("vehicle", "vehicleNumber registrationNumber status currentOdometer").lean() });
  } catch (e) { console.error(e); fail(res, 500, "Failed to start work order."); }
}

async function completeWorkOrder(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid work order ID.");
    const order = await MaintenanceWorkOrder.findById(req.params.id);
    if (!order) return fail(res, 404, "Work order not found.");
    if (order.status !== "IN_PROGRESS") return fail(res, 409, "Only an in-progress work order can be completed.");
    const vehicle = await Vehicle.findById(order.vehicle);
    if (!vehicle) return fail(res, 404, "Vehicle not found.");
    const { laborCost = order.laborCost, partsCost = order.partsCost, otherCost = order.otherCost, finalOdometer, notes = order.notes } = req.body;
    if (vehicle.status !== "MAINTENANCE") {
      return fail(res, 409, "This vehicle is no longer marked for maintenance. Refresh the work order before completing it.");
    }

    if (await Trip.exists({ vehicle: vehicle._id, tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] } })) {
      return fail(res, 409, "Vehicle has an active trip and the maintenance job cannot be completed yet.");
    }

    const finalKm = finalOdometer == null ? vehicle.currentOdometer : Number(finalOdometer);
    if (!Number.isFinite(finalKm) || finalKm < Number(vehicle.currentOdometer || 0)) {
      return fail(res, 400, "Final odometer must be valid and cannot be lower than the current odometer.");
    }
    order.laborCost = Math.max(0, Number(laborCost) || 0); order.partsCost = Math.max(0, Number(partsCost) || 0); order.otherCost = Math.max(0, Number(otherCost) || 0); order.totalCost = order.laborCost + order.partsCost + order.otherCost; order.odometerAtCompletion = finalKm; order.completedDate = new Date(); order.completedBy = req.user._id; order.notes = String(notes || "").trim(); order.status = "COMPLETED";
    await order.save();
    vehicle.currentOdometer = finalKm;
    vehicle.status = "MAINTENANCE";
    await vehicle.save();
    if (order.maintenanceRequest) await VehicleIssue.findByIdAndUpdate(order.maintenanceRequest, { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: req.user._id });
    await MaintenanceRecord.create({ vehicle: vehicle._id, workOrder: order._id, maintenanceRequest: order.maintenanceRequest, serviceType: order.maintenanceType, description: order.description, mechanic: order.assignedMechanic, laborCost: order.laborCost, partsCost: order.partsCost, otherCost: order.otherCost, totalCost: order.totalCost, odometer: finalKm, startDate: order.startDate, completionDate: order.completedDate, notes: order.notes, createdBy: req.user._id });
    const io = req.app.get("io");
    await safeNotify(() => notifyRoles({
      io,
      roles: ["FLEET_MANAGER", "SUPER_ADMIN"],
      type: "MAINTENANCE_COMPLETED",
      title: "Maintenance Completed",
      message: `Work order ${order.workOrderNumber} is complete. Vehicle ${vehicle.registrationNumber} is ready to be released.`,
      link: "/maintenance/work-orders",
      data: { workOrderId: order._id, workOrderNumber: order.workOrderNumber, vehicleId: vehicle._id },
    }));
    res.json({ success: true, message: "Maintenance completed. Release the vehicle when it is ready for service.", workOrder: await MaintenanceWorkOrder.findById(order._id).populate("vehicle", "vehicleNumber registrationNumber status currentOdometer").lean() });
  } catch (e) { console.error(e); fail(res, 500, "Failed to complete work order."); }
}

async function releaseWorkOrder(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid work order ID.");
    const order = await MaintenanceWorkOrder.findById(req.params.id);
    if (!order) return fail(res, 404, "Work order not found.");
    if (order.status !== "COMPLETED") return fail(res, 409, "Only a completed work order can release a vehicle.");
    if (order.releasedDate) return fail(res, 409, "This vehicle has already been released.");

    const vehicle = await Vehicle.findById(order.vehicle);
    if (!vehicle) return fail(res, 404, "Vehicle not found.");
    if (vehicle.status !== "MAINTENANCE") return fail(res, 409, "Vehicle is not currently under maintenance.");
    if (await Trip.exists({ vehicle: vehicle._id, tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] } })) {
      return fail(res, 409, "Vehicle has an active trip and cannot be released.");
    }

    vehicle.status = "AVAILABLE";
    vehicle.assignedDriver = null;
    await vehicle.save();
    order.releasedBy = req.user._id;
    order.releasedDate = new Date();
    await order.save();

    const io = req.app.get("io");
    await safeNotify(() => notifyRoles({
      io,
      roles: ["FLEET_MANAGER", "SUPER_ADMIN"],
      type: "VEHICLE_RELEASED_FROM_MAINTENANCE",
      title: "Vehicle Released",
      message: `Vehicle ${vehicle.registrationNumber} has been released from maintenance and is available for assignment.`,
      link: "/fleet-manager/vehicles",
      data: { vehicleId: vehicle._id, workOrderId: order._id, workOrderNumber: order.workOrderNumber },
    }));

    res.json({
      success: true,
      message: "Vehicle released from maintenance and is now available.",
      workOrder: await MaintenanceWorkOrder.findById(order._id)
        .populate("vehicle", "vehicleNumber registrationNumber status currentOdometer")
        .populate("releasedBy", "fullName email")
        .lean(),
    });
  } catch (e) {
    console.error("Release maintenance vehicle error:", e);
    fail(res, 500, "Failed to release vehicle from maintenance.");
  }
}

async function vehicles(req, res) {
  try {
    const list = await Vehicle.find().populate("assignedDriver", "fullName email").sort({ createdAt: -1 }).lean();
    const vehicleIds = list.map(v => v._id);
    const [issues, orders, records, schedules] = await Promise.all([
      VehicleIssue.aggregate([{ $match: { vehicle: { $in: vehicleIds }, status: { $nin: ["RESOLVED", "CLOSED"] } } }, { $group: { _id: "$vehicle", count: { $sum: 1 } } }]),
      MaintenanceWorkOrder.aggregate([{ $match: { vehicle: { $in: vehicleIds }, status: { $in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } } }, { $group: { _id: "$vehicle", count: { $sum: 1 } } }]),
      MaintenanceRecord.aggregate([{ $match: { vehicle: { $in: vehicleIds } } }, { $sort: { completionDate: -1 } }, { $group: { _id: "$vehicle", lastServiceDate: { $first: "$completionDate" }, totalCost: { $sum: "$totalCost" } } }]),
      MaintenanceSchedule.find({ vehicle: { $in: vehicleIds }, status: { $ne: "COMPLETED" } }).sort({ nextServiceDate: 1 }).lean(),
    ]);
    const countMap = arr => Object.fromEntries(arr.map(x => [String(x._id), x]));
    const im = countMap(issues), om = countMap(orders), rm = countMap(records);
    const sm = {}; schedules.forEach(s => { const id = String(s.vehicle); if (!sm[id]) sm[id] = s; });
    const result = list.map(v => ({ ...v, openIssues: im[String(v._id)]?.count || 0, activeWorkOrders: om[String(v._id)]?.count || 0, lastServiceDate: rm[String(v._id)]?.lastServiceDate || null, totalMaintenanceCost: rm[String(v._id)]?.totalCost || 0, nextService: sm[String(v._id)] || null }));
    res.json({ success: true, count: result.length, vehicles: result });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load maintenance vehicles."); }
}

async function schedules(req, res) {
  try {
    const rows = await MaintenanceSchedule.find().populate("vehicle", "vehicleNumber registrationNumber currentOdometer status").sort({ nextServiceDate: 1 }).lean();
    res.json({ success: true, schedules: rows.map(s => ({ ...s, calculatedStatus: scheduleStatus(s, s.vehicle) })) });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load service schedules."); }
}

async function createSchedule(req, res) {
  try {
    const { vehicle, serviceType, description = "", lastServiceDate, nextServiceDate, lastServiceOdometer, nextServiceOdometer, serviceIntervalKm, serviceIntervalDays, notes = "" } = req.body;
    if (!validId(vehicle) || !serviceType?.trim()) return fail(res, 400, "Vehicle and service type are required.");
    const v = await Vehicle.findById(vehicle); if (!v) return fail(res, 404, "Vehicle not found.");
    const schedule = await MaintenanceSchedule.create({ vehicle, serviceType: serviceType.trim(), description: description.trim(), lastServiceDate: lastServiceDate || null, nextServiceDate: nextServiceDate || null, lastServiceOdometer: lastServiceOdometer == null ? null : Number(lastServiceOdometer), nextServiceOdometer: nextServiceOdometer == null ? null : Number(nextServiceOdometer), serviceIntervalKm: serviceIntervalKm == null ? null : Number(serviceIntervalKm), serviceIntervalDays: serviceIntervalDays == null ? null : Number(serviceIntervalDays), notes: notes.trim(), createdBy: req.user._id });
    res.status(201).json({ success: true, schedule: { ...schedule.toObject(), calculatedStatus: scheduleStatus(schedule.toObject(), v) } });
  } catch (e) { console.error(e); fail(res, 500, "Failed to create service schedule."); }
}

async function updateSchedule(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid schedule ID.");
    const schedule = await MaintenanceSchedule.findById(req.params.id); if (!schedule) return fail(res, 404, "Schedule not found.");
    ["serviceType", "description", "lastServiceDate", "nextServiceDate", "lastServiceOdometer", "nextServiceOdometer", "serviceIntervalKm", "serviceIntervalDays", "notes", "status"].forEach(k => { if (req.body[k] !== undefined) schedule[k] = req.body[k]; });
    await schedule.save(); const v = await Vehicle.findById(schedule.vehicle).lean();
    res.json({ success: true, schedule: { ...schedule.toObject(), calculatedStatus: scheduleStatus(schedule.toObject(), v) } });
  } catch (e) { console.error(e); fail(res, 500, "Failed to update service schedule."); }
}

async function deleteSchedule(req, res) {
  if (!validId(req.params.id)) return fail(res, 400, "Invalid schedule ID.");
  const result = await MaintenanceSchedule.findByIdAndDelete(req.params.id); if (!result) return fail(res, 404, "Schedule not found.");
  res.json({ success: true, message: "Schedule deleted." });
}

async function history(req, res) {
  try {
    const filter = {};
    if (validId(req.query.vehicleId)) filter.vehicle = req.query.vehicleId;
    const rows = await MaintenanceRecord.find(filter).populate("vehicle", "vehicleNumber registrationNumber").populate("workOrder", "workOrderNumber status").sort({ completionDate: -1 }).lean();
    res.json({ success: true, records: rows });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load maintenance history."); }
}

async function costs(req, res) {
  try {
    const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); const yearStart = new Date(now.getFullYear(), 0, 1);
    const [all, month, year, byVehicle] = await Promise.all([
      MaintenanceRecord.aggregate([{ $group: { _id: null, labor: { $sum: "$laborCost" }, parts: { $sum: "$partsCost" }, other: { $sum: "$otherCost" }, total: { $sum: "$totalCost" }, count: { $sum: 1 } } }]),
      MaintenanceRecord.aggregate([{ $match: { completionDate: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: "$totalCost" } } }]),
      MaintenanceRecord.aggregate([{ $match: { completionDate: { $gte: yearStart } } }, { $group: { _id: null, total: { $sum: "$totalCost" } } }]),
      MaintenanceRecord.aggregate([{ $group: { _id: "$vehicle", total: { $sum: "$totalCost" }, count: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 10 }]),
    ]);
    const vehicles = await Vehicle.find({ _id: { $in: byVehicle.map(x => x._id) } }).select("vehicleNumber registrationNumber").lean(); const vm = Object.fromEntries(vehicles.map(v => [String(v._id), v]));
    res.json({ success: true, totals: { ...(all[0] || { labor: 0, parts: 0, other: 0, total: 0, count: 0 }), currentMonth: month[0]?.total || 0, currentYear: year[0]?.total || 0 }, byVehicle: byVehicle.map(x => ({ ...x, vehicle: vm[String(x._id)] || null })) });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load maintenance costs."); }
}

async function profile(req, res) {
  const user = await User.findById(req.user._id).select("fullName email phone role isActive accountStatus createdAt updatedAt lastLoginAt").lean();
  if (!user) return fail(res, 404, "Profile not found."); res.json({ success: true, user });
}

async function updateProfile(req, res) {
  if (Object.keys(req.body).some(k => !["fullName", "phone"].includes(k))) return fail(res, 400, "Only full name and phone can be updated.");
  const user = await User.findById(req.user._id); if (!user) return fail(res, 404, "Profile not found.");
  if (req.body.fullName !== undefined) { if (String(req.body.fullName).trim().length < 2) return fail(res, 400, "Full name must be at least 2 characters."); user.fullName = String(req.body.fullName).trim(); }
  if (req.body.phone !== undefined) user.phone = String(req.body.phone).trim() || null;
  await user.save(); res.json({ success: true, message: "Profile updated.", user: await User.findById(user._id).select("fullName email phone role isActive accountStatus createdAt updatedAt lastLoginAt").lean() });
}

module.exports = { dashboard, requests, getRequest, updateRequestStatus, createWorkOrder, workOrders, getWorkOrder, updateWorkOrder, startWorkOrder, completeWorkOrder, releaseWorkOrder, vehicles, schedules, createSchedule, updateSchedule, deleteSchedule, history, costs, profile, updateProfile };