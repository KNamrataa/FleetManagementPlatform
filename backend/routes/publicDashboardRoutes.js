const express = require("express");
const { getPublicDashboardOverview } = require("../controllers/publicDashboardController");

const router = express.Router();

router.get("/", getPublicDashboardOverview);

module.exports = router;