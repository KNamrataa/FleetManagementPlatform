const express = require("express");
const {
  getDriverDashboard,
  getMyVehicle,
  getMyTrips,
  getMyTrip,
  acceptMyTrip,
  startMyTrip,
  completeMyTrip,
  getMyProfile,
  updateMyProfile,
  createVehicleIssue,
  getMyIssues,
  getMyIssue,
} = require("../controllers/driverController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const access = [authenticate, authorize("DRIVER")];

router.get("/dashboard", ...access, getDriverDashboard);
router.get("/vehicle", ...access, getMyVehicle);
router.get("/trips", ...access, getMyTrips);
router.get("/trips/:id", ...access, getMyTrip);
router.post("/trips/:id/accept", ...access, acceptMyTrip);
router.post("/trips/:id/start", ...access, startMyTrip);
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

module.exports = router;
