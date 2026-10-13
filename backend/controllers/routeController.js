const mongoose = require("mongoose");
const Trip = require("../models/Trip");
const { optimizeAndPersistTrip } = require("../services/routeOptimizationService");
const { getRoutingHealth } = require("../services/routeIntelligenceService");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function ensureTripAccess(req, trip) {
  const role = req.user?.role;
  if (["SUPER_ADMIN", "FLEET_MANAGER", "TRIP_MANAGER", "DISPATCHER"].includes(role)) return true;
  if (role === "DRIVER" && String(trip.driver || "") === String(req.user._id || "")) return true;
  if (role === "CUSTOMER" && String(trip.customer || "") === String(req.user._id || "")) return true;
  return false;
}

async function optimizeTripRoute(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await Trip.findById(req.params.id).lean();
    if (!trip) return fail(res, 404, "Trip not found.");
    if (!(await ensureTripAccess(req, trip))) return fail(res, 403, "You are not allowed to optimize this trip route.");

    const currentPosition = req.body?.currentPosition;
    if (currentPosition && (!Number.isFinite(Number(currentPosition.latitude)) || !Number.isFinite(Number(currentPosition.longitude)))) {
      return fail(res, 400, "Invalid current GPS position.");
    }
    const result = await optimizeAndPersistTrip(trip._id, {
      force: true,
      currentPosition: currentPosition ? { latitude: Number(currentPosition.latitude), longitude: Number(currentPosition.longitude) } : null,
    });
    return res.json({ success: true, route: result, recommendation: result.recommendation || null });
  } catch (error) {
    console.error("Route optimization error:", error);
    return fail(res, error.status || 500, error.message || "Unable to optimize route.");
  }
}

async function getTripRoute(req, res) {
  try {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid trip ID.");
    const trip = await Trip.findById(req.params.id).select("driver customer routeOptimization alternativeRoutes pickupLocation destination tripStatus routePerformance").lean();
    if (!trip) return fail(res, 404, "Trip not found.");
    if (!(await ensureTripAccess(req, trip))) return fail(res, 403, "You are not allowed to view this route.");
    return res.json({ success: true, route: trip.routeOptimization || null, alternatives: trip.alternativeRoutes || [], routePerformance: trip.routePerformance || null });
  } catch (error) {
    console.error("Get optimized route error:", error);
    return fail(res, 500, "Unable to load route optimization.");
  }
}

module.exports = { optimizeTripRoute, getTripRoute };

async function getRoutingProviderHealth(req, res) {
  try {
    const health = await getRoutingHealth();
    return res.json({ success: true, health });
  } catch (error) {
    console.error("Routing health error:", error);
    return fail(res, 500, "Unable to check routing provider health.");
  }
}

module.exports.getRoutingProviderHealth = getRoutingProviderHealth;