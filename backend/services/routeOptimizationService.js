const Trip = require("../models/Trip");
const Vehicle = require("../models/Vehicle");
const { getRouteCandidates, haversineKm } = require("./routeIntelligenceService");
const { getTrafficForPoints } = require("./trafficService");

const MIN_REROUTE_SAVING_MINUTES = Number(process.env.ROUTE_MIN_REROUTE_SAVING_MINUTES || 8);
const MIN_REROUTE_DISTANCE_KM = Number(process.env.ROUTE_MIN_REROUTE_DISTANCE_KM || 1);
const MAX_ROUTE_RECALC_MINUTES = Number(process.env.ROUTE_RECALC_COOLDOWN_MINUTES || 2);
const WEIGHTS = {
  time: Number(process.env.ROUTE_WEIGHT_TIME || 0.30),
  traffic: Number(process.env.ROUTE_WEIGHT_TRAFFIC || 0.25),
  distance: Number(process.env.ROUTE_WEIGHT_DISTANCE || 0.15),
  reliability: Number(process.env.ROUTE_WEIGHT_RELIABILITY || 0.10),
  closure: Number(process.env.ROUTE_WEIGHT_CLOSURE || 0.10),
  fuel: Number(process.env.ROUTE_WEIGHT_FUEL || 0.10),
};
const sumWeights = Object.values(WEIGHTS).reduce((a, b) => a + b, 0) || 1;
for (const key of Object.keys(WEIGHTS)) WEIGHTS[key] /= sumWeights;

function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function normalizeRange(value, min, max) { if (max === min) return null; return clamp(100 - ((value - min) / Math.max(0.0001, max - min)) * 100); }
function routeTrafficPenalty(traffic) { return traffic?.source === "NO_TRAFFIC_DATA" ? null : clamp(traffic?.congestionPercent || 0, 0, 100); }
function defaultEfficiency(vehicle) {
  const fuel = String(vehicle?.fuelType || "").toLowerCase();
  return Number(vehicle?.fuelEfficiencyKmPerUnit) || ({ electric: 6, hybrid: 18, cng: 14, diesel: 13, petrol: 11 }[fuel] || 10);
}
function defaultFuelCost(vehicle) { return Number(vehicle?.fuelCostPerUnit) || 0; }
function estimateFuel(distanceKm, vehicle) {
  const efficiency = defaultEfficiency(vehicle);
  const units = efficiency > 0 ? Number(distanceKm || 0) / efficiency : 0;
  const costPerUnit = defaultFuelCost(vehicle);
  return {
    efficiencyKmPerUnit: efficiency,
    fuelUnits: Number(units.toFixed(2)),
    fuelCost: costPerUnit > 0 ? Number((units * costPerUnit).toFixed(2)) : null,
    fuelCostPerUnit: costPerUnit,
    fuelType: vehicle?.fuelType || null,
    costAvailable: costPerUnit > 0,
  };
}

function segmentWeightedTraffic(points, traffic) {
  const samples = Array.isArray(traffic?.segmentTraffic)
    ? traffic.segmentTraffic.filter(x => Number.isFinite(x.ratio))
    : [];
  if (samples.length < 2) {
    return {
      factor: Number(traffic?.factor || 1),
      timeRatio: Number(traffic?.timeRatio || 1),
      bottleneckPercent: Number(traffic?.congestionPercent || 0),
      closureCount: Number(traffic?.roadClosures || 0),
    };
  }
  let totalKm = 0;
  let weightedRatio = 0;
  let weightedTimeRatio = 0;
  let maxCongestion = 0;
  let closureCount = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = samples[i];
    const b = samples[i + 1] || a;
    const km = i < samples.length - 1 ? haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) : 0;
    const w = Math.max(0.05, km);
    totalKm += w;
    weightedRatio += a.ratio * w;
    weightedTimeRatio += Math.max(1, a.timeRatio || 1) * w;
    maxCongestion = Math.max(maxCongestion, (1 - a.ratio) * 100);
    if (a.roadClosure) closureCount += 1;
  }
  return {
    factor: totalKm ? Math.max(0.2, Math.min(1, weightedRatio / totalKm)) : Number(traffic.factor || 1),
    timeRatio: totalKm ? Math.max(1, weightedTimeRatio / totalKm) : Number(traffic.timeRatio || 1),
    bottleneckPercent: Math.round(maxCongestion),
    closureCount,
  };
}

