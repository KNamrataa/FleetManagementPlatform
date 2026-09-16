const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Trip = require("../models/Trip");
const { saveGpsPing } = require("../services/trackingService");

const FLEET_TRACKING_ROLES = new Set(["SUPER_ADMIN", "FLEET_MANAGER", "TRIP_MANAGER", "DISPATCHER", "VIEWER"]);

function registerTrackingSocket(io) {
  io.use(async (socket, next) => {
    try {
      const bearer = socket.handshake.headers.authorization || "";
      const token = socket.handshake.auth?.token || (bearer.startsWith("Bearer ") ? bearer.slice(7) : "");
      if (!token) return next(new Error("Authentication required."));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select("fullName email role isActive accountStatus").lean();
      if (!user || user.isActive === false || user.accountStatus === "INACTIVE") return next(new Error("Account is inactive."));
      socket.user = user;
      next();
    } catch {
      next(new Error("Invalid or expired authentication token."));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${String(socket.user._id)}`);

    socket.on("trip:subscribe", async ({ tripId } = {}, ack = () => {}) => {
      try {
        const trip = await Trip.findById(tripId).select("customer driver tripStatus").lean();
        if (!trip) throw Object.assign(new Error("Trip not found."), { status: 404 });
        const userId = String(socket.user._id);
        const authorized = FLEET_TRACKING_ROLES.has(socket.user.role) ||
          (socket.user.role === "CUSTOMER" && String(trip.customer || "") === userId) ||
          (socket.user.role === "DRIVER" && String(trip.driver || "") === userId);
        if (!authorized) throw Object.assign(new Error("You are not allowed to track this trip."), { status: 403 });
        socket.join(`trip:${tripId}`);
        ack({ success: true });
      } catch (error) {
        ack({ success: false, message: error.message });
      }
    });

    socket.on("trip:unsubscribe", ({ tripId } = {}) => {
      if (tripId) socket.leave(`trip:${tripId}`);
    });

    socket.on("driver:gps", async (payload = {}, ack = () => {}) => {
      try {
        if (socket.user.role !== "DRIVER") throw Object.assign(new Error("Only drivers can publish phone GPS."), { status: 403 });
        const tracking = await saveGpsPing({
          tripId: payload.tripId,
          senderUserId: socket.user._id,
          source: "MOBILE_APP",
          ...payload,
        });
        io.to(`trip:${payload.tripId}`).emit("trip:gps", tracking);
        ack({ success: true, recordedAt: tracking.recordedAt });
      } catch (error) {
        ack({ success: false, message: error.message });
      }
    });
  });
}

module.exports = registerTrackingSocket;
