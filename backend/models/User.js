const mongoose = require("mongoose");

const ROLES = [
  "SUPER_ADMIN",
  "FLEET_MANAGER",
  "TRIP_MANAGER",
  "DISPATCHER",
  "DRIVER",
  "MAINTENANCE_MANAGER",
  "FINANCE_MANAGER",
  "VIEWER",
  "CUSTOMER",
];

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ROLES,
      default: "CUSTOMER",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    accountStatus: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    loginFailedAttempts: { type: Number, default: 0, min: 0 },
    loginLockedUntil: { type: Date, default: null, index: true },
    resetPasswordTokenHash: {
      type: String,
      default: null,
      select: false,
      index: true,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
      select: false,
    },
    accessVersion: { type: Number, default: 0 },
    forcePasswordChange: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
