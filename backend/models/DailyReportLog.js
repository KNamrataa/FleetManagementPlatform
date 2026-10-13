const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  reportType: { type: String, required: true, index: true },
  reportDate: { type: String, required: true, index: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  recipientEmail: { type: String, required: true },
  status: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING", index: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, default: null },
  errorMessage: { type: String, default: "" },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ reportType: 1, reportDate: 1, recipient: 1 }, { unique: true });
module.exports = mongoose.model("DailyReportLog", schema);
