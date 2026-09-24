require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const driverRoutes = require("./routes/driverRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const tripRoutes = require("./routes/tripRoutes");
const fleetDashboardRoutes = require("./routes/fleetDashboardRoutes");
const fleetExtrasRoutes = require("./routes/fleetExtrasRoutes");
const driverPortalRoutes = require("./routes/driverPortalRoutes");
const maintenanceRoutes = require("./routes/maintenanceRoutes");
const financeRoutes = require("./routes/financeRoutes");
const managementDashboardRoutes = require("./routes/managementDashboardRoutes");
const tripRequestRoutes = require("./routes/tripRequestRoutes");
const tripManagerRoutes = require("./routes/tripManagerRoutes");
const mainOverviewRoutes = require("./routes/mainOverviewRoutes");
const customerTripRequestRoutes = require("./routes/customerTripRequestRoutes");
const customerRoutes = require("./routes/customerRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const publicDashboardRoutes = require("./routes/publicDashboardRoutes");
const registerTrackingSocket = require("./realtime/trackingSocket");
const rateLimit = require("express-rate-limit");
const auditRequest = require("./middleware/auditMiddleware");

const app = express();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn("Warning: JWT_SECRET is missing or shorter than 32 characters. Set a strong secret in backend/.env before production use.");
}
const server = http.createServer(app);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const io = new Server(server, { cors: { origin: FRONTEND_ORIGIN, credentials: true } });
app.set("io", io);
registerTrackingSocket(io);

connectDB();

app.use(helmet());
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(auditRequest);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many authentication attempts. Please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);

app.get("/", (req, res) => {
  res.json({
    message: "FleetFlow Backend API is running.",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/fleet-manager/dashboard", fleetDashboardRoutes);
app.use("/api/fleet-manager/extras", fleetExtrasRoutes);
app.use("/api/driver", driverPortalRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/management/dashboard", managementDashboardRoutes);
app.use("/api/trip-requests", tripRequestRoutes);
app.use("/api/trip-manager", tripManagerRoutes);
app.use("/api/admin/overview-extras", mainOverviewRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/customer/trip-requests", customerTripRequestRoutes);
app.use("/api/gps", trackingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/public/dashboard-overview", publicDashboardRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});
app.use((error, req, res, next) => {
  console.error("Unhandled API error:", error);
  if (res.headersSent) return next(error);
  const status = Number(error.status || 500);
  return res.status(status >= 400 && status < 600 ? status : 500).json({ success: false, message: status === 500 ? "Internal server error. Please try again." : error.message || "Request failed." });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});