const express = require("express");
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  assignRole,
  updateUserStatus,
  deleteUser,
  getFleetOverview,
  getAdminVehicles,
  getAdminDrivers,
  getSuperAdminDashboardOverview,
  getAdminTrips,
  getAdminTracking,
  getAdminFuel,
  getAdminMaintenance,
  getAdminExpenses,
  getAdminReports,
  getAdminSettings,
  getAdminAuditLogs,
  exportAdminData,
  getAdminOverviewExtras,
} = require("../controllers/adminController");
const { getPermissions, updatePermissions, resetUserAccess } = require("../controllers/securityController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const superAdminOnly = [authenticate, authorize("SUPER_ADMIN")];

router.get("/dashboard-overview", ...superAdminOnly, getSuperAdminDashboardOverview);
router.get("/overview-extras", ...superAdminOnly, getAdminOverviewExtras);
router.get("/fleet-overview", ...superAdminOnly, getFleetOverview);
router.get("/vehicles", ...superAdminOnly, getAdminVehicles);
router.get("/drivers", ...superAdminOnly, getAdminDrivers);
router.get("/trips", ...superAdminOnly, getAdminTrips);
router.get("/tracking", ...superAdminOnly, getAdminTracking);
router.get("/fuel", ...superAdminOnly, getAdminFuel);
router.get("/maintenance", ...superAdminOnly, getAdminMaintenance);
router.get("/expenses", ...superAdminOnly, getAdminExpenses);
router.get("/reports", ...superAdminOnly, getAdminReports);
router.get("/settings", ...superAdminOnly, getAdminSettings);
router.get("/audit-logs", ...superAdminOnly, getAdminAuditLogs);
router.get("/export/:resource", ...superAdminOnly, exportAdminData);

router.get("/users", ...superAdminOnly, getUsers);
router.get("/users/:userId", ...superAdminOnly, getUserById);
router.post("/users", ...superAdminOnly, createUser);
router.put("/users/:userId", ...superAdminOnly, updateUser);
router.put("/users/:userId/role", ...superAdminOnly, assignRole);
router.patch("/users/:userId/status", ...superAdminOnly, updateUserStatus);
router.delete("/users/:userId", ...superAdminOnly, deleteUser);
router.get("/permissions", ...superAdminOnly, getPermissions);
router.put("/permissions/:role", ...superAdminOnly, updatePermissions);
router.post("/users/:userId/reset-access", ...superAdminOnly, resetUserAccess);

module.exports = router;
