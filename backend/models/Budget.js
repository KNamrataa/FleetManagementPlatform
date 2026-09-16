const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  budgetName: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, enum: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER", "OPERATIONS", "OFFICE", "OTHER"], required: true, index: true },
  period: { type: String, enum: ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"], required: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  allocatedAmount: { type: Number, required: true, min: 0 },
  spentAmount: { type: Number, min: 0, default: 0 },
  remainingAmount: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["ACTIVE", "EXCEEDED", "COMPLETED", "CANCELLED"], default: "ACTIVE", index: true },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

schema.index({ category: 1, startDate: 1, endDate: 1 });
module.exports = mongoose.model("Budget", schema);