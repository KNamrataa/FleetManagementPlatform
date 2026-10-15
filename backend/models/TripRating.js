const mongoose = require("mongoose");

const tripRatingSchema = new mongoose.Schema({
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  driverRating: { type: Number, required: true, min: 1, max: 5 },
  serviceRating: { type: Number, required: true, min: 1, max: 5 },
  driverDetails: {
    safety: { type: Number, min: 1, max: 5, default: null },
    professionalism: { type: Number, min: 1, max: 5, default: null },
    communication: { type: Number, min: 1, max: 5, default: null },
    punctuality: { type: Number, min: 1, max: 5, default: null },
  },
  serviceDetails: {
    pickup: { type: Number, min: 1, max: 5, default: null },
    tripExperience: { type: Number, min: 1, max: 5, default: null },
    punctuality: { type: Number, min: 1, max: 5, default: null },
    vehicleCondition: { type: Number, min: 1, max: 5, default: null },
  },
  positiveTags: { type: [String], default: [] },
  issueTags: { type: [String], default: [] },
  comment: { type: String, trim: true, maxlength: 1000, default: "" },
  otherIssue: { type: String, trim: true, maxlength: 500, default: "" },
  recommendation: { type: String, enum: ["Definitely", "Probably", "Not sure", "Probably not", "Definitely not", ""], default: "" },
}, { timestamps: true });
tripRatingSchema.index({ trip: 1, customer: 1 }, { unique: true });
tripRatingSchema.index({ createdAt: -1 }); // Date-window analytics across all drivers
tripRatingSchema.index({ driver: 1, createdAt: -1 });
tripRatingSchema.index({ driverRating: 1, createdAt: -1 });
tripRatingSchema.index({ serviceRating: 1, createdAt: -1 });
tripRatingSchema.index({ recommendation: 1, createdAt: -1 });
module.exports = mongoose.model("TripRating", tripRatingSchema);
