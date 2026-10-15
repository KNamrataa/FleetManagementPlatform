/**
 * Read-only database query-plan audit for FleetFlow.
 * Run from backend with: node scripts/auditQueryPlans.js
 * Requires the same MONGO_URI as the application. It does not create, drop,
 * or modify indexes/documents; review output before making index changes.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const Trip = require("../models/Trip");
const TripRequest = require("../models/TripRequest");
const Expense = require("../models/Expense");
const FuelExpense = require("../models/FuelExpense");
const Invoice = require("../models/Invoice");
const TripRating = require("../models/TripRating");
const DriverProfile = require("../models/DriverProfile");
const Vehicle = require("../models/Vehicle");
const MaintenanceSchedule = require("../models/MaintenanceSchedule");
const DailyReportLog = require("../models/DailyReportLog");
const DocumentExpiryNotification = require("../models/DocumentExpiryNotification");
const User = require("../models/User");

const day = 24 * 60 * 60 * 1000;
const now = new Date();
const start = new Date(now.getTime() - 30 * day);
const soon = new Date(now.getTime() + 30 * day);

function getWinningPlan(explain) {
  const stats = explain?.executionStats || {};
  let winningPlan = explain?.queryPlanner?.winningPlan;
  while (winningPlan?.inputStage) winningPlan = winningPlan.inputStage;
  return {
    stage: winningPlan?.stage || explain?.queryPlanner?.winningPlan?.stage || "UNKNOWN",
    indexName: winningPlan?.indexName || null,
    nReturned: stats.nReturned ?? null,
    totalKeysExamined: stats.totalKeysExamined ?? null,
    totalDocsExamined: stats.totalDocsExamined ?? null,
    executionTimeMillis: stats.executionTimeMillis ?? null,
  };
}

async function audit(label, query) {
  try {
    const explain = await query.explain("executionStats");
    const result = getWinningPlan(explain);
    console.log(`${label}: ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`${label}: ERROR ${String(error?.message || error).slice(0, 300)}`);
  }
}

async function listIndexes(Model) {
  try {
    const indexes = await Model.collection.listIndexes().toArray();
    const seen = new Map();
    const duplicates = [];
    for (const index of indexes) {
      const key = JSON.stringify(index.key);
      if (seen.has(key)) duplicates.push({ key: index.key, names: [seen.get(key), index.name] });
      else seen.set(key, index.name);
    }
    console.log(`INDEXES ${Model.collection.collectionName}: ${JSON.stringify(indexes.map(i => ({ name: i.name, key: i.key, unique: Boolean(i.unique), sparse: Boolean(i.sparse), expireAfterSeconds: i.expireAfterSeconds })))}`);
    if (duplicates.length) console.log(`EXACT_DUPLICATE_INDEX_KEYS ${Model.collection.collectionName}: ${JSON.stringify(duplicates)}`);
  } catch (error) {
    console.log(`INDEXES ${Model.collection.collectionName}: ERROR ${String(error?.message || error).slice(0, 300)}`);
  }
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing; configure the backend .env before running this audit.");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: Math.max(1000, Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000),
    maxPoolSize: 3,
  });
  console.log("FleetFlow query-plan audit (read-only). Use representative production-like data for meaningful results.");

  const sampleFuelExpense = await FuelExpense.findOne({ vehicle: { $ne: null } }).select("vehicle").lean();
  const fuelVehicleId = sampleFuelExpense?.vehicle || new mongoose.Types.ObjectId();
  if (!sampleFuelExpense) console.log("Fuel query-plan note: no fuel expense with a vehicle reference was found; using a valid sample ObjectId, so this plan checks index selection but not a matching-data workload.");

  const plans = [
    ["Trip recent dashboard/status", Trip.find({ createdAt: { $gte: start }, tripStatus: { $in: ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"] } }).sort({ createdAt: -1 }).limit(50)],
    ["TripRequest pending queue", TripRequest.find({ status: { $in: ["PENDING", "REVIEWED", "ACCEPTED"] } }).sort({ createdAt: -1 }).limit(50)],
    ["Expense date/status analytics", Expense.find({ expenseDate: { $gte: start, $lte: now }, status: { $in: ["APPROVED", "PAID"] } }).sort({ expenseDate: -1 }).limit(100)],
    ["Fuel expense by vehicle/date", FuelExpense.find({ vehicle: fuelVehicleId, fuelDate: { $gte: start, $lte: now } }).sort({ fuelDate: -1 }).limit(50)],
    ["Invoice date/status analytics", Invoice.find({ invoiceDate: { $gte: start, $lte: now }, status: { $in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PAID"] } }).sort({ invoiceDate: -1 }).limit(100)],
    ["Trip rating date analytics", TripRating.find({ createdAt: { $gte: start, $lte: now } }).sort({ createdAt: -1 }).limit(100)],
    ["Driver license expiry scan", DriverProfile.find({ licenseExpiry: { $ne: null, $lte: soon } }).select("user licenseExpiry").limit(500)],
    ["Vehicle document expiry scan", Vehicle.find({ "documents.expiryDate": { $ne: null, $lte: soon } }).select("registrationNumber documents").limit(500)],
    ["Upcoming maintenance schedules", MaintenanceSchedule.find({ nextServiceDate: { $gte: now, $lte: soon } }).sort({ nextServiceDate: 1 }).limit(100)],
    ["Daily report delivery lookup", DailyReportLog.find({ reportType: "FLEET_MANAGER", reportDate: "2000-01-01", recipient: new mongoose.Types.ObjectId() }).limit(1)],
    ["Pending expiry email retry", DocumentExpiryNotification.find({ emailSent: false }).sort({ updatedAt: 1 }).limit(100)],
    ["Active role lookup", User.find({ role: "FLEET_MANAGER", isActive: true, accountStatus: "ACTIVE" }).select("_id").limit(100)],
  ];

  for (const [label, query] of plans) await audit(label, query);
  for (const Model of [Trip, TripRequest, Expense, FuelExpense, Invoice, TripRating, DriverProfile, Vehicle, MaintenanceSchedule, DailyReportLog, DocumentExpiryNotification, User]) {
    await listIndexes(Model);
  }
  console.log("Interpretation: prefer IXSCAN over COLLSCAN for selective filters; compare totalDocsExamined with nReturned. Do not remove indexes solely from this report—check $indexStats, write cost, and real workload first.");
}

main().catch(error => {
  console.error(`Query-plan audit failed: ${String(error?.message || error).slice(0, 500)}`);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
