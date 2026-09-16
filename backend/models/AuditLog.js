const mongoose = require("mongoose");
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  method: { type: String, required: true },
  path: { type: String, required: true, index: true },
  action: { type: String, required: true, index: true },
  resource: { type: String, default: "" },
  recordId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  statusCode: { type: Number, required: true },
  ip: { type: String, default: "" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });
module.exports = mongoose.model("AuditLog", auditLogSchema);
