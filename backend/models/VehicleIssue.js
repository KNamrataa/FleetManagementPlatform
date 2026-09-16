const mongoose = require("mongoose");

const ISSUE_TYPES = ["ENGINE", "BRAKE", "TYRE", "ELECTRICAL", "AC", "TRANSMISSION", "OTHER"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const ISSUE_STATUSES = ["OPEN", "IN_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"];

const vehicleIssueSchema = new mongoose.Schema(
  {
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null, index: true },
    issueType: { type: String, enum: ISSUE_TYPES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    description: { type: String, required: true, trim: true, minlength: 5, maxlength: 2000 },
    status: { type: String, enum: ISSUE_STATUSES, default: "OPEN", index: true },
    reportedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolutionNotes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

vehicleIssueSchema.index({ reportedBy: 1, createdAt: -1 });
vehicleIssueSchema.index({ vehicle: 1, createdAt: -1 });

module.exports = mongoose.model("VehicleIssue", vehicleIssueSchema);
module.exports.ISSUE_TYPES = ISSUE_TYPES;
module.exports.SEVERITIES = SEVERITIES;
module.exports.ISSUE_STATUSES = ISSUE_STATUSES;