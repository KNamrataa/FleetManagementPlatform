const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema({
  registrationNumber: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
  vehicleNumber: { type: String, trim: true },
  vehicleType: { type: String, required: true, trim: true },
  make: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  year: { type: Number, min: 1900, max: new Date().getFullYear() + 1, required: true },
  fuelType: { type: String, enum: ["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID"], required: true },
  capacity: { type: Number, min: 0, required: true },
  currentOdometer: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["AVAILABLE", "ASSIGNED", "ON_TRIP", "MAINTENANCE", "INACTIVE"], default: "AVAILABLE", index: true },
  assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  insurance: {
    provider: { type: String, trim: true, default: "" },
    policyNumber: { type: String, trim: true, default: "" },
    expiryDate: { type: Date, default: null },
  },
  registration: {
    rcNumber: { type: String, trim: true, default: "" },
    expiryDate: { type: Date, default: null },
  },
}, { timestamps: true });

vehicleSchema.index({ registrationNumber: 1 }, { unique: true });
module.exports = mongoose.model("Vehicle", vehicleSchema);
