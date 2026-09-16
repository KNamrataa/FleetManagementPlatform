const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  expenseNumber: { type: String, required: true, unique: true, index: true, trim: true },
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  category: { type: String, enum: ["FUEL", "TOLL", "DRIVER_ALLOWANCE", "FOOD", "LOADING", "UNLOADING", "PARKING", "WEIGHBRIDGE", "PERMIT", "REPAIR", "TYRE", "OTHER"], required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  amount: { type: Number, required: true, min: 0.01 },
  expenseDate: { type: Date, required: true, index: true },
  vendor: { type: String, trim: true, default: "" },
  paymentMethod: { type: String, enum: ["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "OTHER"], default: "OTHER" },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "PAID"], default: "PENDING", index: true },
  receiptNumber: { type: String, trim: true, default: "" },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ status: 1, expenseDate: -1 });
module.exports = mongoose.model("TripExpense", schema);
