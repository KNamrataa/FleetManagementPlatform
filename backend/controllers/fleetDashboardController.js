const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Trip = require("../models/Trip");
const Assignment = require("../models/Assignment");
const { syncAssignmentRecords } = require("../utils/fleetHelpers");
const MaintenanceRecord = require("../models/MaintenanceRecord");
const MaintenanceWorkOrder = require("../models/MaintenanceWorkOrder");
const TripRequest = require("../models/TripRequest");

async function getFleetDashboard(req, res) {
  try {
    await syncAssignmentRecords();
    const [vehicleAgg, driverAgg, tripAgg, recentTrips, assignments, recentDrivers, maintenanceCostAgg, activeMaintenanceOrders, tripRequestAgg, recentTripRequests] = await Promise.all([
      Vehicle.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      DriverProfile.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Trip.aggregate([{ $group: { _id: "$tripStatus", count: { $sum: 1 } } }]),
      Trip.find().populate("vehicle", "registrationNumber").populate("driver", "fullName").sort({ createdAt: -1 }).limit(8).lean(),
      Assignment.find({ assignmentStatus: "ACTIVE" }).populate("vehicle", "registrationNumber vehicleType status").populate("driver", "fullName phone").sort({ assignedAt: -1 }).limit(8).lean(),
      User.find({ role: "DRIVER" }).select("fullName email updatedAt isActive accountStatus").sort({ updatedAt: -1 }).limit(8).lean(),
      MaintenanceRecord.aggregate([
        {
          $group: {
            _id: "$vehicle",
            totalCost: { $sum: "$totalCost" },
            completedServices: { $sum: 1 },
            lastServiceDate: { $max: "$completionDate" },
          },
        },
        {
          $lookup: {
            from: "vehicles",
            localField: "_id",
            foreignField: "_id",
            as: "vehicle",
          },
        },
        { $unwind: "$vehicle" },
        {
          $project: {
            _id: 0,
            vehicleId: "$_id",
            registrationNumber: "$vehicle.registrationNumber",
            vehicleNumber: "$vehicle.vehicleNumber",
            vehicleType: "$vehicle.vehicleType",
            status: "$vehicle.status",
            totalCost: 1,
            completedServices: 1,
            lastServiceDate: 1,
          },
        },
        { $sort: { totalCost: -1 } },
      ]),
      MaintenanceWorkOrder.find({ status: { $in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } }).populate("vehicle", "vehicleNumber registrationNumber status").sort({ createdAt: -1 }).limit(6).lean(),
      TripRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      TripRequest.find({ status: { $in: ["PENDING", "REVIEWED", "ACCEPTED"] } }).populate("customer", "fullName email").sort({ createdAt: -1 }).limit(6).lean(),
    ]);
    const toMap = (arr) => Object.fromEntries(arr.map(x => [x._id, x.count]));
    const v = toMap(vehicleAgg), d = toMap(driverAgg), t = toMap(tripAgg), r = toMap(tripRequestAgg);
    res.json({ success: true, kpis: {
      totalVehicles: Object.values(v).reduce((a,b)=>a+b,0), availableVehicles: v.AVAILABLE || 0, vehiclesOnTrip: v.ON_TRIP || 0, vehiclesInMaintenance: v.MAINTENANCE || 0,
      totalDrivers: await User.countDocuments({ role: "DRIVER" }), availableDrivers: d.AVAILABLE || 0, driversOnTrip: d.ON_TRIP || 0, pendingTripRequests: (r.PENDING || 0) + (r.REVIEWED || 0) + (r.ACCEPTED || 0),
      activeTrips: (t.ASSIGNED || 0) + (t.IN_PROGRESS || 0) + (t.PAUSED || 0), scheduledTrips: t.SCHEDULED || 0, completedTrips: t.COMPLETED || 0,
    }, vehicleStatus: v, driverStatus: d, tripStatus: t, recentTrips, assignments, recentDrivers, tripRequests: { status: r, recent: recentTripRequests }, maintenance: { totalCost: maintenanceCostAgg.reduce((sum, item) => sum + Number(item.totalCost || 0), 0), byVehicle: maintenanceCostAgg, activeWorkOrders: activeMaintenanceOrders } });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to load fleet dashboard." }); }
}
module.exports = { getFleetDashboard };
