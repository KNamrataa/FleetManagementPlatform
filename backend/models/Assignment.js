const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignmentStatus: { type: String, enum: ["ACTIVE", "UNASSIGNED"], default: "ACTIVE", index: true },
  assignedAt: { type: Date, default: Date.now },
  unassignedAt: { type: Date, default: null },
}, { timestamps: true });

assignmentSchema.index(
  { vehicle: 1, assignmentStatus: 1 },
  { unique: true, partialFilterExpression: { assignmentStatus: "ACTIVE" } }
);
assignmentSchema.index(
  { driver: 1, assignmentStatus: 1 },
  { unique: true, partialFilterExpression: { assignmentStatus: "ACTIVE" } }
);
module.exports = mongoose.model("Assignment", assignmentSchema);
