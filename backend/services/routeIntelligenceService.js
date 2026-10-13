const cache = new Map();
const GEOCODING_ENABLED = String(process.env.AI_TRIP_GEOCODING_ENABLED || "true").toLowerCase() !== "false";
const GEOCODING_BASE_URL = process.env.AI_TRIP_GEOCODING_URL || "https://nominatim.openstreetmap.org/search";
const OSRM_BASE_URL = process.env.AI_TRIP_ROUTING_URL || "https://router.project-osrm.org/route/v1/driving";
const ROUTING_PROVIDER = "osrm";
const ROUTING_DEBUG = String(process.env.ROUTING_DEBUG || "false").toLowerCase() === "true";
const USER_AGENT = process.env.AI_TRIP_MAP_USER_AGENT || "FleetFlow-AI-Trip-Assignment/3.0";

function coordinatesFromText(value) {
  const match = String(value || "").trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]); const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const dLon = (Number(lon2) - Number(lon1)) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(Number(lat1) * Math.PI / 180) * Math.cos(Number(lat2) * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchJson(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...(options.headers || {}) },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Route service returned ${response.status}.`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function geocode(location) {
  const raw = String(location || "").trim();
  if (!raw) return null;
  const direct = coordinatesFromText(raw);
  if (direct) return direct;
  if (!GEOCODING_ENABLED) return null;
  const key = `geo:${raw.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const url = new URL(GEOCODING_BASE_URL);
    url.searchParams.set("q", raw); url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1");
    const data = await fetchJson(url.toString());
    const result = Array.isArray(data) && data[0] ? { latitude: Number(data[0].lat), longitude: Number(data[0].lon), displayName: data[0].display_name } : null;
    cache.set(key, result); return result;
  } catch { cache.set(key, null); return null; }
}

function decodePolyline6(encoded) {
  const points = []; let index = 0; let lat = 0; let lng = 0;
  while (index < encoded.length) {
    let result = 0; let shift = 0; let byte;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index < encoded.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0; shift = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index < encoded.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ latitude: lat / 1e6, longitude: lng / 1e6 });
  }
  return points;
}

function costingForVehicle(vehicleType = "") {
  const type = String(vehicleType || "").toLowerCase();
  return type.includes("truck") || type.includes("lorry") || type.includes("pickup") || type.includes("bus") || type.includes("coach") || type.includes("motorcycle") || type.includes("bike") ? "driving" : "driving";
}

function normalizeRoute(route, provider, index = 0) {
  if (!route) return null;
  const distanceKm = Number(route.distanceKm ?? route.distance ?? 0);
  const durationMinutes = Number(route.durationMinutes ?? route.duration ?? 0);
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes)) return null;
  return {
    id: `${provider}-${index + 1}`,
    provider,
    distanceKm: distanceKm > 10000 ? distanceKm / 1000 : distanceKm,
    durationMinutes: durationMinutes > 10000 ? durationMinutes / 60 : durationMinutes,
    geometry: route.geometry || route.shape || null,
    geometryPoints: route.geometryPoints || [],
  };
}

async function getOsrmRoutes(origin, destination, { alternatives = true } = {}) {
  const url = `${OSRM_BASE_URL}/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=false&alternatives=${alternatives ? "true" : "false"}`;
  const data = await fetchJson(url, {}, 7000);
  return (data?.routes || []).map((route, index) => normalizeRoute({ distanceKm: Number(route.distance) / 1000, durationMinutes: Number(route.duration) / 60, geometry: route.geometry, geometryPoints: (route.geometry?.coordinates || []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })) }, "OSRM", index)).filter(Boolean);
}

async function locateRoadSegments(points = []) {
  // OSRM is the only routing engine now. Traffic observations use grid cells when
  // no provider-specific road segment identifier is available.
  return (Array.isArray(points) ? points : []).map((point) => ({
    segmentKey: null,
    baselineSpeedKph: null,
    latitude: Number(point?.latitude),
    longitude: Number(point?.longitude),
  }));
}

