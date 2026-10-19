const mongoose = require("mongoose");

const evidencePhotoSchema = new mongoose.Schema({
  data: { type: String, required: true, maxlength: 1200000 },
  caption: { type: String, trim: true, maxlength: 250, default: "" },
  uploadedAt: { type: Date, default: Date.now },
  latitude: { type: Number, min: -90, max: 90, default: null },
  longitude: { type: Number, min: -180, max: 180, default: null },
}, { _id: true });

const proofOfDeliverySchema = new mongoose.Schema({
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, unique: true, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  deliveryStatus: { type: String, enum: ["DELIVERED", "PARTIALLY_DELIVERED", "FAILED"], required: true, index: true },
  arrivalPhotos: { type: [evidencePhotoSchema], default: [] },
  deliveryPhotos: { type: [evidencePhotoSchema], default: [] },
  recipientName: { type: String, trim: true, maxlength: 160, default: "" },
  recipientConfirmation: { type: String, trim: true, maxlength: 1000, default: "" },
  recipientSignature: { type: String, maxlength: 1200000, default: "" },
  deliveryTimestamp: { type: Date, default: Date.now, index: true },
  notes: { type: String, trim: true, maxlength: 3000, default: "" },
  failureReason: { type: String, trim: true, maxlength: 1500, default: "" },
  partialDeliveryDetails: { type: String, trim: true, maxlength: 1500, default: "" },
  latitude: { type: Number, min: -90, max: 90, default: null },
  longitude: { type: Number, min: -180, max: 180, default: null },
}, { timestamps: true });

proofOfDeliverySchema.index({ customer: 1, deliveryTimestamp: -1 });
proofOfDeliverySchema.index({ driver: 1, deliveryTimestamp: -1 });
module.exports = mongoose.model("ProofOfDelivery", proofOfDeliverySchema);
