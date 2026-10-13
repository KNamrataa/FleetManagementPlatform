const TrafficObservation = require("../models/TrafficObservation");
const CELL_SIZE = Number(process.env.TRAFFIC_CELL_SIZE_DEGREES || 0.0025);
const DEFAULT_BASELINE = Number(process.env.TRAFFIC_DEFAULT_BASELINE_KMPH || 45);
const LIVE_WINDOW_MINUTES = Number(process.env.TRAFFIC_LIVE_WINDOW_MINUTES || 20);
const ROUTE_POINT_SAMPLE_COUNT = Math.max(8, Number(process.env.TRAFFIC_ROUTE_POINT_SAMPLE_COUNT || 24));
const SEGMENT_CACHE_TTL_MS = Math.max(10000, Number(process.env.TRAFFIC_SEGMENT_CACHE_TTL_MS || 60000));
const MIN_OBSERVATION_SPEED_KMPH = Math.max(0, Number(process.env.TRAFFIC_MIN_OBSERVATION_SPEED_KMPH || 0));
const TOMTOM_API_KEY = String(process.env.TOMTOM_API_KEY || "").trim();
const TOMTOM_BASE_URL = String(process.env.TOMTOM_TRAFFIC_BASE_URL || "https://api.tomtom.com/traffic/services/4").replace(/\/$/, "");
const TOMTOM_CACHE_TTL_MS = Math.max(30000, Number(process.env.TRAFFIC_TOMTOM_CACHE_TTL_MS || 120000));
const TOMTOM_MIN_POINTS = Math.max(3, Number(process.env.TRAFFIC_TOMTOM_MIN_POINTS || 5));
const TOMTOM_TARGET_SPACING_KM = Math.max(1, Number(process.env.TRAFFIC_TOMTOM_TARGET_SPACING_KM || 15));
const TOMTOM_MAX_POINTS = Math.max(TOMTOM_MIN_POINTS, Number(process.env.TRAFFIC_TOMTOM_MAX_POINTS || 30));
const TOMTOM_TIMEOUT_MS = Math.max(2000, Number(process.env.TRAFFIC_TOMTOM_TIMEOUT_MS || 5000));

const segmentCache = new Map();
const tomtomCache = new Map();

function cellFor(latitude, longitude) {
  const lat = Number(latitude); const lng = Number(longitude);
  const latIndex = Math.floor(lat / CELL_SIZE); const lngIndex = Math.floor(lng / CELL_SIZE);
  return { key: `cell:${latIndex}:${lngIndex}`, latitude: (latIndex + 0.5) * CELL_SIZE, longitude: (lngIndex + 0.5) * CELL_SIZE };
}

function trafficFactor(speedKph, baselineKph = DEFAULT_BASELINE) {
  if (!Number.isFinite(Number(speedKph))) return 1;
  const speed = Math.max(0, Number(speedKph));
  const baseline = Math.max(1, Number(baselineKph) || DEFAULT_BASELINE);
  return Math.max(0.2, Math.min(1, speed / baseline));
}

function haversineKm(a, b) {
  const lat1 = Number(a?.latitude); const lon1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude); const lon2 = Number(b?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function routeDistanceKm(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversineKm(points[i - 1], points[i]);
  return total;
}

function sampleRoutePoints(points, maxPoints = ROUTE_POINT_SAMPLE_COUNT) {
  if (!Array.isArray(points) || !points.length) return [];
  if (points.length <= maxPoints) return points;
  const result = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) result.push(points[Math.round(i * step)]);
  return result;
}

function dynamicTomTomSampleCount(points) {
  if (!Array.isArray(points) || !points.length) return 0;
  if (points.length <= TOMTOM_MIN_POINTS) return points.length;
  const distanceKm = routeDistanceKm(points);
  const distanceBasedCount = distanceKm > 0
    ? Math.ceil(distanceKm / TOMTOM_TARGET_SPACING_KM) + 1
    : TOMTOM_MIN_POINTS;
  return Math.max(TOMTOM_MIN_POINTS, Math.min(TOMTOM_MAX_POINTS, distanceBasedCount, points.length));
}

function sampleRoutePointsByDistance(points, sampleCount) {
  if (!Array.isArray(points) || !points.length || sampleCount <= 0) return [];
  if (points.length <= sampleCount) return points;
  if (sampleCount === 1) return [points[0]];

  const cumulative = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i += 1) cumulative[i] = cumulative[i - 1] + haversineKm(points[i - 1], points[i]);
  const total = cumulative[cumulative.length - 1];
  if (!(total > 0)) return sampleRoutePoints(points, sampleCount);

  const result = [];
  let cursor = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const target = total * (i / (sampleCount - 1));
    while (cursor < cumulative.length - 1 && cumulative[cursor] < target) cursor += 1;
    const prev = Math.max(0, cursor - 1);
    const use = Math.abs(cumulative[cursor] - target) < Math.abs(cumulative[prev] - target) ? cursor : prev;
    if (!result.length || result[result.length - 1] !== points[use]) result.push(points[use]);
  }
  return result;
}

