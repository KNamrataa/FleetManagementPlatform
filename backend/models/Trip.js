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
  statusHistory: [{ status: { type: String, enum: ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"] }, changedAt: { type: Date, default: Date.now }, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null } }],
  tripStatus: { type: String, enum: ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"], default: "SCHEDULED", index: true },
  driverAcceptedAt: { type: Date, default: null },
  priority: { type: String, enum: ["LOW", "NORMAL", "HIGH", "URGENT"], default: "NORMAL", index: true },
  notes: { type: String, trim: true, maxlength: 1000, default: "" },
  rescheduleHistory: [{
    oldScheduledStart: { type: Date, default: null },
    oldScheduledEnd: { type: Date, default: null },
    newScheduledStart: { type: Date, required: true },
    newScheduledEnd: { type: Date, default: null },
    oldDriver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    newDriver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    oldVehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
    newVehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    rescheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rescheduledAt: { type: Date, default: Date.now },
  }],
  cancellationReason: { type: String, trim: true, maxlength: 500, default: "" },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignmentSource: { type: String, enum: ["MANUAL", "AI"], default: "MANUAL", index: true },
  aiAssignmentScore: { type: Number, min: 0, max: 100, default: null },
  aiAssignmentReasons: [{ type: String, trim: true }],
  aiAssignmentVersion: { type: String, trim: true, default: "" },
  aiAssignmentComponents: { type: mongoose.Schema.Types.Mixed, default: {} },
  aiEstimatedDistanceKm: { type: Number, min: 0, default: null },
  aiEstimatedDurationMinutes: { type: Number, min: 0, default: null },
  aiEstimatedCost: { type: Number, min: 0, default: null },
  routeOptimization: {
    provider: { type: String, default: "" },
    status: { type: String, enum: ["", "READY", "UNAVAILABLE"], default: "" },
    distanceKm: { type: Number, min: 0, default: null },
    durationMinutes: { type: Number, min: 0, default: null },
    baseDurationMinutes: { type: Number, min: 0, default: null },
    trafficDelayMinutes: { type: Number, min: 0, default: 0 },
    traffic: { type: mongoose.Schema.Types.Mixed, default: {} },
    optimizationScore: { type: Number, min: 0, max: 100, default: null },
    scoreBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    fuelEstimate: { type: mongoose.Schema.Types.Mixed, default: {} },
    reliabilityScore: { type: Number, min: 0, max: 100, default: null },
    calculatedAt: { type: Date, default: null },
    departureTime: { type: Date, default: null },
    geometry: { type: mongoose.Schema.Types.Mixed, default: null },
    geometryPoints: { type: mongoose.Schema.Types.Mixed, default: [] },
    recommendation: { type: mongoose.Schema.Types.Mixed, default: {} },
    explanation: { type: [String], default: [] },
    trafficAnalysis: { type: mongoose.Schema.Types.Mixed, default: {} },
    routingDiagnostics: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  alternativeRoutes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  routePerformance: {
    plannedDistanceKm: { type: Number, min: 0, default: null },
    actualDistanceKm: { type: Number, min: 0, default: null },
    plannedDurationMinutes: { type: Number, min: 0, default: null },
    actualDurationMinutes: { type: Number, min: 0, default: null },
    distanceVarianceKm: { type: Number, default: null },
    durationVarianceMinutes: { type: Number, default: null },
    durationAccuracyPercent: { type: Number, min: 0, max: 100, default: null },
    analyzedAt: { type: Date, default: null },
  },
}, { timestamps: true });

tripSchema.pre("save", function() {
  if (this.isNew) {
    this.statusHistory = [
      {
        status: this.tripStatus,
        changedAt: new Date(),
        changedBy: this._statusChangedBy || null,
      },
    ];
  } else if (this.isModified("tripStatus")) {
    this.statusHistory.push({
      status: this.tripStatus,
      changedAt: new Date(),
      changedBy: this._statusChangedBy || null,
    });
  }
});
tripSchema.index({ customer: 1, tripStatus: 1, scheduledStart: -1 });
tripSchema.index({ driver: 1, tripStatus: 1, scheduledStart: -1 });
tripSchema.index({ vehicle: 1, tripStatus: 1, scheduledStart: -1 });
tripSchema.index({ scheduledStart: -1, createdAt: -1 });

module.exports = mongoose.model("Trip", tripSchema);
