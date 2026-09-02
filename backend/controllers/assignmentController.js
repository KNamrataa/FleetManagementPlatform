const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const { reservePair, releasePair, hasActiveTripForVehicle, hasActiveTripForDriver, syncAssignmentRecords } = require("../utils/fleetHelpers");
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function getAssignments(req, res) {
  try {
    const assignments = await syncAssignmentRecords();
    res.json({ success: true, count: assignments.length, assignments });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load assignments."); }
}

async function getAssignment(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid assignment ID.");
    const assignment = await Assignment.findById(req.params.id).populate("vehicle", "registrationNumber vehicleType make model status").populate("driver", "fullName email phone").populate("assignedBy", "fullName email");
    if (!assignment) return fail(res, 404, "Assignment not found.");
    res.json({ success: true, assignment });
  } catch (e) { console.error(e); fail(res, 500, "Unable to load assignment."); }
}

async function createAssignment(req, res) {
  try {
    const { vehicleId, driverId } = req.body;
    if (!validId(vehicleId) || !validId(driverId)) return fail(res, 400, "Valid vehicle and driver IDs are required.");
    if (await hasActiveTripForVehicle(vehicleId) || await hasActiveTripForDriver(driverId)) return fail(res, 409, "Vehicle or driver is already on an active trip.");
    const { vehicle, driver } = await reservePair(vehicleId, driverId);
    const assignment = await Assignment.create({ vehicle: vehicle._id, driver: driver.user, assignedBy: req.user._id, assignmentStatus: "ACTIVE" });
    const result = await Assignment.findById(assignment._id).populate("vehicle", "registrationNumber vehicleType make model status").populate("driver", "fullName email phone");
    res.status(201).json({ success: true, message: "Driver assigned to vehicle successfully.", assignment: result });
  } catch (e) { console.error(e); fail(res, e.status || 500, e.message || "Failed to create assignment."); }
}

async function deleteAssignment(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid assignment ID.");
    const assignment = await Assignment.findById(req.params.id); if (!assignment) return fail(res, 404, "Assignment not found.");
    if (await hasActiveTripForVehicle(assignment.vehicle) || await hasActiveTripForDriver(assignment.driver)) return fail(res, 409, "An active-trip assignment cannot be removed.");
    await releasePair(assignment.vehicle, assignment.driver);
    assignment.assignmentStatus = "UNASSIGNED"; assignment.unassignedAt = new Date(); await assignment.save();
    res.json({ success: true, message: "Assignment removed successfully." });
  } catch (e) { console.error(e); fail(res, 500, "Failed to remove assignment."); }
}
module.exports = { getAssignments, getAssignment, createAssignment, deleteAssignment };
