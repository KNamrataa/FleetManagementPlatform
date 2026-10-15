const mongoose = require("mongoose");

const tripRequestSchema = new mongoose.Schema({
  requestNumber: { type: String, required: true, unique: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  pickupLocation: { type: String, required: true, trim: true },
  destination: { type: String, required: true, trim: true },
  requestedDate: { type: Date, required: true, index: true },
  requestedTime: { type: String, trim: true, default: "" },
  estimatedDurationMinutes: { type: Number, min: 0, default: 0 },
  serviceType: { type: String, trim: true, default: "Passenger Transportation" },
  priority: { type: String, enum: ["LOW", "NORMAL", "HIGH", "URGENT"], default: "NORMAL", index: true },
  vehicleType: { type: String, trim: true, default: "" },
  passengerCount: { type: Number, min: 0, default: 0 },
  cargoDetails: { type: String, trim: true, default: "" },
  cargoWeight: { type: Number, min: 0, default: 0 },
  specialInstructions: { type: String, trim: true, maxlength: 2000, default: "" },
  status: {
    type: String,
    enum: ["PENDING", "REVIEWED", "ACCEPTED", "REJECTED", "TRIP_CREATED", "CANCELLED"],
    default: "PENDING",
    index: true,
  },
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null, index: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  acceptedAt: { type: Date, default: null },
  scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  scheduledAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, default: "" },
  assignmentSource: { type: String, enum: ["MANUAL", "AI"], default: "MANUAL", index: true },
  aiAssignment: {
    score: { type: Number, min: 0, max: 100, default: null },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reasons: [{ type: String, trim: true }],
    assignedAt: { type: Date, default: null },
    version: { type: String, trim: true, default: "" },
    components: { type: mongoose.Schema.Types.Mixed, default: {} },
    estimatedDistanceKm: { type: Number, min: 0, default: null },
    estimatedDurationMinutes: { type: Number, min: 0, default: null },
    estimatedCost: { type: Number, min: 0, default: null },
    candidateCount: { type: Number, min: 0, default: 0 },
    routeSource: { type: String, trim: true, default: "" },
  },
}, { timestamps: true });

// Supports newest-first request lists and recent requests on dashboards.
tripRequestSchema.index({ status: 1, createdAt: -1 }); // Pending request queues sorted newest-first
tripRequestSchema.index({ createdAt: -1 });
tripRequestSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model("TripRequest", tripRequestSchema);
