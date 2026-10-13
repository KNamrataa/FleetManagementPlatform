const express = require("express");
const { optimizeTripRoute, getTripRoute, getRoutingProviderHealth } = require("../controllers/routeController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const access = [authenticate, authorize("SUPER_ADMIN", "FLEET_MANAGER", "TRIP_MANAGER", "DISPATCHER", "DRIVER", "CUSTOMER")];
const healthAccess = [authenticate, authorize("SUPER_ADMIN", "FLEET_MANAGER", "TRIP_MANAGER", "DISPATCHER")];
router.get("/health", ...healthAccess, getRoutingProviderHealth);
router.get("/:id", ...access, getTripRoute);
router.post("/:id/optimize", ...access, optimizeTripRoute);
router.post("/:id/recalculate", ...access, optimizeTripRoute);
module.exports = router;
