const { saveGpsPing, getTrackingHealth } = require("../services/trackingService");

async function postDriverGps(req, res) {
  try {
    const tracking = await saveGpsPing({
      tripId: req.params.id,
      senderUserId: req.user._id,
      source: "MOBILE_APP",
      ...req.body,
    });
    req.app.get("io")?.to(`trip:${req.params.id}`).emit("trip:gps", tracking);
    return res.status(201).json({ success: true, tracking });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to save GPS update." });
  }
}

async function postDeviceGps(req, res) {
  try {
    const configuredKey = process.env.TELEMATICS_INGESTION_KEY;
    if (!configuredKey) return res.status(503).json({ success: false, message: "Company telematics ingestion is not configured." });
    if (req.get("x-telematics-key") !== configuredKey) return res.status(401).json({ success: false, message: "Invalid telematics key." });
    const { tripId, ...payload } = req.body || {};
    if (!tripId) return res.status(400).json({ success: false, message: "tripId is required." });
    const tracking = await saveGpsPing({ tripId, source: "DEVICE", ...payload });
    req.app.get("io")?.to(`trip:${tripId}`).emit("trip:gps", tracking);
    return res.status(201).json({ success: true, tracking });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to ingest telematics GPS update." });
  }
}

async function getTripTrackingHealth(req, res) {
  try {
    const TripTracking = require("../models/TripTracking");
    const rows = await TripTracking.find({}).populate("trip", "tripId tripStatus pickupLocation destination").populate("vehicle", "registrationNumber vehicleType status").populate("driver", "fullName email phone").sort({ recordedAt: -1 }).limit(1000).lean();
    const latest = new Map();
    rows.forEach((row) => { const key = String(row.trip?._id || row.trip || row._id); if (!latest.has(key)) latest.set(key, row); });
    const health = await getTrackingHealth([...latest.values()]);
    return res.json({ success: true, count: health.length, tracking: health, generatedAt: new Date() });
  } catch (error) {
    console.error("Tracking health error:", error);
    return res.status(500).json({ success: false, message: "Unable to load tracking health." });
  }
}
module.exports = { postDriverGps, postDeviceGps, getTripTrackingHealth };
