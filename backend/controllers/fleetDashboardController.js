const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Trip = require("../models/Trip");
const Assignment = require("../models/Assignment");
const { syncAssignmentRecords } = require("../utils/fleetHelpers");

async function getFleetDashboard(req, res) {
  try {
    await syncAssignmentRecords();
    const [vehicleAgg, driverAgg, tripAgg, recentTrips, assignments, recentDrivers] = await Promise.all([
      Vehicle.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      DriverProfile.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Trip.aggregate([{ $group: { _id: "$tripStatus", count: { $sum: 1 } } }]),
      Trip.find().populate("vehicle", "registrationNumber").populate("driver", "fullName").sort({ createdAt: -1 }).limit(8).lean(),
      Assignment.find({ assignmentStatus: "ACTIVE" }).populate("vehicle", "registrationNumber vehicleType status").populate("driver", "fullName phone").sort({ assignedAt: -1 }).limit(8).lean(),
      User.find({ role: "DRIVER" }).select("fullName email updatedAt isActive accountStatus").sort({ updatedAt: -1 }).limit(8).lean(),
    ]);
    const toMap = (arr) => Object.fromEntries(arr.map(x => [x._id, x.count]));
    const v = toMap(vehicleAgg), d = toMap(driverAgg), t = toMap(tripAgg);
    res.json({ success: true, kpis: {
      totalVehicles: Object.values(v).reduce((a,b)=>a+b,0), availableVehicles: v.AVAILABLE || 0, vehiclesOnTrip: v.ON_TRIP || 0, vehiclesInMaintenance: v.MAINTENANCE || 0,
      totalDrivers: await User.countDocuments({ role: "DRIVER" }), availableDrivers: d.AVAILABLE || 0, driversOnTrip: d.ON_TRIP || 0,
      activeTrips: (t.ASSIGNED || 0) + (t.IN_PROGRESS || 0), scheduledTrips: t.SCHEDULED || 0, completedTrips: t.COMPLETED || 0,
    }, vehicleStatus: v, driverStatus: d, tripStatus: t, recentTrips, assignments, recentDrivers });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to load fleet dashboard." }); }
}
module.exports = { getFleetDashboard };
