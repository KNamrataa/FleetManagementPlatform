const express = require("express");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const c = require("../controllers/proofOfDeliveryController");
const router = express.Router();

router.get("/driver/trips", authenticate, authorize("DRIVER"), c.getDriverTrips);
router.post("/", authenticate, authorize("DRIVER"), c.submitProof);
router.get("/customer", authenticate, authorize("CUSTOMER"), c.getCustomerProofs);
router.get("/manager", authenticate, authorize(...c.MANAGER_ROLES), c.getManagerProofs);
router.get("/:id", authenticate, authorize("DRIVER", "CUSTOMER", ...c.MANAGER_ROLES), c.getOneProof);
module.exports = router;
