const express = require("express");
const { getManagementDashboard } = require("../controllers/managementDashboardController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
router.get("/", authenticate, authorize("VIEWER", "SUPER_ADMIN"), getManagementDashboard);

module.exports = router;
