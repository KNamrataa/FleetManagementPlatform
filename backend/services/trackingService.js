const Trip = require("../models/Trip");
const TripTracking = require("../models/TripTracking");

const ACTIVE_STATUSES = new Set(["IN_PROGRESS", "PAUSED"]);
const radians = (v) => (Number(v) * Math.PI) / 180;

function haversineKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((v) => v == null || !Number.isFinite(Number(v)))) return 0;
  const R = 6371;
  const dLat = radians(Number(bLat) - Number(aLat));
  const dLng = radians(Number(bLng) - Number(aLng));
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function saveGpsPing({ tripId, senderUserId, source = "MOBILE_APP", latitude, longitude, speed = 0, accuracy = null, heading = null, currentLocation = "", recordedAt = new Date() }) {
  const trip = await Trip.findById(tripId).select("driver vehicle customer tripStatus distance").lean();
  if (!trip) {
    const error = new Error("Trip not found.");
    error.status = 404;
    throw error;
  }
  if (!ACTIVE_STATUSES.has(trip.tripStatus)) {
    const error = new Error("GPS updates are accepted only for active trips.");
    error.status = 409;
    throw error;
  }
  if (source === "MOBILE_APP" && String(trip.driver || "") !== String(senderUserId || "")) {
    const error = new Error("Only the assigned driver can publish GPS for this trip.");
    error.status = 403;
    throw error;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    const error = new Error("Invalid GPS coordinates.");
    error.status = 400;
    throw error;
  }

  const previous = await TripTracking.findOne({ trip: trip._id }).sort({ recordedAt: -1 }).lean();
  const increment = previous ? haversineKm(previous.latitude, previous.longitude, lat, lng) : 0;
  const distanceTravelled = Math.max(0, Number(previous?.distanceTravelled || 0) + increment);
  const plannedDistance = Math.max(0, Number(trip.distance || 0));
  const remainingDistance = plannedDistance ? Math.max(0, plannedDistance - distanceTravelled) : 0;
  const kph = Math.max(0, Number(speed || 0) * (source === "MOBILE_APP" ? 3.6 : 1));
  let estimatedArrival = null;
  if (remainingDistance > 0 && kph >= 5) {
    estimatedArrival = new Date(new Date(recordedAt).getTime() + (remainingDistance / kph) * 3600000);
  }

  const tracking = await TripTracking.create({
    trip: trip._id,
    vehicle: trip.vehicle || null,
    driver: trip.driver || null,
    source,
    currentLocation: String(currentLocation || "").trim(),
    latitude: lat,
    longitude: lng,
    speed: kph,
    accuracy: accuracy == null ? null : Number(accuracy),
    heading: heading == null ? null : Number(heading),
    distanceTravelled,
    remainingDistance,
    estimatedArrival,
    recordedAt: new Date(recordedAt),
  });

  return tracking.toObject();
}

module.exports = { ACTIVE_STATUSES, saveGpsPing };

async function getTrackingHealth(trackingRows = []) {
  const now = Date.now();
  return trackingRows.map((row) => {
    const ageSeconds = Math.max(0, (now - new Date(row.recordedAt).getTime()) / 1000);
    return { ...row, ageSeconds: Math.round(ageSeconds), trackingStatus: ageSeconds <= 30 ? "LIVE" : ageSeconds <= 120 ? "DELAYED" : "OFFLINE" };
  });
}

module.exports.getTrackingHealth = getTrackingHealth;
