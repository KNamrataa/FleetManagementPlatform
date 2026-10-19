const mongoose = require("mongoose");

const checklistItemSchema = new mongoose.Schema({
  item: { type: String, required: true, trim: true, maxlength: 100 },
  status: { type: String, enum: ["PASS", "FAIL", "NOT_APPLICABLE"], required: true },
  severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "LOW" },
  notes: { type: String, trim: true, default: "", maxlength: 1000 },
  photos: [{ type: String, maxlength: 1800000 }],
}, { _id: true });

const defectSchema = new mongoose.Schema({
  checklistItem: { type: String, required: true },
  severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
  description: { type: String, required: true, maxlength: 2000 },
  issue: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleIssue", default: null },
}, { _id: true });

const vehicleInspectionSchema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null, index: true },
  inspectionType: { type: String, enum: ["PRE_TRIP", "POST_TRIP"], required: true, index: true },
  odometerReading: { type: Number, required: true, min: 0 },
  checklist: { type: [checklistItemSchema], validate: v => Array.isArray(v) && v.length > 0 },
  defects: [defectSchema],
  overallStatus: { type: String, enum: ["PASSED", "DEFECTS_FOUND", "SAFETY_HOLD"], default: "PASSED", index: true },
  generalNotes: { type: String, trim: true, default: "", maxlength: 3000 },
  submittedAt: { type: Date, default: Date.now, index: true },
  releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  releasedAt: { type: Date, default: null },
}, { timestamps: true });

vehicleInspectionSchema.index({ vehicle: 1, submittedAt: -1 });
vehicleInspectionSchema.index({ driver: 1, submittedAt: -1 });
module.exports = mongoose.model("VehicleInspection", vehicleInspectionSchema);
