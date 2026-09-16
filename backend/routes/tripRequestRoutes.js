const express = require("express");
const {
  getTripRequests,
  getTripRequest,
  createCustomerTripRequest,
  updateTripRequestStatus,
  scheduleTripRequest,
} = require("../controllers/tripRequestController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

const managerAccess = [authenticate, authorize("FLEET_MANAGER", "TRIP_MANAGER", "DISPATCHER", "SUPER_ADMIN")];
const customerAccess = [authenticate, authorize("CUSTOMER")];

router.get("/", ...managerAccess, getTripRequests);
router.get("/:id", ...managerAccess, getTripRequest);
router.patch("/:id/status", ...managerAccess, updateTripRequestStatus);
router.post("/:id/schedule", ...managerAccess, scheduleTripRequest);

// Kept here so the existing Customer Dashboard can submit requests against the
// same MongoDB collection without introducing a second request model/endpoint.
router.post("/customer", ...customerAccess, createCustomerTripRequest);

module.exports = router;