function absoluteTimeScore(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  if (!value) return 0;
  if (value <= 30) return 100;
  if (value <= 60) return 95;
  if (value <= 120) return 88;
  if (value <= 180) return 80;
  if (value <= 240) return 72;
  if (value <= 360) return 60;
  if (value <= 480) return 48;
  return 35;
}

function absoluteDistanceScore(km) {
  const value = Math.max(0, Number(km) || 0);
  if (!value) return 0;
  if (value <= 25) return 100;
  if (value <= 50) return 95;
  if (value <= 100) return 88;
  if (value <= 200) return 78;
  if (value <= 300) return 68;
  if (value <= 500) return 55;
  if (value <= 800) return 42;
  return 30;
}

function absoluteFuelScore(fuel, distanceKm) {
  if (!fuel?.costAvailable) return null;
  const unitsPerKm = Number(fuel.fuelUnits || 0) / Math.max(0.1, Number(distanceKm || 0));
  if (!unitsPerKm) return 70;
  if (unitsPerKm <= 0.05) return 100;
  if (unitsPerKm <= 0.08) return 90;
  if (unitsPerKm <= 0.10) return 82;
  if (unitsPerKm <= 0.14) return 70;
  if (unitsPerKm <= 0.20) return 55;
  return 40;
}

function scoreAvailableWeights(route) {
  const available = {
    time: true,
    traffic: route.traffic?.source !== "NO_TRAFFIC_DATA",
    distance: true,
    reliability: route.reliabilityScore != null,
    closure: route.traffic?.source !== "NO_TRAFFIC_DATA",
    fuel: route.fuelEstimate?.costAvailable === true,
  };
  const active = Object.entries(WEIGHTS).filter(([key]) => available[key]);
  const total = active.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  return Object.fromEntries(active.map(([key, weight]) => [key, weight / total]));
}

function buildTrafficAnalysis(points, traffic) {
  const samples = Array.isArray(traffic?.segmentTraffic) ? traffic.segmentTraffic : [];
  const valid = samples.filter((x) => Number.isFinite(Number(x?.ratio)));
  const queried = Number(traffic?.queriedPoints || samples.length || 0);
  const successful = Number(traffic?.successfulPoints || valid.length || 0);
  let totalKm = 0;
  let weightedCongestion = 0;
  let maxCongestion = -1;
  let bottleneck = null;
  let closures = 0;
  for (let i = 0; i < valid.length; i += 1) {
    const a = valid[i];
    const b = valid[i + 1] || a;
    const km = i < valid.length - 1 ? haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) : 0;
    const weight = Math.max(0.05, km);
    const congestion = Math.max(0, (1 - Number(a.ratio)) * 100);
    totalKm += weight;
    weightedCongestion += congestion * weight;
    if (congestion > maxCongestion) {
      maxCongestion = congestion;
      bottleneck = a;
    }
    if (a.roadClosure) closures += 1;
  }
  const avgCongestion = totalKm > 0 ? weightedCongestion / totalKm : (Number(traffic?.congestionPercent || 0));
  return {
    method: traffic?.source === "TOMTOM_LIVE" ? "TomTom live sampled road segments" : "FleetFlow traffic observations",
    samplePoints: queried,
    successfulSamples: successful,
    coveragePercent: Number(Number(traffic?.coveragePercent ?? (queried ? (successful / queried) * 100 : 0)).toFixed(1)),
    segmentsAnalyzed: Math.max(0, valid.length - 1),
    averageCongestionPercent: Number(Math.max(0, avgCongestion).toFixed(1)),
    bottleneckCongestionPercent: Number(Math.max(0, maxCongestion < 0 ? Number(traffic?.congestionPercent || 0) : maxCongestion).toFixed(1)),
    bottleneckSpeedKph: bottleneck?.currentSpeedKph == null ? null : Number(bottleneck.currentSpeedKph),
    bottleneckBaselineSpeedKph: bottleneck?.freeFlowSpeedKph == null ? null : Number(bottleneck.freeFlowSpeedKph),
    bottleneckLocation: bottleneck ? { latitude: Number(bottleneck.latitude), longitude: Number(bottleneck.longitude) } : null,
    roadClosures: Math.max(Number(traffic?.roadClosures || 0), closures),
  };
}

