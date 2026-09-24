const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Trip = require("../models/Trip");
const FuelExpense = require("../models/FuelExpense");
const Expense = require("../models/Expense");
const MaintenanceRecord = require("../models/MaintenanceRecord");

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function getPublicDashboardOverview(req, res) {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrow = addDays(todayStart, 1);
    const monthStart = startOfMonth(now);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const weekStart = addDays(todayStart, -6);
    const previousWeekStart = addDays(todayStart, -13);

    const [
      vehicleStatus,
      totalVehicles,
      totalDrivers,
      availableDrivers,
      activeTrips,
      recentTrips,
      activeTripVehicles,
      todayFuel,
      monthFuel,
      monthExpenses,
      monthMaintenance,
      completedToday,
      completedTotal,
      weeklyActivity,
      previousWeekActivity,
    ] = await Promise.all([
      Vehicle.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Vehicle.countDocuments({}),
      User.countDocuments({ role: "DRIVER", isActive: true, accountStatus: { $ne: "INACTIVE" } }),
      DriverProfile.countDocuments({ status: "AVAILABLE", availability: true }),
      Trip.countDocuments({ tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS", "PAUSED"] } }),
      Trip.find({})
        .select("tripId pickupLocation destination tripStatus scheduledStart vehicle")
        .populate("vehicle", "registrationNumber vehicleNumber")
        .sort({ scheduledStart: -1, createdAt: -1 })
        .limit(4)
        .lean(),
      Trip.find({ tripStatus: { $in: ["ASSIGNED", "IN_PROGRESS", "PAUSED"] } })
        .select("tripId pickupLocation destination tripStatus vehicle")
        .populate("vehicle", "registrationNumber vehicleNumber")
        .sort({ scheduledStart: 1 })
        .limit(3)
        .lean(),
      FuelExpense.aggregate([
        { $match: { fuelDate: { $gte: todayStart, $lt: tomorrow } } },
        { $group: { _id: null, litres: { $sum: "$litres" } } },
      ]),
      FuelExpense.aggregate([
        { $match: { fuelDate: { $gte: monthStart, $lt: nextMonth } } },
        { $group: { _id: null, litres: { $sum: "$litres" }, amount: { $sum: "$totalAmount" } } },
      ]),
      Expense.aggregate([
        { $match: { expenseDate: { $gte: monthStart, $lt: nextMonth }, status: { $ne: "REJECTED" } } },
        { $group: { _id: null, amount: { $sum: "$amount" } } },
      ]),
      MaintenanceRecord.aggregate([
        { $match: { completionDate: { $gte: monthStart, $lt: nextMonth } } },
        { $group: { _id: null, amount: { $sum: "$totalCost" } } },
      ]),
      Trip.countDocuments({ tripStatus: "COMPLETED", actualEnd: { $gte: todayStart, $lt: tomorrow } }),
      Trip.countDocuments({ tripStatus: "COMPLETED" }),
      Trip.aggregate([
        { $match: { scheduledStart: { $gte: weekStart, $lt: tomorrow } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$scheduledStart" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Trip.countDocuments({ scheduledStart: { $gte: previousWeekStart, $lt: weekStart } }),
    ]);

    const status = Object.fromEntries(vehicleStatus.map((item) => [item._id, item.count]));

    const weeklyMap = new Map(weeklyActivity.map((item) => [item._id, item.count]));
    const weekly = [];
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(weekStart, i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      weekly.push({
        date: key,
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        value: weeklyMap.get(key) || 0,
      });
    }

    const normalizeTrip = (trip) => ({
      id: trip.tripId,
      route: `${trip.pickupLocation} → ${trip.destination}`,
      status: trip.tripStatus,
      vehicle: trip.vehicle?.registrationNumber || trip.vehicle?.vehicleNumber || "—",
    });

    const activeTripsList = activeTripVehicles.map(normalizeTrip);
    const currentWeekTrips = weekly.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const previousWeekTrips = Number(previousWeekActivity || 0);
    const activityTrend = previousWeekTrips > 0
      ? ((currentWeekTrips - previousWeekTrips) / previousWeekTrips) * 100
      : currentWeekTrips > 0 ? 100 : 0;
    const operationalVehicles = Math.max(0, totalVehicles - (status.MAINTENANCE || 0) - (status.INACTIVE || 0));
    const fleetHealthPercent = totalVehicles > 0 ? (operationalVehicles / totalVehicles) * 100 : 0;

    return res.json({
      success: true,
      data: {
        vehicles: {
          total: totalVehicles,
          available: status.AVAILABLE || 0,
          onTrip: status.ON_TRIP || 0,
          maintenance: status.MAINTENANCE || 0,
          assigned: status.ASSIGNED || 0,
          inactive: status.INACTIVE || 0,
        },
        drivers: {
          total: totalDrivers,
          available: availableDrivers,
        },
        trips: {
          active: activeTrips,
          completedToday,
          recent: recentTrips.map(normalizeTrip),
          activeList: activeTripsList,
          completedTotal,
        },
        finance: {
          fuelLitresToday: Number(todayFuel[0]?.litres || 0),
          fuelLitresMonth: Number(monthFuel[0]?.litres || 0),
          fuelCostMonth: Number(monthFuel[0]?.amount || 0),
          expensesMonth: Number(monthExpenses[0]?.amount || 0),
          maintenanceMonth: Number(monthMaintenance[0]?.amount || 0),
        },
        weeklyActivity: weekly,
        activityTrend: Number(activityTrend.toFixed(1)),
        fleetHealth: {
          operational: operationalVehicles,
          total: totalVehicles,
          percent: Number(fleetHealthPercent.toFixed(1)),
        },
      },
    });
  } catch (error) {
    console.error("Get public dashboard overview error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load dashboard overview data.",
    });
  }
}

module.exports = { getPublicDashboardOverview };
