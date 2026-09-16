const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  fuelNumber: { type: String, required: true, unique: true, index: true, trim: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null, index: true },
  fuelDate: { type: Date, required: true, index: true },
  fuelStation: { type: String, trim: true, default: "" },
  fuelType: { type: String, enum: ["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID", "OTHER"], required: true },
  litres: { type: Number, required: true, min: 0 },
  pricePerLitre: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  odometer: { type: Number, min: 0, default: null },
  paymentMethod: { type: String, enum: ["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "OTHER"], default: "OTHER" },
  receiptNumber: { type: String, trim: true, default: "" },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

schema.pre("validate", function() {
  this.totalAmount = Number(this.litres || 0) * Number(this.pricePerLitre || 0);
});
schema.index({ vehicle: 1, fuelDate: -1 });
schema.index({ fuelDate: -1, vehicle: 1 });
schema.index({ trip: 1, fuelDate: -1 });

module.exports = mongoose.model("FuelExpense", schema);