function routeExplanation(route) {
  const reasons = [];
  const traffic = route.traffic || {};
  if (traffic.source !== "NO_TRAFFIC_DATA") {
    if (Number(traffic.bottleneckCongestionPercent || 0) >= 50) reasons.push(`Traffic bottleneck reaches about ${Math.round(traffic.bottleneckCongestionPercent)}% congestion.`);
    else if (Number(traffic.congestionPercent || 0) < 15) reasons.push("Traffic is close to free-flow on sampled road segments.");
    else reasons.push(`${traffic.label || "Traffic"} traffic is included in the ETA.`);
    if (route.trafficAnalysis?.samplePoints) reasons.push(`Traffic analysis uses ${route.trafficAnalysis.samplePoints} live sample point${route.trafficAnalysis.samplePoints === 1 ? "" : "s"} across ${route.trafficAnalysis.segmentsAnalyzed || 0} sampled road segments.`);
  }
  if (route.closureScore === 100) reasons.push("No sampled road closures were detected.");
  else reasons.push(`${route.traffic?.roadClosures || 1} sampled road closure${Number(route.traffic?.roadClosures || 1) === 1 ? "" : "s"} detected.`);
  if (route.fuelEstimate?.costAvailable) reasons.push(`Estimated fuel cost is ₹${Number(route.fuelEstimate.fuelCost).toFixed(0)} for this route.`);
  if (route.reliabilityScore != null) reasons.push(`Traffic confidence/reliability is ${Math.round(route.reliabilityScore)}/100.`);
  return reasons.slice(0, 4);
}