async function getRouteCandidates(pickup, destination, options = {}) {
  const [origin, target] = await Promise.all([
    typeof pickup === "object" ? Promise.resolve(pickup) : geocode(pickup),
    typeof destination === "object" ? Promise.resolve(destination) : geocode(destination),
  ]);
  const diagnostics = {
    requestedProvider: ROUTING_PROVIDER,
    osrm: { configured: Boolean(OSRM_BASE_URL), attempted: false, status: "NOT_ATTEMPTED", url: OSRM_BASE_URL },
    finalProvider: "UNAVAILABLE",
    fallbackReason: null,
    checkedAt: new Date(),
  };
  if (!origin || !target) return { pickupCoordinates: origin, destinationCoordinates: target, routes: [], diagnostics: { ...diagnostics, fallbackReason: "GEOCODING_UNAVAILABLE" } };

  let routes = [];
  diagnostics.osrm.attempted = true;
  try {
    routes = await getOsrmRoutes(origin, target, options);
    diagnostics.osrm.status = routes.length ? "AVAILABLE" : "NO_ROUTES";
  } catch (error) {
    diagnostics.osrm.status = "UNAVAILABLE";
    diagnostics.osrm.error = String(error?.message || "Unknown OSRM error").slice(0, 240);
    diagnostics.fallbackReason = "OSRM_UNAVAILABLE";
    if (ROUTING_DEBUG && process.env.NODE_ENV !== "test") console.debug("OSRM routing unavailable; using Haversine fallback:", error.message);
  }
  if (!routes.length) {
    const distanceKm = haversineKm(origin.latitude, origin.longitude, target.latitude, target.longitude);
    routes = [{ id: "HAVERSINE-1", provider: "HAVERSINE_FALLBACK", distanceKm, durationMinutes: distanceKm > 0 ? distanceKm / 45 * 60 : 0, geometry: null, geometryPoints: [origin, target] }];
    diagnostics.finalProvider = "HAVERSINE_FALLBACK";
    diagnostics.fallbackReason = diagnostics.fallbackReason || "OSRM_UNAVAILABLE";
  } else {
    diagnostics.finalProvider = routes[0].provider;
  }
  diagnostics.checkedAt = new Date();
  return { pickupCoordinates: origin, destinationCoordinates: target, routes, diagnostics };
}

async function getRoutingHealth() {
  const result = {
    requestedProvider: ROUTING_PROVIDER,
    osrm: { configured: Boolean(OSRM_BASE_URL), url: OSRM_BASE_URL, status: "UNKNOWN" },
    checkedAt: new Date(),
  };
  try {
    const origin = { latitude: 16.5062, longitude: 80.6480 };
    const target = { latitude: 17.3850, longitude: 78.4867 };
    await getOsrmRoutes(origin, target, { alternatives: false });
    result.osrm.status = "AVAILABLE";
  } catch (error) {
    result.osrm.status = "UNAVAILABLE";
    result.osrm.error = String(error?.message || "Unable to reach OSRM").slice(0, 240);
  }
  result.checkedAt = new Date();
  return result;
}

async function getRouteEstimate(pickup, destination, options = {}) {
  const result = await getRouteCandidates(pickup, destination, options);
  const route = result.routes[0];
  if (!route) return { distanceKm: null, durationMinutes: null, pickupCoordinates: result.pickupCoordinates, destinationCoordinates: result.destinationCoordinates, source: "UNAVAILABLE", routes: [], diagnostics: result.diagnostics };
  return { ...route, pickupCoordinates: result.pickupCoordinates, destinationCoordinates: result.destinationCoordinates, source: route.provider, routes: result.routes, diagnostics: result.diagnostics };
}

module.exports = { getRouteEstimate, getRouteCandidates, geocode, haversineKm, decodePolyline6, locateRoadSegments, getRoutingHealth };
