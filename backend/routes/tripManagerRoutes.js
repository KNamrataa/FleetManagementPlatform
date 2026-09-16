const express = require("express");
const {
  getOverview, getRequests, getTrips, getTrip, getResources, createTrip,
  assignDriver, assignVehicle, scheduleTrip, rescheduleTrip,
  cancelTripManager, getRescheduled, getCancelled, getActive,
  getDelayed, getLiveTracking, getConflicts, getNotifications,
} = require("../controllers/tripManagerController");
const { authenticate, authorize, requirePermission } = require("../middleware/authMiddleware");

const router = express.Router();
const access = [authenticate, authorize("TRIP_MANAGER", "DISPATCHER", "SUPER_ADMIN")];
router.get("/overview", ...access, getOverview);
router.get("/trip-requests", ...access, getRequests);
router.get("/trips", ...access, getTrips);
router.get("/trips/:id", ...access, getTrip);
router.post("/trips", ...access, requirePermission("trips:create"), createTrip);
router.put("/trips/:id/schedule", ...access, scheduleTrip);
router.put("/trips/:id/reschedule", ...access, requirePermission("trips:edit"), rescheduleTrip);
router.put("/trips/:id/cancel", ...access, requirePermission("trips:edit"), cancelTripManager);
router.post("/trips/:id/assign-driver", ...access, assignDriver);
router.post("/trips/:id/assign-vehicle", ...access, assignVehicle);
router.get("/drivers", ...access, getResources);
router.get("/vehicles", ...access, getResources);
router.get("/dispatch-board", ...access, getTrips);
router.get("/rescheduled", ...access, getRescheduled);
router.get("/cancelled", ...access, getCancelled);
router.get("/active", ...access, getActive);
router.get("/delayed", ...access, getDelayed);
router.get("/live-tracking", ...access, getLiveTracking);
router.get("/conflicts", ...access, getConflicts);
router.get("/notifications", ...access, getNotifications);
module.exports = router;