async function scoreRoutes(routes, departureTime, vehicle = null) {
  const scored = [];
  for (const route of routes) {
    const points = route.geometryPoints || [];
    const traffic = await getTrafficForPoints(points, departureTime);
    const hasTrafficData = traffic?.samples > 0 && traffic?.source !== "NO_TRAFFIC_DATA";
    const segment = segmentWeightedTraffic(points, traffic);
    const effectiveMinutes = hasTrafficData
      ? Number(route.durationMinutes || 0) * Math.max(1, segment.timeRatio)
      : Number(route.durationMinutes || 0);
    const fuel = estimateFuel(route.distanceKm, vehicle);
    const reliability = hasTrafficData
      ? clamp(traffic.reliabilityScore != null ? traffic.reliabilityScore : (traffic.tomtomConfidence != null ? 50 + Number(traffic.tomtomConfidence) * 50 : 50))
      : null;
    const closureScore = !hasTrafficData ? null : (segment.closureCount > 0 || Number(traffic?.roadClosures || 0) > 0 ? 0 : 100);
    scored.push({
      ...route,
      traffic: {
        ...traffic,
        segmentWeightedFactor: segment.factor,
        segmentTimeRatio: segment.timeRatio,
        bottleneckCongestionPercent: segment.bottleneckPercent,
        roadClosures: Math.max(Number(traffic?.roadClosures || 0), segment.closureCount),
      },
      trafficAdjustedDurationMinutes: effectiveMinutes,
      trafficDelayMinutes: hasTrafficData ? Math.max(0, effectiveMinutes - Number(route.durationMinutes || 0)) : null,
      fuelEstimate: fuel,
      reliabilityScore: reliability,
      closureScore,
      trafficAnalysis: buildTrafficAnalysis(points, { ...traffic, roadClosures: Math.max(Number(traffic?.roadClosures || 0), segment.closureCount) }),
    });
  }

  const minTime = Math.min(...scored.map(r => Number(r.trafficAdjustedDurationMinutes) || Infinity));
  const maxTime = Math.max(...scored.map(r => Number(r.trafficAdjustedDurationMinutes) || 0), minTime);
  const minDistance = Math.min(...scored.map(r => Number(r.distanceKm) || Infinity));
  const maxDistance = Math.max(...scored.map(r => Number(r.distanceKm) || 0), minDistance);
  const fuelValues = scored.filter(r => r.fuelEstimate?.costAvailable).map(r => Number(r.fuelEstimate.fuelCost));
  const minFuel = fuelValues.length ? Math.min(...fuelValues) : null;
  const maxFuel = fuelValues.length ? Math.max(...fuelValues) : null;

  for (const route of scored) {
    const relativeTime = normalizeRange(route.trafficAdjustedDurationMinutes, minTime, maxTime);
    const relativeDistance = normalizeRange(route.distanceKm, minDistance, maxDistance);
    const relativeFuel = route.fuelEstimate?.costAvailable && minFuel != null ? normalizeRange(Number(route.fuelEstimate.fuelCost), minFuel, maxFuel) : null;
    const timeScore = relativeTime == null ? absoluteTimeScore(route.trafficAdjustedDurationMinutes) : Math.round((relativeTime * 0.65) + (absoluteTimeScore(route.trafficAdjustedDurationMinutes) * 0.35));
    const distanceScore = relativeDistance == null ? absoluteDistanceScore(route.distanceKm) : Math.round((relativeDistance * 0.65) + (absoluteDistanceScore(route.distanceKm) * 0.35));
    const fuelScore = relativeFuel == null ? absoluteFuelScore(route.fuelEstimate, route.distanceKm) : Math.round((relativeFuel * 0.65) + (absoluteFuelScore(route.fuelEstimate, route.distanceKm) * 0.35));
    const trafficScore = routeTrafficPenalty(route.traffic) == null ? null : 100 - routeTrafficPenalty(route.traffic);
    const reliabilityScore = route.reliabilityScore;
    const closureScore = route.closureScore;
    const weights = scoreAvailableWeights(route);
    const components = { time: timeScore, traffic: trafficScore, distance: distanceScore, reliability: reliabilityScore, closure: closureScore, fuel: fuelScore };
    const weighted = Object.entries(weights).reduce((sum, [key, weight]) => sum + Number(components[key] || 0) * weight, 0);
    route.optimizationScore = Math.round(clamp(weighted));
    route.scoreBreakdown = {
      time: Math.round(timeScore),
      traffic: trafficScore == null ? null : Math.round(trafficScore),
      distance: Math.round(distanceScore),
      reliability: reliabilityScore == null ? null : Math.round(reliabilityScore),
      closure: closureScore == null ? null : Math.round(closureScore),
      fuel: fuelScore == null ? null : Math.round(fuelScore),
      weights,
      dataAvailability: Object.fromEntries(Object.keys(WEIGHTS).map(key => [key, Object.prototype.hasOwnProperty.call(weights, key)])),
    };
    route.explanation = routeExplanation(route);
  }
  return scored.sort((a, b) => (b.optimizationScore ?? -1) - (a.optimizationScore ?? -1) || a.trafficAdjustedDurationMinutes - b.trafficAdjustedDurationMinutes);
}

