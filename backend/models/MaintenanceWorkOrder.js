const mongoose = require("mongoose");

const STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const schema = new mongoose.Schema({
  workOrderNumber: { type: String, required: true, unique: true, index: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
  maintenanceRequest: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleIssue", default: null, index: true },
  maintenanceType: { type: String, required: true, trim: true },
  priority: { type: String, enum: PRIORITIES, default: "MEDIUM" },
  description: { type: String, required: true, trim: true },
  assignedMechanic: { type: String, trim: true, default: "" },
  status: { type: String, enum: STATUSES, default: "PENDING", index: true },
  startDate: { type: Date, default: null },
  expectedCompletionDate: { type: Date, default: null },
  completedDate: { type: Date, default: null },
  odometerAtStart: { type: Number, min: 0, default: null },
  odometerAtCompletion: { type: Number, min: 0, default: null },
  laborCost: { type: Number, min: 0, default: 0 },
  partsCost: { type: Number, min: 0, default: 0 },
  otherCost: { type: Number, min: 0, default: 0 },
  totalCost: { type: Number, min: 0, default: 0 },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  releasedDate: { type: Date, default: null },
}, { timestamps: true });

schema.pre("validate", function() {
  this.totalCost =
    Number(this.laborCost || 0) +
    Number(this.partsCost || 0) +
    Number(this.otherCost || 0);
});

schema.index({ vehicle: 1, status: 1, createdAt: -1 });
schema.index({ expectedCompletionDate: 1, status: 1 });

module.exports = mongoose.model("MaintenanceWorkOrder", schema);
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