function sampleTomTomPoints(points) {
  return sampleRoutePointsByDistance(points, dynamicTomTomSampleCount(points));
}

function fetchWithTimeout(url, options = {}, timeoutMs = TOMTOM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function resolveSegmentForPoint(point) {
  const latitude = Number(point?.latitude); const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const cacheKey = `${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
  const cached = segmentCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = { segmentKey: null, baselineSpeedKph: DEFAULT_BASELINE };
  segmentCache.set(cacheKey, { value, expiresAt: Date.now() + SEGMENT_CACHE_TTL_MS });
  return value;
}

async function resolveTrafficKeys(points) {
  const sampled = sampleRoutePoints(points);
  const matches = await Promise.all(sampled.map(resolveSegmentForPoint));
  return sampled.map((point, index) => {
    const match = matches[index];
    const cell = cellFor(point.latitude, point.longitude);
    return {
      segmentKey: match?.segmentKey || null,
      cellKey: cell.key,
      baselineSpeedKph: Number(match?.baselineSpeedKph) > 0 ? Number(match.baselineSpeedKph) : DEFAULT_BASELINE,
    };
  });
}

async function recordTrafficObservation({ latitude, longitude, speedKph, recordedAt = new Date() }) {
  const speed = Number(speedKph);
  if (!Number.isFinite(speed) || speed < MIN_OBSERVATION_SPEED_KMPH) return null;
  const date = new Date(recordedAt); if (Number.isNaN(date.getTime())) return null;
  const point = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;

  const cell = cellFor(point.latitude, point.longitude);
  const segment = await resolveSegmentForPoint(point);
  const segmentKey = segment?.segmentKey || null;
  const storageCellKey = segmentKey ? `segment:${segmentKey}` : cell.key;
  const baselineSpeedKph = Math.max(5, Number(segment?.baselineSpeedKph) || DEFAULT_BASELINE);
  const dayOfWeek = date.getDay(); const hour = date.getHours(); const quarterHour = Math.floor(date.getMinutes() / 15);
  const keyQuery = segmentKey ? { segmentKey, dayOfWeek, hour, quarterHour } : { segmentKey: null, cellKey: cell.key, dayOfWeek, hour, quarterHour };
  const existing = await TrafficObservation.findOne(keyQuery);
  if (existing) {
    const n = Number(existing.sampleCount || 0);
    existing.speedKph = (Number(existing.speedKph || speed) * n + speed) / (n + 1);
    existing.baselineSpeedKph = baselineSpeedKph;
    existing.sampleCount = n + 1;
    existing.lastObservedAt = date;
    existing.centerLatitude = point.latitude;
    existing.centerLongitude = point.longitude;
    await existing.save();
    return existing.toObject();
  }
  return TrafficObservation.create({
    segmentKey,
    cellKey: storageCellKey,
    centerLatitude: point.latitude,
    centerLongitude: point.longitude,
    dayOfWeek,
    hour,
    quarterHour,
    speedKph: speed,
    baselineSpeedKph,
    sampleCount: 1,
    lastObservedAt: date,
  });
}

function parseTomTomFlow(data) {
  const flow = data?.flowSegmentData || data?.flowSegment || data;
  if (!flow) return null;
  const currentSpeed = Number(flow.currentSpeed);
  const freeFlowSpeed = Number(flow.freeFlowSpeed);
  const currentTravelTime = Number(flow.currentTravelTime);
  const freeFlowTravelTime = Number(flow.freeFlowTravelTime);
  if (!Number.isFinite(currentSpeed) || !Number.isFinite(freeFlowSpeed) || currentSpeed <= 0 || freeFlowSpeed <= 0) return null;
  const ratio = Math.max(0.2, Math.min(1, currentSpeed / freeFlowSpeed));
  const timeRatio = Number.isFinite(currentTravelTime) && Number.isFinite(freeFlowTravelTime) && freeFlowTravelTime > 0
    ? Math.max(1, currentTravelTime / freeFlowTravelTime)
    : 1 / ratio;
  return {
    currentSpeedKph: currentSpeed,
    freeFlowSpeedKph: freeFlowSpeed,
    currentTravelTimeSeconds: Number.isFinite(currentTravelTime) ? currentTravelTime : null,
    freeFlowTravelTimeSeconds: Number.isFinite(freeFlowTravelTime) ? freeFlowTravelTime : null,
    confidence: flow.confidence == null ? null : Number(flow.confidence),
    roadClosure: Boolean(flow.roadClosure),
    ratio,
    timeRatio,
    segmentKey: flow.openlr || flow.openLr || flow.frc || null,
  };
}

async function getTomTomPointTraffic(point) {
  if (!TOMTOM_API_KEY) return null;
  const latitude = Number(point?.latitude); const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const cacheKey = `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  const cached = tomtomCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams({
    key: TOMTOM_API_KEY,
    point: `${latitude},${longitude}`,
    unit: "KMPH",
    openLr: "true",
  });
  const url = `${TOMTOM_BASE_URL}/flowSegmentData/relative0/10/json?${params.toString()}`;
  try {
    const response = await fetchWithTimeout(url, {}, TOMTOM_TIMEOUT_MS);
    if (!response.ok) throw new Error(`TomTom Traffic API ${response.status}`);
    const data = await response.json();
    const parsed = parseTomTomFlow(data);
    tomtomCache.set(cacheKey, { value: parsed, expiresAt: Date.now() + TOMTOM_CACHE_TTL_MS });
    return parsed;
  } catch (error) {
    // Cache failures briefly so one unavailable provider cannot create a request storm.
    tomtomCache.set(cacheKey, { value: null, expiresAt: Date.now() + 15000 });
    if (process.env.ROUTING_DEBUG === "true" && process.env.NODE_ENV !== "test") console.debug("TomTom traffic lookup failed:", error.message);
    return null;
  }
}

async function getTomTomTrafficForPoints(points) {
  if (!TOMTOM_API_KEY || !Array.isArray(points) || !points.length) return null;
  const sampled = sampleTomTomPoints(points);
  const results = await Promise.all(sampled.map(getTomTomPointTraffic));
  const valid = results.filter(Boolean);
  if (!valid.length) return null;

  const currentSpeed = valid.reduce((sum, item) => sum + item.currentSpeedKph, 0) / valid.length;
  const freeFlowSpeed = valid.reduce((sum, item) => sum + item.freeFlowSpeedKph, 0) / valid.length;
  const factor = Math.max(0.2, Math.min(1, valid.reduce((sum, item) => sum + item.ratio, 0) / valid.length));
  const timeRatio = Math.max(1, valid.reduce((sum, item) => sum + item.timeRatio, 0) / valid.length);
  const congestionPercent = Math.round((1 - factor) * 100);
  const label = congestionPercent >= 60 ? "Heavy" : congestionPercent >= 30 ? "Moderate" : congestionPercent >= 10 ? "Light" : "Free-flow";
  const confidenceValues = valid.map((item) => item.confidence).filter((value) => Number.isFinite(value));
  const sampledDistanceKm = routeDistanceKm(sampled);
  return {
    factor,
    timeRatio,
    congestionPercent,
    samples: valid.length,
    source: "TOMTOM_LIVE",
    provider: "TomTom Traffic Flow",
    label,
    observedSpeedKph: Number(currentSpeed.toFixed(1)),
    baselineSpeedKph: Number(freeFlowSpeed.toFixed(1)),
    freeFlowSpeedKph: Number(freeFlowSpeed.toFixed(1)),
    tomtomConfidence: confidenceValues.length ? Number((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length).toFixed(2)) : null,
    roadClosures: valid.filter((item) => item.roadClosure).length,
    queriedPoints: sampled.length,
    successfulPoints: valid.length,
    sampling: {
      strategy: "distance-based",
      routeDistanceKm: Number(sampledDistanceKm.toFixed(2)),
      targetSpacingKm: TOMTOM_TARGET_SPACING_KM,
      minPoints: TOMTOM_MIN_POINTS,
      maxPoints: TOMTOM_MAX_POINTS,
      requestedPoints: sampled.length,
    },
    coveragePercent: sampled.length ? Number(((valid.length / sampled.length) * 100).toFixed(1)) : 0,
    liveWindowMinutes: 1,
    segmentTraffic: sampled.map((point, index) => ({
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      ...(results[index] ? {
        ratio: Number(results[index].ratio.toFixed(4)),
        timeRatio: Number(results[index].timeRatio.toFixed(4)),
        currentSpeedKph: Number(results[index].currentSpeedKph.toFixed(1)),
        freeFlowSpeedKph: Number(results[index].freeFlowSpeedKph.toFixed(1)),
        confidence: Number.isFinite(results[index].confidence) ? results[index].confidence : null,
        roadClosure: Boolean(results[index].roadClosure),
      } : { ratio: null, timeRatio: null, currentSpeedKph: null, freeFlowSpeedKph: null, confidence: null, roadClosure: false })
    })),
  };
}

async function getFleetTrafficForPoints(points, at = new Date()) {
  if (!Array.isArray(points) || !points.length) return { factor: 1, congestionPercent: 0, samples: 0, source: "NO_TRAFFIC_DATA", label: "Unknown" };
  const resolved = await resolveTrafficKeys(points);
  const segmentKeys = [...new Set(resolved.map((x) => x.segmentKey).filter(Boolean))];
  const cellKeys = [...new Set(resolved.map((x) => x.cellKey).filter(Boolean))];
  const now = new Date(at); const dayOfWeek = now.getDay(); const hour = now.getHours();
  const liveSince = new Date(now.getTime() - LIVE_WINDOW_MINUTES * 60000);

  const quarterHour = Math.floor(now.getMinutes() / 15);
  const quarterCandidates = [quarterHour, (quarterHour + 3) % 4, (quarterHour + 1) % 4];
  const liveQuery = { dayOfWeek, hour, lastObservedAt: { $gte: liveSince }, quarterHour: { $in: quarterCandidates }, $or: [] };
  if (segmentKeys.length) liveQuery.$or.push({ segmentKey: { $in: segmentKeys } });
  if (cellKeys.length) liveQuery.$or.push({ segmentKey: null, cellKey: { $in: cellKeys } });
  const rows = liveQuery.$or.length ? await TrafficObservation.find(liveQuery).lean() : [];
  let historical = rows;
  if (!historical.length) {
    const historicalQuery = { dayOfWeek, hour, quarterHour: { $in: quarterCandidates }, $or: [] };
    if (segmentKeys.length) historicalQuery.$or.push({ segmentKey: { $in: segmentKeys } });
    if (cellKeys.length) historicalQuery.$or.push({ segmentKey: null, cellKey: { $in: cellKeys } });
    historical = historicalQuery.$or.length ? await TrafficObservation.find(historicalQuery).sort({ lastObservedAt: -1 }).limit(200).lean() : [];
  }
  if (!historical.length) return { factor: 1, congestionPercent: 0, samples: 0, source: "NO_TRAFFIC_DATA", label: "Unknown" };

  const weights = historical.reduce((sum, row) => sum + Math.max(1, Number(row.sampleCount || 1)), 0);
  const weightedFactor = historical.reduce((sum, row) => sum + trafficFactor(row.speedKph, row.baselineSpeedKph) * Math.max(1, Number(row.sampleCount || 1)), 0);
  const weightedSpeed = historical.reduce((sum, row) => sum + Math.max(0, Number(row.speedKph || 0)) * Math.max(1, Number(row.sampleCount || 1)), 0);
  const weightedBaseline = historical.reduce((sum, row) => sum + Math.max(1, Number(row.baselineSpeedKph || DEFAULT_BASELINE)) * Math.max(1, Number(row.sampleCount || 1)), 0);
  const factor = weights ? weightedFactor / weights : 1;
  const congestionPercent = Math.round((1 - factor) * 100);
  const source = rows.length ? "FLEET_LIVE" : "FLEET_HISTORICAL";
  const label = congestionPercent >= 60 ? "Heavy" : congestionPercent >= 30 ? "Moderate" : congestionPercent >= 10 ? "Light" : "Free-flow";
  const coveragePercent = Math.min(100, Math.round((historical.length / Math.max(1, segmentKeys.length || cellKeys.length || 1)) * 100));
  const reliabilityScore = Math.round(Math.min(100, 35 + Math.min(50, Math.log10(weights + 1) * 25) + Math.min(15, coveragePercent * 0.15)));
  return { factor, congestionPercent, samples: weights, source, label, liveWindowMinutes: LIVE_WINDOW_MINUTES, observedSpeedKph: weights ? Number((weightedSpeed / weights).toFixed(1)) : null, baselineSpeedKph: weights ? Number((weightedBaseline / weights).toFixed(1)) : null, segments: historical.length, coveragePercent, reliabilityScore, historicalSamples: weights };
}

async function getTrafficForPoints(points, at = new Date()) {
  if (!Array.isArray(points) || !points.length) return { factor: 1, congestionPercent: 0, samples: 0, source: "NO_TRAFFIC_DATA", label: "Unknown" };

  // External real-time traffic is authoritative when configured and available.
  const tomtom = await getTomTomTrafficForPoints(points);
  if (tomtom) return tomtom;

  // Preserve the existing free FleetFlow traffic fallback.
  return getFleetTrafficForPoints(points, at);
}

module.exports = {
  recordTrafficObservation,
  getTrafficForPoints,
  getTomTomTrafficForPoints,
  getFleetTrafficForPoints,
  cellFor,
  trafficFactor,
  sampleRoutePoints,
};
