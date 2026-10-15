const express = require("express");
const rateLimit = require("express-rate-limit");
const { submitContactMessage } = require("../controllers/contactController");

const router = express.Router();

// Public endpoint: limit repeated contact form submissions per client.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many messages submitted. Please wait a little and try again.",
  },
});

router.post("/", contactLimiter, submitContactMessage);

module.exports = router;
