const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  paymentNumber: { type: String, required: true, unique: true, index: true, trim: true },
  type: { type: String, enum: ["RECEIVED", "PAID"], required: true, index: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  expense: { type: mongoose.Schema.Types.ObjectId, ref: "Expense", default: null, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paymentDate: { type: Date, required: true, index: true },
  paymentMethod: { type: String, enum: ["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "OTHER"], default: "OTHER" },
  referenceNumber: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"], default: "PENDING", index: true },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

schema.index({ paymentDate: -1, type: 1 });
schema.index({ customer: 1, paymentDate: -1 });
schema.index({ invoice: 1, paymentDate: -1 });

module.exports = mongoose.model("Payment", schema);
