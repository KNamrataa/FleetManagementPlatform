const express = require("express");
const { getFleetDashboard } = require("../controllers/fleetDashboardController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const router = express.Router();
router.get("/", authenticate, authorize("FLEET_MANAGER", "SUPER_ADMIN"), getFleetDashboard);
module.exports = router;
