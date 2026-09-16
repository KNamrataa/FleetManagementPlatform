const express = require("express");
const c = require("../controllers/customerController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const customer = [authenticate, authorize("CUSTOMER")];

router.get("/dashboard", ...customer, c.getCustomerDashboard);
router.post("/trip-requests", ...customer, c.createTripRequest);
router.get("/trip-requests", ...customer, c.getTripRequests);
router.get("/trip-requests/:id", ...customer, c.getTripRequest);
router.get("/trips", ...customer, c.getCustomerTrips);
router.get("/trips/:id", ...customer, c.getCustomerTrip);
router.get("/trips/:id/tracking", ...customer, c.getCustomerTracking);
router.get("/trip-history", ...customer, c.getTripHistory);
router.get("/invoices", ...customer, c.getCustomerInvoices);
router.get("/invoices/:id", ...customer, c.getCustomerInvoice);
router.get("/profile", ...customer, c.getCustomerProfile);
router.put("/profile", ...customer, c.updateCustomerProfile);

module.exports = router;
