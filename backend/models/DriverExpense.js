const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  expenseNumber: { type: String, required: true, unique: true, index: true, trim: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null, index: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null, index: true },
  category: { type: String, enum: ["DRIVER_ALLOWANCE", "TRAVEL", "FOOD", "LODGING", "ADVANCE", "SALARY", "REIMBURSEMENT", "OTHER"], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  expenseDate: { type: Date, required: true, index: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  advanceAmount: { type: Number, min: 0, default: 0 },
  settledAmount: { type: Number, min: 0, default: 0 },
  remainingAmount: { type: Number, min: 0, default: 0 },
  paymentMethod: { type: String, enum: ["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "OTHER"], default: "OTHER" },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "PAID", "SETTLED"], default: "PENDING", index: true },
  receiptNumber: { type: String, trim: true, default: "" },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
}, { timestamps: true });

schema.pre("validate", function() {
  this.remainingAmount = Math.max(0, Number(this.advanceAmount || 0) - Number(this.settledAmount || 0));
});
schema.index({ driver: 1, expenseDate: -1 });
module.exports = mongoose.model("DriverExpense", schema);
