const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const Trip = require("../models/Trip");
const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const FuelExpense = require("../models/FuelExpense");
const Payment = require("../models/Payment");
const Budget = require("../models/Budget");
const MaintenanceSchedule = require("../models/MaintenanceSchedule");
const MaintenanceWorkOrder = require("../models/MaintenanceWorkOrder");
const MaintenanceRecord = require("../models/MaintenanceRecord");
const VehicleIssue = require("../models/VehicleIssue");
const TripRating = require("../models/TripRating");

const n = value => Number(value || 0);
const istDateKey = date => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const shiftDateKey = (key, offsetDays) => {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
};
const parseISTDay = (key, end = false) => new Date(`${key}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`);
const percentChange = (current, previous) => previous ? Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1)) : (current ? 100 : 0);

function resolveRange(startValue, endValue) {
  const todayKey = istDateKey(new Date());
  const endKey = endValue || todayKey;
  const startKey = startValue || shiftDateKey(endKey, -6);
  const start = parseISTDay(startKey, false);
  const end = parseISTDay(endKey, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey) ||
      Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    const error = new Error("Invalid analytics date range. startDate must be before endDate.");
    error.status = 400;
    throw error;
  }
  const days = Math.max(1, Math.round((end.getTime() - start.getTime() + 1) / 86400000));
  return { start, end, previousStart: new Date(start.getTime() - days * 86400000), previousEnd: new Date(start.getTime() - 1), days };
}
const total = async (Model, match, field) => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: null, value: { $sum: `$${field}` } } }]);
  return n(rows[0]?.value);
};
const countStatuses = async (Model, field, match = {}) => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map(row => [String(row._id || "UNKNOWN"), row.count]));
};