async function optimizeRoute({ pickup, destination, departureTime = new Date(), currentPosition = null, vehicle = null, vehicleType = "", alternatives = 2 } = {}) {
  const origin = currentPosition || pickup;
  const result = await getRouteCandidates(origin, destination, { departureTime, vehicleType: vehicle?.vehicleType || vehicleType, alternatives, traffic: true });
  if (!result.routes.length) return { status: "UNAVAILABLE", provider: "UNAVAILABLE", pickupCoordinates: result.pickupCoordinates, destinationCoordinates: result.destinationCoordinates, alternatives: [], routingDiagnostics: result.diagnostics };
  const scored = await scoreRoutes(result.routes, departureTime, vehicle);
  const best = scored[0];
  return {
    status: "READY",
    provider: best.provider,
    pickupCoordinates: result.pickupCoordinates,
    destinationCoordinates: result.destinationCoordinates,
    distanceKm: Number(best.distanceKm.toFixed(2)),
    durationMinutes: Number(best.trafficAdjustedDurationMinutes.toFixed(1)),
    baseDurationMinutes: Number(best.durationMinutes.toFixed(1)),
    trafficDelayMinutes: best.trafficDelayMinutes == null ? null : Number(best.trafficDelayMinutes.toFixed(1)),
    traffic: best.traffic,
    optimizationScore: best.optimizationScore,
    scoreBreakdown: best.scoreBreakdown,
    fuelEstimate: best.fuelEstimate,
    reliabilityScore: best.reliabilityScore,
    trafficAnalysis: best.trafficAnalysis,
    explanation: best.explanation,
    routingDiagnostics: result.diagnostics,
    geometry: best.geometry,
    geometryPoints: best.geometryPoints,
    alternatives: scored.slice(1).map(route => ({
      provider: route.provider,
      distanceKm: Number(route.distanceKm.toFixed(2)),
      durationMinutes: Number(route.trafficAdjustedDurationMinutes.toFixed(1)),
      baseDurationMinutes: Number(route.durationMinutes.toFixed(1)),
      trafficDelayMinutes: route.trafficDelayMinutes == null ? null : Number(route.trafficDelayMinutes.toFixed(1)),
      traffic: route.traffic,
      optimizationScore: route.optimizationScore,
      scoreBreakdown: route.scoreBreakdown,
      fuelEstimate: route.fuelEstimate,
      reliabilityScore: route.reliabilityScore,
      trafficAnalysis: route.trafficAnalysis,
      explanation: route.explanation,
      geometry: route.geometry,
      geometryPoints: route.geometryPoints,
    })),
    calculatedAt: new Date(),
    departureTime: new Date(departureTime),
  };
}

function meaningfulImprovement(current, candidate) {
  if (!current || !candidate || candidate.status !== "READY") return { better: false, timeSavedMinutes: 0, distanceSavedKm: 0, fuelCostSaved: 0 };
  const currentMinutes = Number(current.durationMinutes || 0);
  const candidateMinutes = Number(candidate.durationMinutes || 0);
  const currentDistance = Number(current.distanceKm || 0);
  const candidateDistance = Number(candidate.distanceKm || 0);
  const currentFuel = Number(current.fuelEstimate?.fuelCost || 0);
  const candidateFuel = Number(candidate.fuelEstimate?.fuelCost || 0);
  const timeSavedMinutes = currentMinutes - candidateMinutes;
  const distanceSavedKm = currentDistance - candidateDistance;
  const fuelCostSaved = currentFuel > 0 && candidateFuel > 0 ? currentFuel - candidateFuel : 0;
  const distanceDifferenceKm = candidateDistance - currentDistance;
  const distanceComparison = Math.abs(distanceDifferenceKm) < 0.05 ? "SIMILAR" : distanceDifferenceKm < 0 ? "SHORTER" : "LONGER";
  return {
    better: timeSavedMinutes >= MIN_REROUTE_SAVING_MINUTES || (timeSavedMinutes > 2 && distanceSavedKm >= MIN_REROUTE_DISTANCE_KM) || (fuelCostSaved > 0 && timeSavedMinutes > 2),
    timeSavedMinutes,
    distanceSavedKm,
    distanceDifferenceKm,
    distanceComparison,
    fuelCostSaved,
  };
}

function calculateRoutePerformance(trip) {
  const plannedDistanceKm = Number(trip?.routeOptimization?.distanceKm || trip?.aiEstimatedDistanceKm || 0);
  const plannedDurationMinutes = Number(trip?.routeOptimization?.durationMinutes || trip?.aiEstimatedDurationMinutes || 0);
  const actualEnd = trip?.actualEnd ? new Date(trip.actualEnd) : null;
  const actualStart = trip?.actualStart ? new Date(trip.actualStart) : null;
  const actualDurationMinutes = actualStart && actualEnd && !Number.isNaN(actualStart.getTime()) && !Number.isNaN(actualEnd.getTime())
    ? Math.max(0, (actualEnd - actualStart) / 60000)
    : null;
  if (!(plannedDistanceKm > 0 || plannedDurationMinutes > 0)) return null;
  const actualDistanceKm = Number(trip?.distance || 0);
  const durationVarianceMinutes = actualDurationMinutes == null || !plannedDurationMinutes ? null : Number((actualDurationMinutes - plannedDurationMinutes).toFixed(2));
  const durationAccuracyPercent = actualDurationMinutes == null || !plannedDurationMinutes
    ? null
    : Number(Math.max(0, Math.min(100, 100 - Math.abs(durationVarianceMinutes) / plannedDurationMinutes * 100)).toFixed(2));
  return {
    plannedDistanceKm: plannedDistanceKm || null,
    actualDistanceKm: actualDistanceKm || null,
    plannedDurationMinutes: plannedDurationMinutes || null,
    actualDurationMinutes: actualDurationMinutes == null ? null : Number(actualDurationMinutes.toFixed(2)),
    distanceVarianceKm: plannedDistanceKm && actualDistanceKm ? Number((actualDistanceKm - plannedDistanceKm).toFixed(2)) : null,
    durationVarianceMinutes,
    durationAccuracyPercent,
    analyzedAt: new Date(),
  };
}

