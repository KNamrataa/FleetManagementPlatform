const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema({
  tripId: { type: String, required: true, unique: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  pickupLocation: { type: String, required: true, trim: true },
  destination: { type: String, required: true, trim: true },
  scheduledStart: { type: Date, required: true },
  scheduledEnd: { type: Date, default: null },
  actualStart: { type: Date, default: null },
  actualEnd: { type: Date, default: null },
  distance: { type: Number, min: 0, default: 0 },
  tripStatus: { type: String, enum: ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"], default: "SCHEDULED", index: true },
  notes: { type: String, trim: true, maxlength: 1000, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

module.exports = mongoose.model("Trip", tripSchema);
