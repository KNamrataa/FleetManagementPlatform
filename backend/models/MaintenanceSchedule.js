const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
  serviceType: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: "" },
  lastServiceDate: { type: Date, default: null },
  nextServiceDate: { type: Date, default: null },
  lastServiceOdometer: { type: Number, min: 0, default: null },
  nextServiceOdometer: { type: Number, min: 0, default: null },
  serviceIntervalKm: { type: Number, min: 0, default: null },
  serviceIntervalDays: { type: Number, min: 0, default: null },
  status: { type: String, enum: ["SCHEDULED", "DUE_SOON", "OVERDUE", "COMPLETED"], default: "SCHEDULED", index: true },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

module.exports = mongoose.model("MaintenanceSchedule", schema);