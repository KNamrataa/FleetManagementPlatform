const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const DriverProfile = require("../models/DriverProfile");
const Trip = require("../models/Trip");
const Invoice = require("../models/Invoice");
const FuelExpense = require("../models/FuelExpense");
const TripExpense = require("../models/TripExpense");
const DriverExpense = require("../models/DriverExpense");
const Expense = require("../models/Expense");
const MaintenanceRecord = require("../models/MaintenanceRecord");
const MaintenanceWorkOrder = require("../models/MaintenanceWorkOrder");
const VehicleIssue = require("../models/VehicleIssue");

const revenueStatuses = ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"];
const n = (v) => Number(v || 0);

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lastSixMonths() {
  const result = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      key: monthKey(d),
      label: d.toLocaleString("en-IN", { month: "short" }),
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return result;
}

function mapGrouped(rows) {
  return new Map(rows.map((row) => [String(row._id), row]));
}

function safeDateDiff(start, end) {
  if (!start || !end) return null;
  const value = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(1)) : null;
}

async function getManagementDashboard(req, res) {
  try {
    const months = lastSixMonths();
    const startDate = new Date(months[0].year, months[0].month, 1);

    const [
      vehicleStatus,
      driverStatus,
      tripStatus,
      totalDrivers,
      totalCustomers,
      activeCustomers,
      totalUsers,
      activeUsers,
      invoiceSummary,
      outstandingInvoices,
      fuelTotal,
      maintenanceTotal,
      tripExpenseTotal,
      driverExpenseTotal,
      otherExpenseTotal,
      monthlyRevenue,
      monthlyFuel,
      monthlyMaintenance,
      monthlyTrip,
      monthlyDriver,
      monthlyOther,
      recentTrips,
      recentMaintenance,
      recentExpenses,
      recentIssues,
      activeWorkOrders,
      serviceDueVehicles,
      topCostVehicles,
      vehicles,
      drivers,
      allTrips,
      vehicleTrips,
      vehicleFuel,
      vehicleMaintenance,
      vehicleTripExpenses,
      vehicleDriverExpenses,
      driverTrips,
      driverTripExpenses,
      driverExpenses,
      tripInvoices,
      tripFuel,
      tripExpenses,
      tripDriverExpenses,
      tripOtherExpenses,
      customerTrips,
      customerRevenue,
      customerInvoices,
      currentMonthFuel,
      currentMonthMaintenance,
      maintenanceServiceCount,
      currentMonthTripExpenses,
      currentMonthDriverExpenses,
      currentMonthOtherExpenses,
    ] = await Promise.all([
      Vehicle.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      DriverProfile.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Trip.aggregate([{ $group: { _id: "$tripStatus", count: { $sum: 1 } } }]),
      User.countDocuments({ role: "DRIVER" }),
      User.countDocuments({ role: "CUSTOMER" }),
      User.countDocuments({ role: "CUSTOMER", isActive: true, accountStatus: { $ne: "INACTIVE" } }),
      User.countDocuments({}),
      User.countDocuments({ isActive: true, accountStatus: { $ne: "INACTIVE" } }),
      Invoice.aggregate([
        { $match: { status: { $in: revenueStatuses } } },
        { $group: { _id: null, revenue: { $sum: "$totalAmount" }, paid: { $sum: "$paidAmount" }, outstanding: { $sum: "$balanceAmount" } } },
      ]),
      Invoice.find({ balanceAmount: { $gt: 0 }, status: { $nin: ["DRAFT", "CANCELLED", "PAID"] } })
        .populate("customer", "fullName")
        .populate("trip", "tripId")
        .sort({ dueDate: 1 })
        .limit(8)
        .lean(),
      FuelExpense.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      MaintenanceRecord.aggregate([{ $group: { _id: null, total: { $sum: "$totalCost" } } }]),
      TripExpense.aggregate([{ $match: { status: { $ne: "REJECTED" } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      DriverExpense.aggregate([{ $match: { status: { $ne: "REJECTED" } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Expense.aggregate([{ $match: { category: { $nin: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER_ALLOWANCE"] }, status: { $ne: "REJECTED" } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Invoice.aggregate([{ $match: { invoiceDate: { $gte: startDate }, status: { $in: revenueStatuses } } }, { $group: { _id: { y: { $year: "$invoiceDate" }, m: { $month: "$invoiceDate" } }, total: { $sum: "$totalAmount" } } }]),
      FuelExpense.aggregate([{ $match: { fuelDate: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      MaintenanceRecord.aggregate([{ $match: { completionDate: { $gte: startDate } } }, { $group: { _id: { y: { $year: "$completionDate" }, m: { $month: "$completionDate" } }, total: { $sum: "$totalCost" } } }]),
      TripExpense.aggregate([{ $match: { expenseDate: { $gte: startDate }, status: { $ne: "REJECTED" } } }, { $group: { _id: { y: { $year: "$expenseDate" }, m: { $month: "$expenseDate" } }, total: { $sum: "$amount" } } }]),
      DriverExpense.aggregate([{ $match: { expenseDate: { $gte: startDate }, status: { $ne: "REJECTED" } } }, { $group: { _id: { y: { $year: "$expenseDate" }, m: { $month: "$expenseDate" } }, total: { $sum: "$amount" } } }]),
      Expense.aggregate([{ $match: { expenseDate: { $gte: startDate }, category: { $nin: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER_ALLOWANCE"] }, status: { $ne: "REJECTED" } } }, { $group: { _id: { y: { $year: "$expenseDate" }, m: { $month: "$expenseDate" } }, total: { $sum: "$amount" } } }]),
      Trip.find({}).populate("customer", "fullName").populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status").populate("driver", "fullName email").sort({ updatedAt: -1 }).limit(8).lean(),
      MaintenanceRecord.find({}).populate("vehicle", "registrationNumber vehicleNumber").sort({ completionDate: -1 }).limit(6).lean(),
      Expense.find({}).populate("vehicle", "registrationNumber vehicleNumber").sort({ createdAt: -1 }).limit(6).lean(),
      VehicleIssue.find({}).populate("vehicle", "registrationNumber vehicleNumber").populate("reportedBy", "fullName").sort({ createdAt: -1 }).limit(6).lean(),
      MaintenanceWorkOrder.find({ status: { $in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } }).populate("vehicle", "registrationNumber vehicleNumber status").sort({ createdAt: -1 }).limit(6).lean(),
      Vehicle.aggregate([
        { $lookup: { from: "maintenanceschedules", localField: "_id", foreignField: "vehicle", as: "schedules" } },
        { $unwind: "$schedules" },
        { $match: { $or: [{ "schedules.status": { $in: ["DUE", "OVERDUE", "DUE_SOON"] } }, { $expr: { $lte: ["$schedules.nextServiceOdometer", "$currentOdometer"] } }] } },
        { $project: { registrationNumber: 1, vehicleNumber: 1, currentOdometer: 1, schedule: "$schedules" } },
        { $limit: 8 },
      ]),
      MaintenanceRecord.aggregate([
        { $group: { _id: "$vehicle", totalCost: { $sum: "$totalCost" }, services: { $sum: 1 } } },
        { $sort: { totalCost: -1 } },
        { $limit: 8 },
        { $lookup: { from: "vehicles", localField: "_id", foreignField: "_id", as: "vehicle" } },
        { $unwind: "$vehicle" },
        { $project: { _id: 0, vehicleId: "$_id", registrationNumber: "$vehicle.registrationNumber", vehicleNumber: "$vehicle.vehicleNumber", totalCost: 1, services: 1 } },
      ]),
      Vehicle.find({}).lean(),
      User.find({ role: "DRIVER" }).select("fullName email isActive accountStatus createdAt").lean(),
      Trip.find({}).populate("customer", "fullName").populate("vehicle", "registrationNumber vehicleNumber").populate("driver", "fullName").lean(),
      Trip.aggregate([{ $match: { vehicle: { $ne: null } } }, { $group: { _id: "$vehicle", trips: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$tripStatus", "COMPLETED"] }, 1, 0] } }, active: { $sum: { $cond: [{ $in: ["$tripStatus", ["ASSIGNED", "IN_PROGRESS", "PAUSED"]] }, 1, 0] } }, distance: { $sum: "$distance" } } }]),
      FuelExpense.aggregate([{ $group: { _id: "$vehicle", total: { $sum: "$totalAmount" }, litres: { $sum: "$litres" } } }]),
      MaintenanceRecord.aggregate([{ $group: { _id: "$vehicle", total: { $sum: "$totalCost" }, services: { $sum: 1 } } }]),
      TripExpense.aggregate([{ $match: { status: { $ne: "REJECTED" } } }, { $group: { _id: "$vehicle", total: { $sum: "$amount" } } }]),
      DriverExpense.aggregate([{ $match: { status: { $ne: "REJECTED" } } }, { $group: { _id: "$vehicle", total: { $sum: "$amount" } } }]),
      Trip.aggregate([{ $match: { driver: { $ne: null } } }, { $group: { _id: "$driver", trips: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$tripStatus", "COMPLETED"] }, 1, 0] } }, active: { $sum: { $cond: [{ $in: ["$tripStatus", ["ASSIGNED", "IN_PROGRESS", "PAUSED"]] }, 1, 0] } }, distance: { $sum: "$distance" } } }]),
      TripExpense.aggregate([{ $match: { status: { $ne: "REJECTED" }, driver: { $ne: null } } }, { $group: { _id: "$driver", total: { $sum: "$amount" } } }]),
      DriverExpense.aggregate([{ $match: { status: { $ne: "REJECTED" }, driver: { $ne: null } } }, { $group: { _id: "$driver", total: { $sum: "$amount" } } }]),
      Invoice.aggregate([{ $match: { trip: { $ne: null }, status: { $in: revenueStatuses } } }, { $group: { _id: "$trip", revenue: { $sum: "$totalAmount" }, paid: { $sum: "$paidAmount" }, outstanding: { $sum: "$balanceAmount" } } }]),
      FuelExpense.aggregate([{ $match: { trip: { $ne: null } } }, { $group: { _id: "$trip", total: { $sum: "$totalAmount" }, litres: { $sum: "$litres" } } }]),
      TripExpense.aggregate([{ $match: { status: { $ne: "REJECTED" }, trip: { $ne: null } } }, { $group: { _id: "$trip", total: { $sum: "$amount" } } }]),
      DriverExpense.aggregate([{ $match: { status: { $ne: "REJECTED" }, trip: { $ne: null } } }, { $group: { _id: "$trip", total: { $sum: "$amount" } } }]),
      Expense.aggregate([{ $match: { status: { $ne: "REJECTED" }, trip: { $ne: null }, category: { $nin: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER_ALLOWANCE"] } } }, { $group: { _id: "$trip", total: { $sum: "$amount" } } }]),
      Trip.aggregate([{ $match: { customer: { $ne: null } } }, { $group: { _id: "$customer", trips: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$tripStatus", "COMPLETED"] }, 1, 0] } }, active: { $sum: { $cond: [{ $in: ["$tripStatus", ["ASSIGNED", "IN_PROGRESS", "PAUSED"]] }, 1, 0] } } } }]),
      Invoice.aggregate([{ $match: { customer: { $ne: null }, status: { $in: revenueStatuses } } }, { $group: { _id: "$customer", revenue: { $sum: "$totalAmount" }, paid: { $sum: "$paidAmount" }, outstanding: { $sum: "$balanceAmount" } } }]),
      Invoice.aggregate([{ $match: { status: { $in: revenueStatuses } } }, { $group: { _id: "$customer", invoices: { $sum: 1 } } }]),
      FuelExpense.aggregate([{ $match: { fuelDate: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      MaintenanceRecord.aggregate([{ $match: { completionDate: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }, { $group: { _id: null, total: { $sum: "$totalCost" } } }]),
      MaintenanceRecord.countDocuments({}),
      TripExpense.aggregate([{ $match: { expenseDate: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }, status: { $ne: "REJECTED" } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      DriverExpense.aggregate([{ $match: { expenseDate: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }, status: { $ne: "REJECTED" } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Expense.aggregate([{ $match: { expenseDate: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }, status: { $ne: "REJECTED" }, category: { $nin: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER_ALLOWANCE"] } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    ]);

    const mapCounts = (rows) => Object.fromEntries(rows.map((x) => [x._id, x.count]));
    const vehiclesByStatus = mapCounts(vehicleStatus);
    const driversByStatus = mapCounts(driverStatus);
    const tripsByStatus = mapCounts(tripStatus);
    const invoice = invoiceSummary[0] || { revenue: 0, paid: 0, outstanding: 0 };
    const fuel = n(fuelTotal[0]?.total);
    const maintenance = n(maintenanceTotal[0]?.total);
    const tripExpensesTotal = n(tripExpenseTotal[0]?.total);
    const driverExpensesTotal = n(driverExpenseTotal[0]?.total);
    const otherExpenses = n(otherExpenseTotal[0]?.total);
    const totalExpenses = fuel + maintenance + tripExpensesTotal + driverExpensesTotal + otherExpenses;

    const keyed = (rows) => Object.fromEntries(rows.map((x) => [`${x._id.y}-${String(x._id.m).padStart(2, "0")}`, n(x.total)]));
    const rev = keyed(monthlyRevenue);
    const fuels = keyed(monthlyFuel);
    const maint = keyed(monthlyMaintenance);
    const tripEx = keyed(monthlyTrip);
    const driverEx = keyed(monthlyDriver);
    const otherEx = keyed(monthlyOther);
    const monthly = months.map((m) => {
      const expense = n(fuels[m.key]) + n(maint[m.key]) + n(tripEx[m.key]) + n(driverEx[m.key]) + n(otherEx[m.key]);
      return { ...m, revenue: n(rev[m.key]), expenses: expense, profit: n(rev[m.key]) - expense, fuel: n(fuels[m.key]), maintenance: n(maint[m.key]), tripExpenses: n(tripEx[m.key]), driverExpenses: n(driverEx[m.key]), otherExpenses: n(otherEx[m.key]) };
    });

    const vehicleTripMap = mapGrouped(vehicleTrips);
    const vehicleFuelMap = mapGrouped(vehicleFuel);
    const vehicleMaintenanceMap = mapGrouped(vehicleMaintenance);
    const vehicleTripExpenseMap = mapGrouped(vehicleTripExpenses);
    const vehicleDriverExpenseMap = mapGrouped(vehicleDriverExpenses);
    const vehiclePerformance = vehicles.map((vehicle) => {
      const id = String(vehicle._id);
      const trip = vehicleTripMap.get(id) || {};
      const fuelRow = vehicleFuelMap.get(id) || {};
      const maintRow = vehicleMaintenanceMap.get(id) || {};
      const tripExpenseRow = vehicleTripExpenseMap.get(id) || {};
      const driverExpenseRow = vehicleDriverExpenseMap.get(id) || {};
      const operatingCost = n(fuelRow.total) + n(maintRow.total) + n(tripExpenseRow.total) + n(driverExpenseRow.total);
      const utilization = trip.trips ? (n(trip.distance) > 0 ? n(trip.distance) : n(trip.completed)) : 0;
      return {
        vehicleId: vehicle._id,
        vehicleNumber: vehicle.vehicleNumber,
        registrationNumber: vehicle.registrationNumber,
        vehicleType: vehicle.vehicleType,
        make: vehicle.make,
        model: vehicle.model,
        status: vehicle.status,
        currentOdometer: n(vehicle.currentOdometer),
        trips: n(trip.trips),
        completedTrips: n(trip.completed),
        activeTrips: n(trip.active),
        totalDistance: n(trip.distance),
        fuelCost: n(fuelRow.total),
        fuelLitres: n(fuelRow.litres),
        maintenanceCost: n(maintRow.total),
        tripExpenses: n(tripExpenseRow.total),
        driverExpenses: n(driverExpenseRow.total),
        operatingCost,
        costPerTrip: trip.trips ? operatingCost / trip.trips : 0,
        completionRate: trip.trips ? (n(trip.completed) / trip.trips) * 100 : 0,
        utilizationScore: utilization,
      };
    }).sort((a, b) => b.trips - a.trips || b.operatingCost - a.operatingCost);

    const driverTripMap = mapGrouped(driverTrips);
    const driverTripExpenseMap = mapGrouped(driverTripExpenses);
    const driverExpenseMap = mapGrouped(driverExpenses);
    const driverPerformance = drivers.map((driver) => {
      const id = String(driver._id);
      const trip = driverTripMap.get(id) || {};
      const tripExpense = driverTripExpenseMap.get(id) || {};
      const driverExpense = driverExpenseMap.get(id) || {};
      const totalExpense = n(tripExpense.total) + n(driverExpense.total);
      return {
        driverId: driver._id,
        name: driver.fullName || "Unnamed Driver",
        email: driver.email || "—",
        trips: n(trip.trips),
        completedTrips: n(trip.completed),
        activeTrips: n(trip.active),
        totalDistance: n(trip.distance),
        tripExpenses: n(tripExpense.total),
        driverExpenses: n(driverExpense.total),
        totalExpense,
        completionRate: trip.trips ? (n(trip.completed) / trip.trips) * 100 : 0,
        accountActive: driver.isActive !== false && driver.accountStatus !== "INACTIVE",
      };
    }).sort((a, b) => b.completedTrips - a.completedTrips || b.trips - a.trips);

    const tripInvoiceMap = mapGrouped(tripInvoices);
    const tripFuelMap = mapGrouped(tripFuel);
    const tripExpenseMap = mapGrouped(tripExpenses);
    const tripDriverExpenseMap = mapGrouped(tripDriverExpenses);
    const tripOtherExpenseMap = mapGrouped(tripOtherExpenses);
    const tripPerformance = allTrips.map((trip) => {
      const id = String(trip._id);
      const inv = tripInvoiceMap.get(id) || {};
      const fuelRow = tripFuelMap.get(id) || {};
      const tripExpenseRow = tripExpenseMap.get(id) || {};
      const driverExpenseRow = tripDriverExpenseMap.get(id) || {};
      const otherExpenseRow = tripOtherExpenseMap.get(id) || {};
      const expenses = n(fuelRow.total) + n(tripExpenseRow.total) + n(driverExpenseRow.total) + n(otherExpenseRow.total);
      const revenue = n(inv.revenue);
      return {
        tripId: trip.tripId,
        tripObjectId: trip._id,
        customer: trip.customer?.fullName || "—",
        pickup: trip.pickupLocation,
        destination: trip.destination,
        driver: trip.driver?.fullName || "Unassigned",
        vehicle: trip.vehicle?.registrationNumber || trip.vehicle?.vehicleNumber || "Unassigned",
        status: trip.tripStatus,
        scheduledStart: trip.scheduledStart,
        actualStart: trip.actualStart,
        actualEnd: trip.actualEnd,
        durationHours: safeDateDiff(trip.actualStart, trip.actualEnd),
        distance: n(trip.distance),
        revenue,
        paidRevenue: n(inv.paid),
        outstanding: n(inv.outstanding),
        fuelCost: n(fuelRow.total),
        tripExpenses: n(tripExpenseRow.total),
        driverExpenses: n(driverExpenseRow.total),
        otherExpenses: n(otherExpenseRow.total),
        totalExpenses: expenses,
        profit: revenue - expenses,
        costPerKm: trip.distance > 0 ? expenses / trip.distance : 0,
      };
    }).sort((a, b) => new Date(b.scheduledStart || 0) - new Date(a.scheduledStart || 0));

    const customerTripMap = mapGrouped(customerTrips);
    const customerRevenueMap = mapGrouped(customerRevenue);
    const customerInvoiceMap = mapGrouped(customerInvoices);
    const customerIds = new Set([...customerTripMap.keys(), ...customerRevenueMap.keys(), ...customerInvoiceMap.keys()]);
    const customerUsers = await User.find({ _id: { $in: [...customerIds] } }).select("fullName email isActive accountStatus").lean();
    const customerUserMap = new Map(customerUsers.map((customer) => [String(customer._id), customer]));
    const customerPerformance = [...customerIds].map((id) => {
      const trip = customerTripMap.get(id) || {};
      const revenue = customerRevenueMap.get(id) || {};
      const invoiceCount = customerInvoiceMap.get(id) || {};
      const customer = customerUserMap.get(id) || {};
      return {
        customerId: id,
        name: customer.fullName || "Customer",
        email: customer.email || "—",
        trips: n(trip.trips),
        activeTrips: n(trip.active),
        completedTrips: n(trip.completed),
        invoices: n(invoiceCount.invoices),
        revenue: n(revenue.revenue),
        paid: n(revenue.paid),
        outstanding: n(revenue.outstanding),
        accountActive: customer.isActive !== false && customer.accountStatus !== "INACTIVE",
      };
    }).sort((a, b) => b.revenue - a.revenue || b.trips - a.trips);

    const currentMonth = {
      fuel: n(currentMonthFuel[0]?.total),
      maintenance: n(currentMonthMaintenance[0]?.total),
      tripExpenses: n(currentMonthTripExpenses[0]?.total),
      driverExpenses: n(currentMonthDriverExpenses[0]?.total),
      otherExpenses: n(currentMonthOtherExpenses[0]?.total),
    };

    const activity = [
      ...recentTrips.map((t) => ({ date: t.updatedAt || t.createdAt, type: "TRIP", text: `Trip ${t.tripId} is ${String(t.tripStatus || "updated").replaceAll("_", " ")}` })),
      ...recentMaintenance.map((m) => ({ date: m.completionDate || m.createdAt, type: "MAINTENANCE", text: `Maintenance completed for ${m.vehicle?.registrationNumber || m.vehicle?.vehicleNumber || "vehicle"}` })),
      ...recentExpenses.map((e) => ({ date: e.createdAt || e.expenseDate, type: "EXPENSE", text: `${e.category} expense of ₹${n(e.amount).toLocaleString("en-IN")}` })),
      ...recentIssues.map((i) => ({ date: i.createdAt, type: "ISSUE", text: `Vehicle issue reported for ${i.vehicle?.registrationNumber || i.vehicle?.vehicleNumber || "vehicle"}` })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    const totalFleetDistance = vehiclePerformance.reduce((sum, item) => sum + n(item.totalDistance), 0);
    const totalVehicleOperatingCost = vehiclePerformance.reduce((sum, item) => sum + n(item.operatingCost), 0);
    const completedTripCount = tripPerformance.filter((item) => item.status === "COMPLETED").length;
    const totalTripCount = tripPerformance.length;

    res.json({
      success: true,
      kpis: {
        totalVehicles: Object.values(vehiclesByStatus).reduce((a, b) => a + b, 0),
        availableVehicles: vehiclesByStatus.AVAILABLE || 0,
        vehiclesOnTrip: vehiclesByStatus.ON_TRIP || 0,
        vehiclesInMaintenance: vehiclesByStatus.MAINTENANCE || 0,
        totalDrivers,
        availableDrivers: driversByStatus.AVAILABLE || 0,
        driversOnTrip: driversByStatus.ON_TRIP || 0,
        activeTrips: (tripsByStatus.ASSIGNED || 0) + (tripsByStatus.IN_PROGRESS || 0) + (tripsByStatus.PAUSED || 0),
        scheduledTrips: tripsByStatus.SCHEDULED || 0,
        completedTrips: tripsByStatus.COMPLETED || 0,
        cancelledTrips: tripsByStatus.CANCELLED || 0,
        totalCustomers,
        activeCustomers,
        totalUsers,
        activeUsers,
        revenue: n(invoice.revenue),
        paidRevenue: n(invoice.paid),
        outstandingReceivables: n(invoice.outstanding),
        totalExpenses,
        netProfit: n(invoice.revenue) - totalExpenses,
        fuelCost: fuel,
        maintenanceCost: maintenance,
        tripExpenses: tripExpensesTotal,
        driverExpenses: driverExpensesTotal,
        otherExpenses,
      },
      vehicleStatus: vehiclesByStatus,
      driverStatus: driversByStatus,
      tripStatus: tripsByStatus,
      monthly,
      outstandingInvoices,
      activeWorkOrders,
      serviceDueVehicles,
      topCostVehicles,
      activity,
      vehiclePerformance,
      driverPerformance,
      tripPerformance,
      customerPerformance,
      financialReports: {
        currentMonth,
        sixMonthRevenue: monthly.reduce((sum, item) => sum + n(item.revenue), 0),
        sixMonthExpenses: monthly.reduce((sum, item) => sum + n(item.expenses), 0),
        sixMonthProfit: monthly.reduce((sum, item) => sum + n(item.profit), 0),
        categories: [
          { key: "fuel", label: "Fuel", value: fuel },
          { key: "maintenance", label: "Maintenance", value: maintenance },
          { key: "trip", label: "Trip Expenses", value: tripExpensesTotal },
          { key: "driver", label: "Driver Expenses", value: driverExpensesTotal },
          { key: "other", label: "Other Expenses", value: otherExpenses },
        ],
        reports: {
          fleet: { vehicles: vehicles.length, distance: totalFleetDistance, operatingCost: totalVehicleOperatingCost },
          driver: { drivers: driverPerformance.length, trips: driverPerformance.reduce((sum, item) => sum + item.trips, 0), completedTrips: driverPerformance.reduce((sum, item) => sum + item.completedTrips, 0) },
          trip: { trips: totalTripCount, completedTrips: completedTripCount, completionRate: totalTripCount ? (completedTripCount / totalTripCount) * 100 : 0 },
          fuel: { totalCost: fuel, currentMonthCost: currentMonth.fuel, litres: vehiclePerformance.reduce((sum, item) => sum + item.fuelLitres, 0) },
          maintenance: { totalCost: maintenance, currentMonthCost: currentMonth.maintenance, services: maintenanceServiceCount },
          expense: { totalCost: totalExpenses, currentMonthCost: Object.values(currentMonth).reduce((sum, item) => sum + n(item), 0) },
        },
      },
    });
  } catch (error) {
    console.error("Management dashboard error:", error);
    res.status(500).json({ success: false, message: "Unable to load management dashboard." });
  }
}

module.exports = { getManagementDashboard };
