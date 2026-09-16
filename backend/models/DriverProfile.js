const mongoose = require("mongoose");

const driverProfileSchema = new mongoose.Schema({
  driverType: { type: String, enum: ["COMPANY_DRIVER", "OWNER_DRIVER"], default: "COMPANY_DRIVER", index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  licenseNumber: { type: String, trim: true, required: true, unique: true, index: true },
  licenseExpiry: { type: Date, required: true },
  experience: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["AVAILABLE", "ASSIGNED", "ON_TRIP", "OFF_DUTY", "INACTIVE"], default: "AVAILABLE", index: true },
  assignedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null, index: true },
  availability: { type: Boolean, default: true },
}, { timestamps: true });

driverProfileSchema.index({ user: 1, status: 1, availability: 1 });
driverProfileSchema.index({ assignedVehicle: 1, status: 1 });

module.exports = mongoose.model("DriverProfile", driverProfileSchema);
