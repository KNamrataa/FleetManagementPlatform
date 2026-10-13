const express = require("express");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const controller = require("../controllers/analyticsController");

const router = express.Router();
const analyticsRoles = ["SUPER_ADMIN", "VIEWER", "FLEET_MANAGER", "FINANCE_MANAGER", "MAINTENANCE_MANAGER", "TRIP_MANAGER", "DISPATCHER"];
router.get("/summary", authenticate, authorize(...analyticsRoles), controller.summary);
router.get("/reports/history", authenticate, authorize(...analyticsRoles), controller.history);
router.post("/reports/send-now", authenticate, authorize(...analyticsRoles), controller.sendMyReport);
router.post("/reports/run-all", authenticate, authorize("SUPER_ADMIN"), controller.runAll);
module.exports = router;
