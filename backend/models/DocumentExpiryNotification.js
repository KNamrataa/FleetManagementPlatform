const mongoose = require("mongoose");

const documentExpiryNotificationSchema = new mongoose.Schema({
  notificationKey: { type: String, required: true, unique: true, index: true },
  documentType: { type: String, required: true },
  entityType: { type: String, enum: ["DRIVER_LICENSE", "VEHICLE_DOCUMENT"], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  expiryDate: { type: Date, required: true },
  daysBefore: { type: Number, required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: "Notification", default: null },
  emailSent: { type: Boolean, default: false, index: true },
  emailSentAt: { type: Date, default: null },
  emailError: { type: String, default: "", maxlength: 500 },
  sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

documentExpiryNotificationSchema.index({ entityType: 1, entityId: 1, expiryDate: 1 });
documentExpiryNotificationSchema.index({ emailSent: 1, updatedAt: 1 });

module.exports = mongoose.model("DocumentExpiryNotification", documentExpiryNotificationSchema);
