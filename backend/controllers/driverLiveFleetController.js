const Trip = require("../models/Trip");
const TripTracking = require("../models/TripTracking");

const ACTIVE = ["IN_PROGRESS", "PAUSED"];

async function getDriverLiveFleet(req, res) {
  try {
    const trips = await Trip.find({ tripStatus: { $in: ACTIVE }, vehicle: { $ne: null }, driver: { $ne: null } })
      .select("tripId pickupLocation destination tripStatus scheduledStart actualStart vehicle driver routeOptimization alternativeRoutes distance aiEstimatedDistanceKm aiEstimatedDurationMinutes")
      .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status")
      .populate("driver", "fullName email")
      .sort({ actualStart: -1 })
      .lean();

    const tripIds = trips.map((trip) => trip._id);
    const trackingRows = tripIds.length
      ? await TripTracking.find({ trip: { $in: tripIds } })
          .select("trip vehicle driver source currentLocation latitude longitude speed accuracy heading distanceTravelled remainingDistance estimatedArrival estimatedArrivalSource recordedAt")
          .sort({ recordedAt: -1 })
          .lean()
      : [];

    const latestByTrip = new Map();
    for (const row of trackingRows) {
      const key = String(row.trip);
      if (!latestByTrip.has(key)) latestByTrip.set(key, row);
    }

    const vehicles = trips.map((trip) => ({
      _id: trip.vehicle?._id || trip._id,
      registrationNumber: trip.vehicle?.registrationNumber || trip.vehicle?.vehicleNumber || "—",
      vehicleNumber: trip.vehicle?.vehicleNumber || "",
      vehicleType: trip.vehicle?.vehicleType || "—",
      make: trip.vehicle?.make || "",
      model: trip.vehicle?.model || "",
      status: trip.vehicle?.status || "ON_TRIP",
      assignedDriver: trip.driver || null,
      trip: {
        _id: trip._id,
        tripId: trip.tripId,
        pickupLocation: trip.pickupLocation,
        destination: trip.destination,
        tripStatus: trip.tripStatus,
        scheduledStart: trip.scheduledStart,
        actualStart: trip.actualStart,
      },
      tracking: latestByTrip.get(String(trip._id)) || null,
      routeOptimization: trip.routeOptimization || null,
      alternativeRoutes: trip.alternativeRoutes || [],
      distance: trip.distance || 0,
      aiEstimatedDistanceKm: trip.aiEstimatedDistanceKm,
      aiEstimatedDurationMinutes: trip.aiEstimatedDurationMinutes,
    }));

    return res.json({
      success: true,
      vehicles,
      activeTrips: vehicles.length,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error("Driver live fleet error:", error);
    return res.status(500).json({ success: false, message: "Unable to load live fleet data." });
  }
}

module.exports = { getDriverLiveFleet };
