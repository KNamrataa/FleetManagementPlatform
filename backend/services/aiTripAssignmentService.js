const TripRequest = require("../models/TripRequest");
const Trip = require("../models/Trip");
const Vehicle = require("../models/Vehicle");
const DriverProfile = require("../models/DriverProfile");
const TripTracking = require("../models/TripTracking");
const MaintenanceSchedule = require("../models/MaintenanceSchedule");
const MaintenanceWorkOrder = require("../models/MaintenanceWorkOrder");
const VehicleIssue = require("../models/VehicleIssue");
const {
  reservePair,
  releasePair,
  hasActiveTripForVehicle,
  hasActiveTripForDriver,
} = require("../utils/fleetHelpers");
const { getRouteEstimate, haversineKm } = require("./routeIntelligenceService");
const { optimizeAndPersistTrip } = require("./routeOptimizationService");

const ACTIVE_STATUSES = ["ASSIGNED", "IN_PROGRESS", "PAUSED", "SCHEDULED"];
const AI_ASSIGNMENT_VERSION = "2.0-rule-engine";
const ROUTE_DEFAULT_SPEED_KMPH = 45;
const MAINTENANCE_DUE_SOON_DAYS = 14;

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function parseRequestedStart(request) {
  const date = new Date(request.requestedDate);
  if (Number.isNaN(date.getTime())) return null;
  if (request.requestedTime && /^\d{1,2}:\d{2}$/.test(request.requestedTime)) {
    const [hours, minutes] = request.requestedTime.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

function calculateEnd(start, request, route) {
  const explicitDuration = Number(request.estimatedDurationMinutes);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return new Date(start.getTime() + explicitDuration * 60 * 1000);
  }
  const routeMinutes = Number(route?.durationMinutes);
  if (Number.isFinite(routeMinutes) && routeMinutes > 0) {
    return new Date(start.getTime() + (routeMinutes + 30) * 60 * 1000);
  }
  const distance = Number(route?.distanceKm);
  if (Number.isFinite(distance) && distance > 0) {
    return new Date(start.getTime() + (distance / ROUTE_DEFAULT_SPEED_KMPH * 60 + 30) * 60 * 1000);
  }
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

function vehicleTypeScore(request, vehicle) {
  const required = normalize(request.vehicleType);
  if (!required) return { score: 12, reason: "No specific vehicle type was requested." };

  const actual = normalize(vehicle.vehicleType);
  if (actual === required) return { score: 15, reason: "Vehicle type exactly matches the request." };
  if (actual.includes(required) || required.includes(actual)) return { score: 11, reason: "Vehicle type is compatible with the requested type." };

  const aliases = {
    suv: ["sport utility vehicle", "muv"],
    sedan: ["car"],
    hatchback: ["car"],
    muv: ["suv", "multi utility vehicle"],
    van: ["minivan", "tempo traveller", "minibus"],
    truck: ["mini truck", "pickup", "lorry"],
    pickup: ["truck", "mini truck"],
    bus: ["minibus", "coach"],
  };
  if ((aliases[required] || []).some(alias => actual.includes(alias))) {
    return { score: 8, reason: "Vehicle type is a compatible alternative." };
  }
  return { score: 0, reason: "Vehicle type does not match the request." };
}

function capacityScore(request, vehicle) {
  const passengers = Number(request.passengerCount) || 0;
  const capacity = Number(vehicle.capacity) || 0;
  if (!passengers) return { score: 10, reason: "No passenger count was specified." };
  if (capacity < passengers) return { score: 0, hardFail: true, reason: `Vehicle capacity (${capacity}) is below the requested ${passengers} passengers.` };

  const spare = capacity - passengers;
  if (spare === 0) return { score: 10, reason: "Vehicle capacity exactly matches the passenger count." };
  if (spare <= 2) return { score: 9, reason: "Vehicle has a close capacity match with minimal unused seats." };
  if (spare <= 4) return { score: 7, reason: "Vehicle has sufficient passenger capacity." };
  return { score: 5, reason: "Vehicle has more capacity than required." };
}

function cargoScore(request, vehicle) {
  const cargoWeight = Number(request.cargoWeight) || 0;
  if (!cargoWeight) return { score: 5, reason: "No cargo weight was specified." };

  const configured = Number(vehicle.payloadCapacityKg) || 0;
  if (configured > 0 && configured < cargoWeight) {
    return { score: 0, hardFail: true, reason: `Vehicle payload capacity (${configured} kg) is below the requested ${cargoWeight} kg.` };
  }
  if (configured > 0) {
    const utilization = cargoWeight / configured;
    if (utilization <= 0.6) return { score: 5, reason: `Payload capacity is suitable for ${cargoWeight} kg of cargo.` };
    if (utilization <= 0.85) return { score: 4, reason: `Payload capacity safely covers ${cargoWeight} kg of cargo.` };
    return { score: 3, reason: `Payload capacity covers ${cargoWeight} kg with limited spare capacity.` };
  }
  return { score: 2, reason: "Cargo was requested, but payload capacity is not configured for this vehicle; verify it before dispatch." };
}

function driverQualificationScore(profile, start) {
  const experience = Math.max(0, Number(profile.experience) || 0);
  const expiry = profile.licenseExpiry ? new Date(profile.licenseExpiry) : null;
  if (!expiry || Number.isNaN(expiry.getTime()) || expiry <= start) {
    return { score: 0, hardFail: true, reason: "Driver license is missing or expires before the requested trip." };
  }
  const yearsScore = Math.min(10, 3 + Math.min(experience, 7));
  return { score: yearsScore + 5, reason: `${experience} year${experience === 1 ? "" : "s"} of driving experience with a valid license for the trip date.` };
}

function driverReliabilityScore(stats) {
  const completed = Number(stats?.completed || 0);
  const cancelled = Number(stats?.cancelled || 0);
  const total = completed + cancelled;
  const onTimeRate = completed > 0 ? Number(stats.onTimeRate || 0) : 80;
  const cancellationRate = total > 0 ? cancelled / total : 0;
  const score = clamp(6 + (onTimeRate / 100) * 3 - cancellationRate * 3, 0, 10);
  const reason = completed > 0
    ? `Driver reliability: ${onTimeRate.toFixed(0)}% on-time completion rate across ${completed} completed trip${completed === 1 ? "" : "s"}.`
    : "No completed-trip history is available yet; a neutral reliability score was used.";
  return { score, reason };
}

function vehicleDocumentHealth(vehicle, now = new Date()) {
  const expiryDates = [];
  if (vehicle.insurance?.expiryDate) expiryDates.push({ label: "Insurance", value: vehicle.insurance.expiryDate });
  if (vehicle.registration?.expiryDate) expiryDates.push({ label: "RC", value: vehicle.registration.expiryDate });
  for (const doc of vehicle.documents || []) {
    if (doc.expiryDate) expiryDates.push({ label: doc.documentType || "Document", value: doc.expiryDate });
  }

  const expired = expiryDates.filter(item => {
    const date = new Date(item.value);
    return !Number.isNaN(date.getTime()) && date < now;
  });
  if (expired.length) return { score: 0, hardFail: true, reason: `Expired vehicle document: ${expired[0].label}.` };

  const dueSoon = expiryDates.some(item => {
    const date = new Date(item.value);
    return !Number.isNaN(date.getTime()) && date.getTime() - now.getTime() <= 30 * 86400000;
  });
  if (dueSoon) return { score: 5, reason: "Vehicle documents are valid but at least one expires within 30 days." };
  return { score: 5, reason: "Vehicle insurance/registration documents are valid for assignment." };
}

function vehicleAgeScore(vehicle) {
  const year = Number(vehicle.year) || new Date().getFullYear();
  const age = Math.max(0, new Date().getFullYear() - year);
  if (age <= 3) return { score: 5, age };
  if (age <= 7) return { score: 4, age };
  if (age <= 12) return { score: 3, age };
  if (age <= 15) return { score: 2, age };
  return { score: 1, age };
}

function efficiencyScore(vehicle, distanceKm) {
  if (!distanceKm) return { score: 4, reason: "Route distance is unavailable, so a neutral efficiency score was used." };
  const fuel = normalize(vehicle.fuelType);
  const efficiency = Number(vehicle.fuelEfficiencyKmPerUnit) || ({
    electric: 6,
    hybrid: 18,
    cng: 14,
    diesel: 13,
    petrol: 11,
  }[fuel] || 10);
  const score = clamp(1 + Math.min(4, efficiency / 6), 0, 5);
  return { score, reason: `Estimated ${efficiency.toFixed(1)} km per fuel/energy unit is suitable for the planned ${distanceKm.toFixed(1)} km route.` };
}

function estimateCost(vehicle, distanceKm) {
  if (!distanceKm) return { cost: null, score: 5, reason: "Trip cost could not be estimated without route distance." };
  const fuel = normalize(vehicle.fuelType);
  const efficiency = Number(vehicle.fuelEfficiencyKmPerUnit) || ({ electric: 6, hybrid: 18, cng: 14, diesel: 13, petrol: 11 }[fuel] || 10);
  const unitPrice = Number(vehicle.fuelCostPerUnit) || ({ electric: 9, hybrid: 95, cng: 85, diesel: 95, petrol: 105 }[fuel] || 100);
  const cost = (distanceKm / efficiency) * unitPrice;
  return { cost, unitPrice, efficiency };
}

function proximityScore(distanceKm) {
  if (distanceKm == null) return { score: 7, reason: "Current driver location is unavailable; a neutral proximity score was used." };
  if (distanceKm <= 3) return { score: 10, reason: `Driver is approximately ${distanceKm.toFixed(1)} km from the pickup area.` };
  if (distanceKm <= 10) return { score: 9, reason: `Driver is approximately ${distanceKm.toFixed(1)} km from the pickup area.` };
  if (distanceKm <= 25) return { score: 7, reason: `Driver is approximately ${distanceKm.toFixed(1)} km from the pickup area.` };
  if (distanceKm <= 50) return { score: 5, reason: `Driver is approximately ${distanceKm.toFixed(1)} km from the pickup area.` };
  return { score: 2, reason: `Driver is approximately ${distanceKm.toFixed(1)} km from the pickup area.` };
}

function priorityScore(priority) {
  if (priority === "URGENT") return { score: 5, reason: "Urgent request: responsiveness is prioritized." };
  if (priority === "HIGH") return { score: 4, reason: "High-priority request: responsiveness is prioritized." };
  if (priority === "LOW") return { score: 2, reason: "Low-priority request: standard scheduling preference applied." };
  return { score: 3, reason: "Normal-priority scheduling preference applied." };
}

async function hasScheduleConflict(field, id, start, end) {
  return Trip.exists({
    [field]: id,
    tripStatus: { $in: ACTIVE_STATUSES },
    scheduledStart: { $lt: end },
    $or: [{ scheduledEnd: null }, { scheduledEnd: { $gt: start } }],
  });
}

async function getDriverStats(driverIds) {
  if (!driverIds.length) return new Map();
  const rows = await Trip.aggregate([
    { $match: { driver: { $in: driverIds }, tripStatus: { $in: ["COMPLETED", "CANCELLED"] } } },
    { $group: {
      _id: "$driver",
      completed: { $sum: { $cond: [{ $eq: ["$tripStatus", "COMPLETED"] }, 1, 0] } },
      cancelled: { $sum: { $cond: [{ $eq: ["$tripStatus", "CANCELLED"] }, 1, 0] } },
      onTime: { $sum: { $cond: [{ $and: [
        { $eq: ["$tripStatus", "COMPLETED"] },
        { $ne: ["$actualEnd", null] },
        { $ne: ["$scheduledEnd", null] },
        { $lte: ["$actualEnd", "$scheduledEnd"] },
      ] }, 1, 0] } },
    } },
  ]);
  return new Map(rows.map(row => [String(row._id), { ...row, onTimeRate: row.completed ? (row.onTime / row.completed) * 100 : 0 }]));
}

async function getVehicleHealth(vehicleIds) {
  if (!vehicleIds.length) return new Map();
  const [schedules, workOrders, issues] = await Promise.all([
    MaintenanceSchedule.find({ vehicle: { $in: vehicleIds }, status: { $in: ["OVERDUE", "DUE_SOON", "SCHEDULED"] } }).select("vehicle status nextServiceDate").lean(),
    MaintenanceWorkOrder.find({ vehicle: { $in: vehicleIds }, status: { $in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } }).select("vehicle status priority").lean(),
    VehicleIssue.find({ vehicle: { $in: vehicleIds }, status: { $in: ["OPEN", "IN_REVIEW", "IN_PROGRESS"] } }).select("vehicle severity issueType").lean(),
  ]);
  const map = new Map();
  for (const id of vehicleIds) map.set(String(id), { overdue: false, dueSoon: false, activeWorkOrder: false, criticalIssue: false, highIssue: false });
  for (const item of schedules) {
    const h = map.get(String(item.vehicle));
    if (!h) continue;
    if (item.status === "OVERDUE") h.overdue = true;
    if (item.status === "DUE_SOON") h.dueSoon = true;
    if (item.nextServiceDate && new Date(item.nextServiceDate) < new Date(Date.now() + MAINTENANCE_DUE_SOON_DAYS * 86400000)) h.dueSoon = true;
  }
  for (const item of workOrders) {
    const h = map.get(String(item.vehicle));
    if (h) h.activeWorkOrder = true;
  }
  for (const item of issues) {
    const h = map.get(String(item.vehicle));
    if (!h) continue;
    if (item.severity === "CRITICAL") h.criticalIssue = true;
    if (item.severity === "HIGH") h.highIssue = true;
  }
  return map;
}

function vehicleHealthScore(health) {
  if (health.criticalIssue) return { score: 0, hardFail: true, reason: "Vehicle has an unresolved critical issue." };
  if (health.activeWorkOrder) return { score: 0, hardFail: true, reason: "Vehicle has an active maintenance work order." };
  if (health.highIssue) return { score: 0, hardFail: true, reason: "Vehicle has an unresolved high-severity issue." };
  if (health.overdue) return { score: 3, reason: "Vehicle has an overdue maintenance schedule; verify maintenance readiness before dispatch." };
  if (health.dueSoon) return { score: 6, reason: "Vehicle maintenance is due soon." };
  return { score: 10, reason: "No active high-severity vehicle issues or maintenance work orders were found." };
}

async function getLatestDriverLocations(driverIds) {
  if (!driverIds.length) return new Map();
  const rows = await TripTracking.aggregate([
    { $match: { driver: { $in: driverIds }, latitude: { $gte: -90, $lte: 90 }, longitude: { $gte: -180, $lte: 180 } } },
    { $sort: { recordedAt: -1 } },
    { $group: { _id: "$driver", latitude: { $first: "$latitude" }, longitude: { $first: "$longitude" }, recordedAt: { $first: "$recordedAt" } } },
  ]);
  return new Map(rows.map(row => [String(row._id), row]));
}

async function buildCandidates(request, start, end, route) {
  const [vehicles, profiles] = await Promise.all([
    Vehicle.find({ status: { $in: ["AVAILABLE", "ASSIGNED"] }, approvalStatus: "APPROVED" })
      .populate("ownerId", "fullName email phone")
      .lean(),
    DriverProfile.find({ status: { $in: ["AVAILABLE", "ASSIGNED"] }, availability: true })
      .populate("user", "fullName email phone isActive accountStatus")
      .lean(),
  ]);

  const driverIds = profiles.map(p => p.user?._id || p.user).filter(Boolean);
  const vehicleIds = vehicles.map(v => v._id);
  const [driverStats, vehicleHealth, driverLocations] = await Promise.all([
    getDriverStats(driverIds),
    getVehicleHealth(vehicleIds),
    getLatestDriverLocations(driverIds),
  ]);

  const candidates = [];
  for (const vehicle of vehicles) {
    if (vehicle.ownershipType === "DRIVER_OWNED" && vehicle.approvalStatus !== "APPROVED") continue;
    const type = vehicleTypeScore(request, vehicle);
    const capacity = capacityScore(request, vehicle);
    const cargo = cargoScore(request, vehicle);
    const docs = vehicleDocumentHealth(vehicle);
    const health = vehicleHealthScore(vehicleHealth.get(String(vehicle._id)) || {});
    if (type.score === 0 || capacity.hardFail || cargo.hardFail || docs.hardFail || health.hardFail) continue;
    if (await hasScheduleConflict("vehicle", vehicle._id, start, end)) continue;
    if (await hasActiveTripForVehicle(vehicle._id)) continue;

    for (const driver of profiles) {
      const driverUserId = driver.user?._id || driver.user;
      if (!driverUserId) continue;
      if (driver.user && (driver.user.isActive === false || driver.user.accountStatus === "INACTIVE")) continue;
      if (vehicle.ownershipType === "DRIVER_OWNED") {
        const ownerId = vehicle.ownerId?._id || vehicle.ownerId;
        if (!ownerId || ownerId.toString() !== driverUserId.toString()) continue;
      }
      if (vehicle.assignedDriver && vehicle.assignedDriver.toString() !== driverUserId.toString()) continue;
      if (driver.assignedVehicle && driver.assignedVehicle.toString() !== vehicle._id.toString()) continue;
      if (await hasActiveTripForDriver(driverUserId)) continue;
      if (await hasScheduleConflict("driver", driverUserId, start, end)) continue;

      const qualification = driverQualificationScore(driver, start);
      if (qualification.hardFail) continue;
      const reliability = driverReliabilityScore(driverStats.get(String(driverUserId)));
      const location = driverLocations.get(String(driverUserId));
      const locationFresh = location?.recordedAt && (Date.now() - new Date(location.recordedAt).getTime()) <= 2 * 60 * 60 * 1000;
      const proximityKm = locationFresh && route?.pickupCoordinates
        ? haversineKm(location.latitude, location.longitude, route.pickupCoordinates.latitude, route.pickupCoordinates.longitude)
        : null;
      const proximity = proximityScore(proximityKm);
      const efficiency = efficiencyScore(vehicle, route?.distanceKm);
      const cost = estimateCost(vehicle, route?.distanceKm);
      const priority = priorityScore(request.priority);
      const age = vehicleAgeScore(vehicle);
      const pairing = vehicle.assignedDriver && vehicle.assignedDriver.toString() === driverUserId.toString() ? 5 : 3;

      const score = Math.round(clamp(
        type.score + capacity.score + cargo.score + qualification.score + reliability.score +
        proximity.score + health.score + docs.score + efficiency.score + age.score +
        priority.score + pairing,
        0,
        100
      ));

      const components = {
        vehicleType: type.score,
        passengerCapacity: capacity.score,
        cargoFit: cargo.score,
        driverQualification: qualification.score,
        driverReliability: reliability.score,
        pickupProximity: proximity.score,
        vehicleHealth: health.score,
        documentHealth: docs.score,
        costEfficiency: efficiency.score,
        vehicleAge: age.score,
        priority: priority.score,
        existingPairing: pairing,
      };

      candidates.push({
        vehicle,
        driver,
        score,
        estimatedCost: cost.cost,
        estimatedDistanceKm: route?.distanceKm ?? null,
        estimatedDurationMinutes: route?.durationMinutes ?? null,
        components,
        reasons: [
          type.reason,
          capacity.reason,
          cargo.reason,
          qualification.reason,
          reliability.reason,
          proximity.reason,
          health.reason,
          docs.reason,
          efficiency.reason,
          priority.reason,
          ...(pairing === 5 ? ["Driver is already associated with this vehicle."] : []),
          ...(cost.cost != null ? [`Estimated vehicle energy/fuel cost for the route: ₹${Math.round(cost.cost).toLocaleString("en-IN")}.`] : []),
        ],
      });
    }
  }

  const priced = candidates.filter(candidate => Number.isFinite(candidate.estimatedCost));
  if (priced.length > 1) {
    const minCost = Math.min(...priced.map(candidate => candidate.estimatedCost));
    const maxCost = Math.max(...priced.map(candidate => candidate.estimatedCost));
    for (const candidate of candidates) {
      if (!Number.isFinite(candidate.estimatedCost)) continue;
      const costScore = maxCost === minCost ? 5 : Math.round(1 + ((maxCost - candidate.estimatedCost) / (maxCost - minCost)) * 4);
      const previous = candidate.components.costEfficiency;
      candidate.components.costEfficiency = costScore;
      candidate.score = Math.round(clamp(candidate.score - previous + costScore, 0, 100));
      candidate.reasons = candidate.reasons.filter(reason => !reason.startsWith("Estimated vehicle energy/fuel cost"));
      candidate.reasons.push(`Estimated vehicle energy/fuel cost for the route: ₹${Math.round(candidate.estimatedCost).toLocaleString("en-IN")} (cost efficiency score ${costScore}/5).`);
    }
  }
  return candidates.sort((a, b) => b.score - a.score || (a.estimatedCost ?? Infinity) - (b.estimatedCost ?? Infinity));
}

async function autoAssignTripRequest({ requestId, assignedBy }) {
  const request = await TripRequest.findById(requestId);
  if (!request) throw Object.assign(new Error("Trip request not found."), { status: 404 });
  if (["REJECTED", "CANCELLED", "TRIP_CREATED"].includes(request.status)) {
    throw Object.assign(new Error(`This request is ${request.status.toLowerCase().replace("_", " ")} and cannot be AI assigned.`), { status: 409 });
  }

  const start = parseRequestedStart(request);
  if (!start) throw Object.assign(new Error("The trip request has an invalid requested date."), { status: 400 });
  if (start < new Date(Date.now() - 5 * 60 * 1000)) throw Object.assign(new Error("The requested trip start time has already passed."), { status: 400 });

  const route = await getRouteEstimate(request.pickupLocation, request.destination);
  const end = calculateEnd(start, request, route);
  const candidates = await buildCandidates(request, start, end, route);

  if (!candidates.length) {
    throw Object.assign(new Error("AI could not find an eligible vehicle and driver after applying availability, document, maintenance, capacity, license and schedule constraints."), { status: 409, code: "NO_AI_MATCH" });
  }

  let lastError = null;
  for (const candidate of candidates) {
    let reserved = false;
    let reservedVehicle = null;
    let reservedDriver = null;
    let trip = null;
    try {
      if (await hasActiveTripForVehicle(candidate.vehicle._id) || await hasActiveTripForDriver(candidate.driver.user._id)) continue;
      if (await hasScheduleConflict("vehicle", candidate.vehicle._id, start, end) || await hasScheduleConflict("driver", candidate.driver.user._id, start, end)) continue;

      const pair = await reservePair(candidate.vehicle._id, candidate.driver.user._id);
      reserved = true;
      reservedVehicle = pair.vehicle._id;
      reservedDriver = pair.driver.user;

      let tripId = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          tripId = await nextTripId();
          trip = await Trip.create({
            tripId,
            customer: request.customer,
            vehicle: candidate.vehicle._id,
            driver: candidate.driver.user._id,
            pickupLocation: request.pickupLocation,
            destination: request.destination,
            scheduledStart: start,
            scheduledEnd: end,
            distance: Number(candidate.estimatedDistanceKm) || 0,
            tripStatus: "ASSIGNED",
            priority: request.priority,
            notes: String(request.specialInstructions || "").trim(),
            createdBy: assignedBy,
            assignmentSource: "AI",
            aiAssignmentScore: candidate.score,
            aiAssignmentReasons: candidate.reasons,
            aiAssignmentVersion: AI_ASSIGNMENT_VERSION,
            aiAssignmentComponents: candidate.components,
            aiEstimatedDistanceKm: candidate.estimatedDistanceKm,
            aiEstimatedDurationMinutes: candidate.estimatedDurationMinutes,
            aiEstimatedCost: candidate.estimatedCost,
          });
          break;
        } catch (error) {
          if (error.code !== 11000 || attempt === 2) throw error;
        }
      }

      try { await optimizeAndPersistTrip(trip._id, { force: true }); } catch (routeError) { console.warn("AI pre-trip route optimization skipped:", routeError.message); }

      const assignedAt = new Date();
      request.status = "TRIP_CREATED";
      request.trip = trip._id;
      request.acceptedBy = assignedBy;
      request.acceptedAt = assignedAt;
      request.scheduledBy = assignedBy;
      request.scheduledAt = assignedAt;
      request.assignmentSource = "AI";
      request.aiAssignment = {
        score: candidate.score,
        vehicle: candidate.vehicle._id,
        driver: candidate.driver.user._id,
        reasons: candidate.reasons,
        assignedAt,
        version: AI_ASSIGNMENT_VERSION,
        components: candidate.components,
        estimatedDistanceKm: candidate.estimatedDistanceKm,
        estimatedDurationMinutes: candidate.estimatedDurationMinutes,
        estimatedCost: candidate.estimatedCost,
        candidateCount: candidates.length,
        routeSource: route?.source || "UNAVAILABLE",
      };
      await request.save();

      const populatedTrip = await Trip.findById(trip._id)
        .populate("vehicle", "registrationNumber vehicleNumber vehicleType make model status capacity payloadCapacityKg")
        .populate("driver", "fullName email phone")
        .populate("customer", "fullName email phone")
        .lean();

      return {
        trip: populatedTrip,
        score: candidate.score,
        reasons: candidate.reasons,
        components: candidate.components,
        vehicle: candidate.vehicle,
        driver: candidate.driver,
        route,
        estimatedCost: candidate.estimatedCost,
        candidateCount: candidates.length,
        assignmentVersion: AI_ASSIGNMENT_VERSION,
      };
    } catch (error) {
      lastError = error;
      if (trip?._id) await Trip.deleteOne({ _id: trip._id }).catch(() => {});
      if (reserved) await releasePair(reservedVehicle, reservedDriver).catch(() => {});
      if (error.status === 409 || error.code === 11000) continue;
      throw error;
    }
  }

  throw Object.assign(new Error(lastError?.message || "AI could not reserve a suitable vehicle and driver."), { status: 409 });
}

async function nextTripId() {
  const latest = await Trip.findOne({ tripId: /^TRP-\d+$/ }).sort({ createdAt: -1 }).select("tripId").lean();
  const n = latest ? Number(latest.tripId.split("-")[1]) + 1 : 1001;
  return `TRP-${String(n).padStart(4, "0")}`;
}

module.exports = { autoAssignTripRequest, AI_ASSIGNMENT_VERSION };
