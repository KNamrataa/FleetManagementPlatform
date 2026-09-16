const express = require("express");
const { postDeviceGps, postDriverGps, getTripTrackingHealth } = require("../controllers/trackingController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const router = express.Router();
router.post("/device", postDeviceGps);
router.get("/health", authenticate, authorize("SUPER_ADMIN", "FLEET_MANAGER", "TRIP_MANAGER", "DISPATCHER"), getTripTrackingHealth);
router.post("/trips/:id", authenticate, authorize("DRIVER"), postDriverGps);
module.exports = router;
