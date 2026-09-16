const express = require("express");
const {
  getDriverDashboard,
  getMyVehicle,
  createOwnerVehicle,
  updateOwnerVehicle,
  addOwnerVehicleDocument,
  submitOwnerVehicleApproval,
  getMyTrips,
  getMyTrip,
  acceptMyTrip,
  startMyTrip,
  pauseMyTrip,
  resumeMyTrip,
  completeMyTrip,
  getMyProfile,
  updateMyProfile,
  createVehicleIssue,
  getMyIssues,
  getMyIssue,
} = require("../controllers/driverController");
const driverRecords = require("../controllers/driverRecordsController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const access = [authenticate, authorize("DRIVER")];

router.get("/dashboard", ...access, getDriverDashboard);
router.get("/vehicle", ...access, getMyVehicle);
router.post("/vehicle", ...access, createOwnerVehicle);
router.put("/vehicle/:id", ...access, updateOwnerVehicle);
router.post("/vehicle/:id/documents", ...access, addOwnerVehicleDocument);
router.post("/vehicle/:id/submit-approval", ...access, submitOwnerVehicleApproval);
router.get("/trips", ...access, getMyTrips);
router.get("/trips/:id", ...access, getMyTrip);
router.post("/trips/:id/accept", ...access, acceptMyTrip);
router.post("/trips/:id/start", ...access, startMyTrip);
router.post("/trips/:id/pause", ...access, pauseMyTrip);
router.post("/trips/:id/resume", ...access, resumeMyTrip);
router.post("/trips/:id/complete", ...access, completeMyTrip);
router.get("/trip-history", ...access, (req, res) => {
  req.query.status = "COMPLETED";
  return getMyTrips(req, res);
});
router.get("/profile", ...access, getMyProfile);
router.put("/profile", ...access, updateMyProfile);
router.post("/issues", ...access, createVehicleIssue);
router.get("/issues", ...access, getMyIssues);
router.get("/issues/:id", ...access, getMyIssue);
router.get("/records", ...access, driverRecords.records);
router.post("/expenses/submit", ...access, driverRecords.submitExpense);

module.exports = router;
