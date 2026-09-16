const Notification = require("../models/Notification");
const User = require("../models/User");

async function createNotification({ io, recipient, type, category, title, message, link = "", data = {}, priority = "NORMAL" }) {
  if (!recipient) return null;
  const inferred = category || (String(type).startsWith("TRIP") ? "TRIP" : String(type).startsWith("MAINTENANCE") || String(type).startsWith("VEHICLE") ? "MAINTENANCE" : String(type).startsWith("INVOICE") || String(type).startsWith("PAYMENT") ? "PAYMENT" : String(type).startsWith("FUEL") ? "FUEL" : "SYSTEM");
  const notification = await Notification.create({ recipient, type, category: inferred, title, message, link, data, priority });
  if (io) {
    const payload = notification.toObject();
    io.to(`user:${String(recipient)}`).emit("notification:new", payload);
    const eventByType = {
      TRIP_REQUEST_NEW: "tripRequestCreated",
      TRIP_CREATED: "tripCreated",
      TRIP_SCHEDULED: "tripScheduled",
      TRIP_RESCHEDULED: "tripRescheduled",
      TRIP_CANCELLED: "tripCancelled",
      TRIP_ASSIGNED: "tripAssigned",
      DRIVER_ASSIGNED: "driverAssigned",
      VEHICLE_ASSIGNED: "vehicleAssigned",
      TRIP_STARTED: "tripStarted",
      TRIP_PAUSED: "tripPaused",
      TRIP_RESUMED: "tripResumed",
      TRIP_COMPLETED: "tripCompleted",
      VEHICLE_STATUS_CHANGED: "vehicleStatusChanged",
      DRIVER_STATUS_CHANGED: "driverStatusChanged",
      MAINTENANCE_STATUS_CHANGED: "maintenanceStatusChanged",
    };
    const event = eventByType[String(type)];
    if (event) io.emit(event, payload);
  }
  return notification;
}

async function notifyUsers({ io, recipients = [], type, title, message, link = "", data = {}, priority = "NORMAL" }) {
  const ids = [...new Set(recipients.filter(Boolean).map(String))];
  if (!ids.length) return [];
  return Promise.all(ids.map((recipient) => createNotification({ io, recipient, type, title, message, link, data, priority })));
}

async function notifyRoles({ io, roles = [], type, title, message, link = "", data = {}, priority = "NORMAL" }) {
  const users = await User.find({ role: { $in: roles }, isActive: { $ne: false }, accountStatus: { $ne: "INACTIVE" } }).select("_id").lean();
  return notifyUsers({ io, recipients: users.map((u) => u._id), type, title, message, link, data, priority });
}

async function safeNotify(fn) {
  try { await fn(); } catch (error) { console.error("Notification error:", error.message); }
}

module.exports = { createNotification, notifyUsers, notifyRoles, safeNotify };