async function optimizeTrip(trip, { currentPosition = null, force = false } = {}) {
  if (!trip) throw Object.assign(new Error("Trip not found."), { status: 404 });
  const now = new Date();
  const previous = trip.routeOptimization || null;
  if (!force && previous?.calculatedAt && (now - new Date(previous.calculatedAt)) < MAX_ROUTE_RECALC_MINUTES * 60000) return { ...previous, throttled: true, recommendation: null };
  let vehicle = null;
  if (trip.vehicle) vehicle = typeof trip.vehicle === "object" ? trip.vehicle : await Vehicle.findById(trip.vehicle).lean();
  const pickup = currentPosition || trip.pickupLocation;
  const route = await optimizeRoute({ pickup, destination: trip.destination, departureTime: now, currentPosition: currentPosition || null, vehicle, vehicleType: vehicle?.vehicleType || "", alternatives: 2 });
  const recommendation = currentPosition && previous ? meaningfulImprovement(previous, route) : { better: false, timeSavedMinutes: 0, distanceSavedKm: 0, fuelCostSaved: 0 };
  return { ...route, recommendation };
}

async function optimizeAndPersistTrip(tripId, options = {}) {
  const trip = await Trip.findById(tripId).populate("vehicle", "vehicleType fuelType fuelEfficiencyKmPerUnit fuelCostPerUnit");
  if (!trip) throw Object.assign(new Error("Trip not found."), { status: 404 });
  const result = await optimizeTrip(trip, options);
  if (result.throttled) return result;
  trip.routeOptimization = {
    provider: result.provider,
    status: result.status,
    distanceKm: result.distanceKm,
    durationMinutes: result.durationMinutes,
    baseDurationMinutes: result.baseDurationMinutes,
    trafficDelayMinutes: result.trafficDelayMinutes,
    traffic: result.traffic,
    trafficAnalysis: result.trafficAnalysis,
    optimizationScore: result.optimizationScore,
    scoreBreakdown: result.scoreBreakdown,
    fuelEstimate: result.fuelEstimate,
    reliabilityScore: result.reliabilityScore,
    calculatedAt: result.calculatedAt,
    departureTime: result.departureTime,
    geometry: result.geometry,
    geometryPoints: result.geometryPoints,
    recommendation: result.recommendation,
    explanation: result.explanation,
    routingDiagnostics: result.routingDiagnostics,
  };
  trip.alternativeRoutes = result.alternatives || [];
  if (result.status === "READY" && (!trip.distance || Number(trip.distance) <= 0) && !options.currentPosition) trip.distance = Number(result.distanceKm || 0);
  if (result.status === "READY" && !options.currentPosition) {
    trip.aiEstimatedDistanceKm = Number(result.distanceKm || trip.aiEstimatedDistanceKm || 0);
    trip.aiEstimatedDurationMinutes = Number(result.durationMinutes || trip.aiEstimatedDurationMinutes || 0);
  }
  await trip.save();
  return { ...result, tripId: trip._id };
}

module.exports = {
  optimizeRoute,
  optimizeTrip,
  optimizeAndPersistTrip,
  meaningfulImprovement,
  calculateRoutePerformance,
  MIN_REROUTE_SAVING_MINUTES,
};
