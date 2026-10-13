const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Vehicle = require("../models/Vehicle");
const Notification = require("../models/Notification");
const DocumentExpiryNotification = require("../models/DocumentExpiryNotification");
const { notifyUsers, safeNotify } = require("../services/notificationService");
const { sendNotificationEmail } = require("../services/notificationEmailService");

const REMINDER_WINDOW_DAYS = 30;
const EXPIRED_GRACE_DAYS = -1;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_TIME_ZONE = process.env.EXPIRY_TIME_ZONE || "Asia/Kolkata";

const dateParts = (date, timeZone = EXPIRY_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
};

const dateKey = (date, timeZone = EXPIRY_TIME_ZONE) => {
  const { year, month, day } = dateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const dateLabel = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: EXPIRY_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

const dayNumber = (date, timeZone = EXPIRY_TIME_ZONE) => {
  const { year, month, day } = dateParts(date, timeZone);
  return Date.UTC(year, month - 1, day);
};

const daysUntil = (expiryDate, today = new Date()) =>
  Math.round((dayNumber(expiryDate) - dayNumber(today)) / DAY_MS);

const getExpiryMilestone = (remaining) => {
  if (remaining >= 0 && remaining <= REMINDER_WINDOW_DAYS) return String(remaining);
  if (remaining === EXPIRED_GRACE_DAYS) return "EXPIRED";
  return null;
};

const priorityForRemaining = (remaining) => {
  if (remaining < 0 || remaining <= 3) return "URGENT";
  if (remaining <= 7) return "HIGH";
  return "NORMAL";
};

const isDuplicateKeyError = (error) => Number(error?.code) === 11000;

async function retryPendingEmail(record) {
  if (!record?.notificationId || record.emailSent) return false;

  const [notification, user] = await Promise.all([
    Notification.findById(record.notificationId).lean(),
    User.findById(record.recipient).select("fullName email").lean(),
  ]);

  if (!notification || !user?.email) return false;

  try {
    await sendNotificationEmail({
      email: user.email,
      fullName: user.fullName,
      title: notification.title,
      message: notification.message,
      category: notification.category,
      priority: notification.priority,
      link: notification.link,
    });

    await DocumentExpiryNotification.updateOne(
      { _id: record._id },
      { $set: { emailSent: true, emailSentAt: new Date(), emailError: "" } }
    );
    return true;
  } catch (error) {
    await DocumentExpiryNotification.updateOne(
      { _id: record._id },
      { $set: { emailSent: false, emailError: String(error?.message || "Unable to send email.").slice(0, 500) } }
    );
    console.error("Document expiry email retry error:", error?.message || error);
    return false;
  }
}

async function sendOnce({
  notificationKey,
  entityType,
  entityId,
  documentId = null,
  documentType,
  expiryDate,
  daysBefore,
  recipients,
  type,
  title,
  message,
  link,
  data,
  priority,
  io,
  force = false,
}) {
  const uniqueRecipients = [...new Set((recipients || []).filter(Boolean).map(String))];
  if (!uniqueRecipients.length) return 0;

  let sent = 0;

  for (const recipient of uniqueRecipients) {
    const key = `${notificationKey}:${recipient}`;

    try {
      if (force) {
        await DocumentExpiryNotification.deleteOne({ notificationKey: key });
      }

      const existing = await DocumentExpiryNotification.findOne({ notificationKey: key });
      if (existing) {
        if (!existing.emailSent) await retryPendingEmail(existing);
        continue;
      }
      let reservation;
      try {
        reservation = await DocumentExpiryNotification.create({
          notificationKey: key,
          entityType,
          entityId,
          documentId,
          documentType,
          expiryDate,
          daysBefore,
          recipient,
          emailSent: false,
          emailSentAt: null,
          emailError: "",
          notificationId: null,
        });
      } catch (reservationError) {
        if (isDuplicateKeyError(reservationError)) continue;
        throw reservationError;
      }

      try {
        const results = await notifyUsers({
          io,
          recipients: [recipient],
          type,
          title,
          message,
          link,
          data,
          priority,
          awaitEmail: true,
        });

        const result = results?.[0];
        const notification = result?.notification;
        if (!notification?._id) {
          throw new Error("Expiry notification could not be created.");
        }

        await DocumentExpiryNotification.updateOne(
          { _id: reservation._id },
          {
            $set: {
              notificationId: notification._id,
              emailSent: Boolean(result.emailSent),
              emailSentAt: result.emailSent ? new Date() : null,
              emailError: result.emailError || "",
            },
          }
        );

        sent += 1;
      } catch (notificationError) {
        await DocumentExpiryNotification.deleteOne({ _id: reservation._id });
        throw notificationError;
      }
    } catch (error) {
      console.error("Document expiry notification error:", error?.message || error);
    }
  }

  return sent;
}

async function notifyDriverLicenseExpiry({ io, driverId, force = false }) {
  if (!driverId) return 0;

  const [profile, fleetManagers] = await Promise.all([
    DriverProfile.findOne({ user: driverId })
      .populate({ path: "user", select: "_id fullName isActive accountStatus role email" })
      .lean(),
    User.find({
      role: "FLEET_MANAGER",
      isActive: true,
      accountStatus: "ACTIVE",
    }).select("_id").lean(),
  ]);

  if (!profile?.user?._id || !profile.licenseExpiry) return 0;

  const remaining = daysUntil(profile.licenseExpiry);
  const milestone = getExpiryMilestone(remaining);
  if (!milestone) return 0;

  const driverUser = profile.user;
  const recipients = fleetManagers.map((user) => user._id);

  if (driverUser.isActive && driverUser.accountStatus === "ACTIVE") {
    recipients.push(driverUser._id);
  }

  const isExpired = milestone === "EXPIRED";
  const driverName = driverUser.fullName || "Driver";
  const title = isExpired
    ? "Driving License Expired"
    : remaining === 0
      ? "Driving License Expires Today"
      : `Driving License Expires in ${remaining} Day${remaining === 1 ? "" : "s"}`;

  const message = isExpired
    ? `${driverName}'s driving license expired on ${dateLabel(profile.licenseExpiry)}. Please renew the license and upload the updated document.`
    : remaining === 0
      ? `${driverName}'s driving license expires today (${dateLabel(profile.licenseExpiry)}). Please renew the license and upload the updated document immediately.`
      : `${driverName}'s driving license expires on ${dateLabel(profile.licenseExpiry)} (${remaining} day${remaining === 1 ? "" : "s"} remaining). Please renew the license and upload the updated document.`;

  return sendOnce({
    notificationKey: `DRIVER_LICENSE:${driverUser._id}:${dateKey(profile.licenseExpiry)}:${milestone}`,
    entityType: "DRIVER_LICENSE",
    entityId: driverUser._id,
    documentType: "LICENSE",
    expiryDate: profile.licenseExpiry,
    daysBefore: isExpired ? -1 : remaining,
    recipients,
    type: isExpired ? "DRIVER_LICENSE_EXPIRED" : "DRIVER_LICENSE_EXPIRY",
    title,
    message,
    link: "/fleet-manager/drivers",
    data: {
      driverId: driverUser._id,
      documentType: "LICENSE",
      expiryDate: profile.licenseExpiry,
      daysRemaining: remaining,
    },
    priority: priorityForRemaining(remaining),
    io,
    force,
  });
}

async function notifyVehicleDocumentExpiry({ io, vehicleId, documentId, force = false }) {
  if (!vehicleId || !documentId) return 0;

  const [vehicle, fleetManagers] = await Promise.all([
    Vehicle.findById(vehicleId)
      .populate({ path: "assignedDriver", select: "_id fullName isActive accountStatus role" })
      .lean(),
    User.find({
      role: "FLEET_MANAGER",
      isActive: true,
      accountStatus: "ACTIVE",
    }).select("_id").lean(),
  ]);

  if (!vehicle) return 0;

  const document = (vehicle.documents || []).find(
    (item) => item._id && item._id.toString() === String(documentId)
  );
  if (!document?.expiryDate) return 0;

  const remaining = daysUntil(document.expiryDate);
  const milestone = getExpiryMilestone(remaining);
  if (!milestone) return 0;

  const registration = vehicle.registrationNumber || vehicle.vehicleNumber || "Vehicle";
  const driverId = vehicle.assignedDriver?._id;
  const recipients = fleetManagers.map((user) => user._id);

  if (
    driverId &&
    vehicle.assignedDriver?.isActive &&
    vehicle.assignedDriver?.accountStatus === "ACTIVE"
  ) {
    recipients.push(driverId);
  }

  const documentLabel = String(document.documentType || "DOCUMENT").replaceAll("_", " ");
  const isExpired = milestone === "EXPIRED";
  const title = isExpired
    ? `Vehicle ${documentLabel} Expired`
    : remaining === 0
      ? `Vehicle ${documentLabel} Expires Today`
      : `Vehicle ${documentLabel} Expires in ${remaining} Day${remaining === 1 ? "" : "s"}`;

  const message = isExpired
    ? `${documentLabel} for vehicle ${registration} expired on ${dateLabel(document.expiryDate)}. Please renew the document and upload the updated copy.`
    : remaining === 0
      ? `${documentLabel} for vehicle ${registration} expires today (${dateLabel(document.expiryDate)}). Please renew the document and upload the updated copy immediately.`
      : `${documentLabel} for vehicle ${registration} expires on ${dateLabel(document.expiryDate)} (${remaining} day${remaining === 1 ? "" : "s"} remaining). Please renew the document and upload the updated copy.`;

  return sendOnce({
    notificationKey: `VEHICLE_DOCUMENT:${vehicle._id}:${document._id}:${dateKey(document.expiryDate)}:${milestone}`,
    entityType: "VEHICLE_DOCUMENT",
    entityId: vehicle._id,
    documentId: document._id,
    documentType: document.documentType,
    expiryDate: document.expiryDate,
    daysBefore: isExpired ? -1 : remaining,
    recipients,
    type: isExpired ? "VEHICLE_DOCUMENT_EXPIRED" : "VEHICLE_DOCUMENT_EXPIRY",
    title,
    message,
    link: "/fleet-manager/vehicles",
    data: {
      vehicleId: vehicle._id,
      registrationNumber: registration,
      documentId: document._id,
      documentType: document.documentType,
      expiryDate: document.expiryDate,
      daysRemaining: remaining,
    },
    priority: priorityForRemaining(remaining),
    io,
    force,
  });
}

async function notifyUpdatedDriverLicenseExpiry({ io, driverId, force = true }) {
  return safeNotify(() =>
    notifyDriverLicenseExpiry({
      io,
      driverId,
      force,
    })
  );
}

async function notifyUpdatedVehicleDocumentExpiry({ io, vehicleId, documentId, force = true }) {
  return safeNotify(() =>
    notifyVehicleDocumentExpiry({
      io,
      vehicleId,
      documentId,
      force,
    })
  );
}

async function runDocumentExpiryChecks(io) {
  const [fleetManagers, driverProfiles, vehicles] = await Promise.all([
    User.find({
      role: "FLEET_MANAGER",
      isActive: true,
      accountStatus: "ACTIVE",
    }).select("_id").lean(),

    DriverProfile.find({ licenseExpiry: { $ne: null } })
      .populate({
        path: "user",
        select: "_id fullName isActive accountStatus role",
      })
      .lean(),

    Vehicle.find({ "documents.expiryDate": { $ne: null } })
      .populate({
        path: "assignedDriver",
        select: "_id fullName isActive accountStatus role",
      })
      .lean(),
  ]);

  const fleetManagerIds = fleetManagers.map((user) => user._id);
  let sent = 0;

  for (const profile of driverProfiles) {
    if (!profile.user?._id || !profile.licenseExpiry) continue;

    const remaining = daysUntil(profile.licenseExpiry);
    const milestone = getExpiryMilestone(remaining);
    if (!milestone) continue;

    const isExpired = milestone === "EXPIRED";
    const driverId = profile.user._id;
    const driverName = profile.user.fullName || "Driver";
    const recipients = [...fleetManagerIds];

    if (profile.user.isActive && profile.user.accountStatus === "ACTIVE") {
      recipients.push(driverId);
    }

    const title = isExpired
      ? "Driving License Expired"
      : remaining === 0
        ? "Driving License Expires Today"
        : `Driving License Expires in ${remaining} Day${remaining === 1 ? "" : "s"}`;

    const message = isExpired
      ? `${driverName}'s driving license expired on ${dateLabel(profile.licenseExpiry)}. Please renew the license and upload the updated document.`
      : remaining === 0
        ? `${driverName}'s driving license expires today (${dateLabel(profile.licenseExpiry)}). Please renew the license and upload the updated document immediately.`
        : `${driverName}'s driving license expires on ${dateLabel(profile.licenseExpiry)} (${remaining} day${remaining === 1 ? "" : "s"} remaining). Please renew the license and upload the updated document.`;

    sent += await sendOnce({
      notificationKey: `DRIVER_LICENSE:${driverId}:${dateKey(profile.licenseExpiry)}:${milestone}`,
      entityType: "DRIVER_LICENSE",
      entityId: driverId,
      documentType: "LICENSE",
      expiryDate: profile.licenseExpiry,
      daysBefore: isExpired ? -1 : remaining,
      recipients,
      type: isExpired ? "DRIVER_LICENSE_EXPIRED" : "DRIVER_LICENSE_EXPIRY",
      title,
      message,
      link: "/fleet-manager/drivers",
      data: {
        driverId,
        documentType: "LICENSE",
        expiryDate: profile.licenseExpiry,
        daysRemaining: remaining,
      },
      priority: priorityForRemaining(remaining),
      io,
    });
  }

  for (const vehicle of vehicles) {
    for (const document of vehicle.documents || []) {
      if (!document.expiryDate) continue;

      const remaining = daysUntil(document.expiryDate);
      const milestone = getExpiryMilestone(remaining);
      if (!milestone) continue;

      const isExpired = milestone === "EXPIRED";
      const registration = vehicle.registrationNumber || vehicle.vehicleNumber || "Vehicle";
      const driverId = vehicle.assignedDriver?._id;
      const recipients = [...fleetManagerIds];

      if (
        driverId &&
        vehicle.assignedDriver?.isActive &&
        vehicle.assignedDriver?.accountStatus === "ACTIVE"
      ) {
        recipients.push(driverId);
      }

      const documentLabel = String(document.documentType || "DOCUMENT").replaceAll("_", " ");
      const title = isExpired
        ? `Vehicle ${documentLabel} Expired`
        : remaining === 0
          ? `Vehicle ${documentLabel} Expires Today`
          : `Vehicle ${documentLabel} Expires in ${remaining} Day${remaining === 1 ? "" : "s"}`;

      const message = isExpired
        ? `${documentLabel} for vehicle ${registration} expired on ${dateLabel(document.expiryDate)}. Please renew the document and upload the updated copy.`
        : remaining === 0
          ? `${documentLabel} for vehicle ${registration} expires today (${dateLabel(document.expiryDate)}). Please renew the document and upload the updated copy immediately.`
          : `${documentLabel} for vehicle ${registration} expires on ${dateLabel(document.expiryDate)} (${remaining} day${remaining === 1 ? "" : "s"} remaining). Please renew the document and upload the updated copy.`;

      sent += await sendOnce({
        notificationKey: `VEHICLE_DOCUMENT:${vehicle._id}:${document._id}:${dateKey(document.expiryDate)}:${milestone}`,
        entityType: "VEHICLE_DOCUMENT",
        entityId: vehicle._id,
        documentId: document._id,
        documentType: document.documentType,
        expiryDate: document.expiryDate,
        daysBefore: isExpired ? -1 : remaining,
        recipients,
        type: isExpired ? "VEHICLE_DOCUMENT_EXPIRED" : "VEHICLE_DOCUMENT_EXPIRY",
        title,
        message,
        link: "/fleet-manager/vehicles",
        data: {
          vehicleId: vehicle._id,
          registrationNumber: registration,
          documentId: document._id,
          documentType: document.documentType,
          expiryDate: document.expiryDate,
          daysRemaining: remaining,
        },
        priority: priorityForRemaining(remaining),
        io,
      });
    }
  }

  return { sent, checkedAt: new Date(), timeZone: EXPIRY_TIME_ZONE };
}

function startDocumentExpiryJob({ io, runImmediately = true } = {}) {
  const run = () =>
    runDocumentExpiryChecks(io).catch((error) =>
      console.error("Document expiry job error:", error)
    );

  if (runImmediately) run();

  const now = new Date();
  const next = new Date(now);
  next.setHours(0, 5, 0, 0);

  if (next <= now) next.setDate(next.getDate() + 1);

  const firstDelay = Math.max(1000, next.getTime() - now.getTime());

  const timeout = setTimeout(() => {
    run();
    setInterval(run, DAY_MS);
  }, firstDelay);

  return timeout;
}

module.exports = {
  runDocumentExpiryChecks,
  startDocumentExpiryJob,
  notifyUpdatedDriverLicenseExpiry,
  notifyUpdatedVehicleDocumentExpiry,
  getExpiryMilestone,
  daysUntil,
};