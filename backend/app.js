const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

// Security headers
app.use(helmet());

// Allow frontend requests
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Parse JSON request bodies
app.use(express.json());

// Basic API rate limiting
const apiLimiter = rateLimit({
   windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },
});

app.use("/api", apiLimiter);

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Fleet Management Backend API is running",
  });
});

module.exports = app;