async function buildAnalytics({ startDate, endDate, role = "SUPER_ADMIN" } = {}) {
  const range = resolveRange(startDate, endDate);
  const { start, end, previousStart, previousEnd } = range;
  const dateMatch = { $gte: start, $lte: end };
  const previousDateMatch = { $gte: previousStart, $lte: previousEnd };
  const isFleet = role === "FLEET_MANAGER";
  const isFinance = role === "FINANCE_MANAGER";
  const isMaintenance = role === "MAINTENANCE_MANAGER";
  const isTrips = role === "TRIP_MANAGER" || role === "DISPATCHER";
  const isExecutive = !isFleet && !isFinance && !isMaintenance && !isTrips;

  const base = {
    reportRange: { startDate: start, endDate: end, days: range.days },
    generatedAt: new Date(),
    role,
    comparisons: {},
    alerts: [],
  };

  const [vehicleTotal, vehicleStatuses, driverTotal, tripStatuses, tripsInPeriod, previousTrips, documentVehicles,
    openWorkOrders, overdueSchedules, maintenanceCost, previousMaintenanceCost, expenses, previousExpenses,
    nativeFuelCost, previousNativeFuelCost, legacyFuelCost, previousLegacyFuelCost,
    revenue, previousRevenue, outstandingInvoices, overdueInvoices, paymentReceived, budgets, ratings, openIssues] = await Promise.all([
    Vehicle.countDocuments(),
    countStatuses(Vehicle, "status"),
    User.countDocuments({ role: "DRIVER", isActive: true, accountStatus: { $ne: "INACTIVE" } }),
    countStatuses(Trip, "tripStatus"),
    Trip.countDocuments({ createdAt: dateMatch }),
    Trip.countDocuments({ createdAt: previousDateMatch }),
    Vehicle.find({ documents: { $elemMatch: { expiryDate: { $ne: null, $lte: new Date(end.getTime() + 30 * 86400000) } } } }).select("registrationNumber vehicleNumber documents").lean(),
    MaintenanceWorkOrder.countDocuments({ status: { $in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } }),
    MaintenanceSchedule.countDocuments({ status: { $ne: "COMPLETED" }, nextServiceDate: { $lte: end } }),
    total(MaintenanceRecord, { completionDate: dateMatch }, "totalCost"),
    total(MaintenanceRecord, { completionDate: previousDateMatch }, "totalCost"),
    total(Expense, { expenseDate: dateMatch }, "amount"),
    total(Expense, { expenseDate: previousDateMatch }, "amount"),
    total(FuelExpense, { fuelDate: dateMatch }, "totalAmount"),
    total(FuelExpense, { fuelDate: previousDateMatch }, "totalAmount"),
    total(Expense, { category: "FUEL", expenseDate: dateMatch }, "amount"),
    total(Expense, { category: "FUEL", expenseDate: previousDateMatch }, "amount"),
    total(Invoice, { invoiceDate: dateMatch, status: { $in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } }, "totalAmount"),
    total(Invoice, { invoiceDate: previousDateMatch, status: { $in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } }, "totalAmount"),
    Invoice.countDocuments({ status: { $in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] }, balanceAmount: { $gt: 0 } }),
    Invoice.countDocuments({ status: "OVERDUE" }),
    total(Payment, { type: "RECEIVED", status: "COMPLETED", paymentDate: dateMatch }, "amount"),
    Budget.find({ status: { $in: ["ACTIVE", "EXCEEDED"] }, startDate: { $lte: end }, endDate: { $gte: start } }).select("budgetName category allocatedAmount spentAmount status").lean(),
    TripRating.aggregate([{ $match: { createdAt: dateMatch } }, { $group: { _id: null, averageDriverRating: { $avg: "$driverRating" }, averageServiceRating: { $avg: "$serviceRating" }, count: { $sum: 1 } } }]),
    VehicleIssue.countDocuments({ status: { $in: ["OPEN", "IN_REVIEW", "IN_PROGRESS"] } }),
  ]);

  const [dailyTrips, dailyExpenses, dailyRevenue, expenseCategories, maintenanceTrend] = await Promise.all([
    Trip.aggregate([
      { $match: { createdAt: dateMatch } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$tripStatus", "COMPLETED"] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    Expense.aggregate([
      { $match: { expenseDate: dateMatch } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$expenseDate", timezone: "Asia/Kolkata" } }, amount: { $sum: "$amount" } } },
      { $sort: { _id: 1 } },
    ]),
    Invoice.aggregate([
      { $match: { invoiceDate: dateMatch, status: { $in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate", timezone: "Asia/Kolkata" } }, amount: { $sum: "$totalAmount" } } },
      { $sort: { _id: 1 } },
    ]),
    Expense.aggregate([
      { $match: { expenseDate: dateMatch } },
      { $group: { _id: { $ifNull: ["$category", "OTHER"] }, amount: { $sum: "$amount" } } },
      { $sort: { amount: -1 } },
    ]),
    MaintenanceRecord.aggregate([
      { $match: { completionDate: dateMatch } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$completionDate", timezone: "Asia/Kolkata" } }, amount: { $sum: "$totalCost" }, jobs: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const trendDateKeys = [...new Set([...dailyTrips, ...dailyExpenses, ...dailyRevenue, ...maintenanceTrend].map(row => row._id))].sort();
  const chartData = {
    dailyTrends: trendDateKeys.map(date => ({
      date,
      trips: n(dailyTrips.find(x => x._id === date)?.count),
      completedTrips: n(dailyTrips.find(x => x._id === date)?.completed),
      expenses: n(dailyExpenses.find(x => x._id === date)?.amount),
      revenue: n(dailyRevenue.find(x => x._id === date)?.amount),
    })),
    expenseCategories: expenseCategories.map(row => ({ label: String(row._id || "OTHER").replaceAll("_", " "), value: n(row.amount) })),
    tripStatuses: Object.entries(tripStatuses).map(([label, value]) => ({ label: label.replaceAll("_", " "), value })),
    vehicleStatuses: Object.entries(vehicleStatuses).map(([label, value]) => ({ label: label.replaceAll("_", " "), value })),
    maintenanceTrend: maintenanceTrend.map(row => ({ date: row._id, cost: n(row.amount), jobs: n(row.jobs) })),
  };
  const trips = await Trip.find({ createdAt: dateMatch }).select("tripStatus scheduledStart scheduledEnd actualEnd routePerformance routeOptimization distance").lean();
  const completedTrips = trips.filter(t => t.tripStatus === "COMPLETED").length;
  const delayedTrips = trips.filter(t => {
    if (!t.actualEnd || !t.scheduledEnd || t.tripStatus !== "COMPLETED") return false;
    return new Date(t.actualEnd) > new Date(t.scheduledEnd);
  }).length;
  const unassignedTrips = await Trip.countDocuments({ tripStatus: { $in: ["SCHEDULED", "ASSIGNED"] }, $or: [{ driver: null }, { vehicle: null }] });
  const expiringDocuments = [];
  for (const vehicle of documentVehicles) {
    for (const doc of vehicle.documents || []) {
      if (!doc.expiryDate) continue;
      const expiry = new Date(doc.expiryDate);
      if (expiry <= new Date(end.getTime() + 30 * 86400000)) {
        expiringDocuments.push({ vehicle: vehicle.registrationNumber || vehicle.vehicleNumber || "Unknown vehicle", type: doc.documentType || "Document", expiryDate: expiry });
      }
    }
  }
  const budgetUtilization = budgets.map(b => ({
    name: b.budgetName || b.category || "Unnamed budget",
    category: b.category || "OTHER",
    allocated: n(b.allocatedAmount),
    spent: n(b.spentAmount),
    remaining: n(b.allocatedAmount) - n(b.spentAmount),
    usagePercent: n(b.allocatedAmount) > 0 ? Number((n(b.spentAmount) / n(b.allocatedAmount) * 100).toFixed(1)) : 0,
  }));
  const budgetWarnings = budgetUtilization.filter(b => b.allocated > 0 && b.usagePercent >= 80);
  const rating = ratings[0] || { averageDriverRating: 0, averageServiceRating: 0, count: 0 };

  const common = {
    fleet: { totalVehicles: vehicleTotal, vehicleStatuses, activeDrivers: driverTotal, openMaintenanceOrders: openWorkOrders, overdueServices: overdueSchedules, openVehicleIssues: openIssues, documentsExpiringWithin30Days: expiringDocuments.length },
    trips: { tripsCreated: tripsInPeriod, previousPeriodTrips: previousTrips, statuses: tripStatuses, completedInPeriod: completedTrips, delayedCompletedTrips: delayedTrips, currentlyUnassigned: unassignedTrips, completionRate: trips.length ? Number((completedTrips / trips.length * 100).toFixed(1)) : 0 },
    finance: {
      revenue,
      previousPeriodRevenue: previousRevenue,
      expenses: expenses + nativeFuelCost,
      previousPeriodExpenses: previousExpenses + previousNativeFuelCost,
      fuelCost: nativeFuelCost + legacyFuelCost,
      previousPeriodFuelCost: previousNativeFuelCost + previousLegacyFuelCost,
      profitEstimate: revenue - expenses - nativeFuelCost - maintenanceCost,
      maintenanceCost,
      previousPeriodMaintenanceCost: previousMaintenanceCost,
      cashReceived: paymentReceived,
      outstandingInvoices,
      overdueInvoices,
      budgetWarnings,
      budgetUtilization,
    },
    customer: { averageDriverRating: Number(n(rating.averageDriverRating).toFixed(2)), averageServiceRating: Number(n(rating.averageServiceRating).toFixed(2)), ratingsCount: n(rating.count) },
    alerts: [],
  };
  common.comparisons = {
    trips: { current: tripsInPeriod, previous: previousTrips, changePercent: percentChange(tripsInPeriod, previousTrips) },
    revenue: { current: revenue, previous: previousRevenue, changePercent: percentChange(revenue, previousRevenue) },
    expenses: { current: expenses + nativeFuelCost, previous: previousExpenses + previousNativeFuelCost, changePercent: percentChange(expenses + nativeFuelCost, previousExpenses + previousNativeFuelCost) },
    fuelCost: { current: nativeFuelCost + legacyFuelCost, previous: previousNativeFuelCost + previousLegacyFuelCost, changePercent: percentChange(nativeFuelCost + legacyFuelCost, previousNativeFuelCost + previousLegacyFuelCost) },
    maintenanceCost: { current: maintenanceCost, previous: previousMaintenanceCost, changePercent: percentChange(maintenanceCost, previousMaintenanceCost) },
  };
  if (expiringDocuments.length) common.alerts.push({ severity: "HIGH", message: `${expiringDocuments.length} vehicle document(s) expire within 30 days.`, count: expiringDocuments.length });
  if (overdueSchedules) common.alerts.push({ severity: "HIGH", message: `${overdueSchedules} maintenance service(s) are overdue.`, count: overdueSchedules });
  const upcomingServiceSchedules = await MaintenanceSchedule.find({
    status: { $nin: ["COMPLETED"] },
    nextServiceDate: { $gte: start, $lte: new Date(end.getTime() + 30 * 86400000) },
  }).populate("vehicle", "registrationNumber vehicleNumber make model").sort({ nextServiceDate: 1 }).limit(50).lean();
  const serviceScheduleAlerts = upcomingServiceSchedules.map(schedule => {
    const vehicle = schedule.vehicle || {};
    const vehicleName = vehicle.registrationNumber || vehicle.vehicleNumber || [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
    const dueDate = schedule.nextServiceDate ? new Date(schedule.nextServiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "date not set";
    const overdue = schedule.nextServiceDate && new Date(schedule.nextServiceDate) < new Date();
    return { severity: overdue ? "HIGH" : "MEDIUM", message: `${vehicleName} — ${schedule.serviceType || "Scheduled service"} ${overdue ? "is overdue" : "is due"} on ${dueDate}.`, count: 1 };
  });
  if (unassignedTrips) common.alerts.push({ severity: "MEDIUM", message: `${unassignedTrips} trip(s) are waiting for a driver or vehicle.`, count: unassignedTrips });
  if (overdueInvoices) common.alerts.push({ severity: "MEDIUM", message: `${overdueInvoices} invoice(s) are overdue.`, count: overdueInvoices });
  if (budgetWarnings.length) common.alerts.push({ severity: "MEDIUM", message: `${budgetWarnings.length} budget(s) have reached at least 80% of their allocation.`, count: budgetWarnings.length });

  const roleMetrics = isFleet ? { fleet: common.fleet, trips: common.trips, customer: common.customer, alerts: common.alerts.filter(a => /vehicle|maintenance|trip/i.test(a.message)), comparisons: common.comparisons }
    : isFinance ? { finance: common.finance, comparisons: common.comparisons, alerts: common.alerts.filter(a => /invoice|budget/i.test(a.message)) }
    : isMaintenance ? { maintenance: { openWorkOrders: openWorkOrders, overdueServices: overdueSchedules, maintenanceCost, previousPeriodMaintenanceCost: previousMaintenanceCost, openVehicleIssues: openIssues, documentsExpiringWithin30Days: expiringDocuments.length, upcomingServiceSchedules: serviceScheduleAlerts }, alerts: [...serviceScheduleAlerts, ...common.alerts.filter(a => /maintenance/i.test(a.message) && !/document/i.test(a.message))], comparisons: common.comparisons }
    : isTrips ? { trips: common.trips, customer: common.customer, alerts: common.alerts.filter(a => /trip/i.test(a.message)), comparisons: common.comparisons }
    : common;

  return { ...base, ...roleMetrics, chartData, details: { expiringDocuments: expiringDocuments.slice(0, 50), budgetWarnings, budgetUtilization, upcomingServiceSchedules: serviceScheduleAlerts, range: { start, end } } };
}

module.exports = { buildAnalytics, resolveRange };
