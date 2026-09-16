const express = require("express");
const TripRequest = require("../models/TripRequest");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const { createCustomerTripRequest } = require("../controllers/tripRequestController");

const router = express.Router();
const access = [authenticate, authorize("CUSTOMER")];

router.post("/", ...access, createCustomerTripRequest);
router.get("/", ...access, async (req, res) => {
  try {
    const requests = await TripRequest.find({ customer: req.user._id })
      .populate("trip", "tripId tripStatus scheduledStart scheduledEnd vehicle driver")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    console.error("Customer trip request list error:", error);
    res.status(500).json({ success: false, message: "Unable to load your trip requests." });
  }
});
router.get("/:id", ...access, async (req, res) => {
  try {
    const request = await TripRequest.findOne({ _id: req.params.id, customer: req.user._id })
      .populate("trip", "tripId tripStatus scheduledStart scheduledEnd vehicle driver")
      .lean();
    if (!request) return res.status(404).json({ success: false, message: "Trip request not found." });
    res.json({ success: true, request });
  } catch (error) {
    console.error("Customer trip request detail error:", error);
    res.status(500).json({ success: false, message: "Unable to load your trip request." });
  }
});

module.exports = router;
