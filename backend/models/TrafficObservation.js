const mongoose = require("mongoose");

const trafficObservationSchema = new mongoose.Schema({
  segmentKey: { type: String, default: null, index: true },
  cellKey: { type: String, required: true, index: true },
  centerLatitude: { type: Number, required: true },
  centerLongitude: { type: Number, required: true },
  dayOfWeek: { type: Number, required: true, min: 0, max: 6, index: true },
  hour: { type: Number, required: true, min: 0, max: 23, index: true },
  quarterHour: { type: Number, required: true, min: 0, max: 3 },
  speedKph: { type: Number, min: 0, default: 0 },
  baselineSpeedKph: { type: Number, min: 1, default: 45 },
  sampleCount: { type: Number, min: 0, default: 0 },
  lastObservedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

trafficObservationSchema.index({ segmentKey: 1, dayOfWeek: 1, hour: 1, quarterHour: 1 }, { unique: true, sparse: true });
trafficObservationSchema.index({ cellKey: 1, dayOfWeek: 1, hour: 1, quarterHour: 1 });
trafficObservationSchema.index({ lastObservedAt: -1 });

module.exports = mongoose.model("TrafficObservation", trafficObservationSchema);
