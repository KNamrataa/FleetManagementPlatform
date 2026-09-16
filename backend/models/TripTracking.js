const mongoose = require("mongoose");

const tripTrackingSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null, index: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    source: { type: String, enum: ["DEVICE", "MOBILE_APP"], required: true, default: "MOBILE_APP", index: true },
    currentLocation: { type: String, trim: true, default: "" },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    speed: { type: Number, min: 0, default: 0 },
    accuracy: { type: Number, min: 0, default: null },
    heading: { type: Number, min: 0, max: 360, default: null },
    distanceTravelled: { type: Number, min: 0, default: 0 },
    remainingDistance: { type: Number, min: 0, default: 0 },
    estimatedArrival: { type: Date, default: null },
    recordedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

tripTrackingSchema.index({ trip: 1, recordedAt: -1 });
tripTrackingSchema.index({ vehicle: 1, recordedAt: -1 });
tripTrackingSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 15552000 });

module.exports = mongoose.model("TripTracking", tripTrackingSchema);
