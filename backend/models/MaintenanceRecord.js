const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
  workOrder: { type: mongoose.Schema.Types.ObjectId, ref: "MaintenanceWorkOrder", required: true, index: true },
  maintenanceRequest: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleIssue", default: null },
  serviceType: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  mechanic: { type: String, trim: true, default: "" },
  partsUsed: [{ name: String, quantity: { type: Number, min: 0 }, cost: { type: Number, min: 0 } }],
  laborCost: { type: Number, min: 0, default: 0 },
  partsCost: { type: Number, min: 0, default: 0 },
  otherCost: { type: Number, min: 0, default: 0 },
  totalCost: { type: Number, min: 0, default: 0 },
  odometer: { type: Number, min: 0, default: null },
  startDate: { type: Date, default: null },
  completionDate: { type: Date, default: Date.now },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

module.exports = mongoose.model("MaintenanceRecord", schema);