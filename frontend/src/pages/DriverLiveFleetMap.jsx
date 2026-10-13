import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Gauge, MapPin, RefreshCw, Route, TrafficCone, Truck, Zap } from "lucide-react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import DriverLayout from "./DriverLayout";
import { apiRequest } from "../services/api";
import "./DriverDashboard.css";

const fmt = (v) => (v ? new Date(v).toLocaleString() : "—");
const etaLabel = (source) => source === "LIVE_SPEED" ? "Live speed" : source === "ROUTE_ESTIMATE" ? "Route estimate" : "—";
const n = (v, digits = 1) => Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : "—";
const badge = (s = "") => String(s).toLowerCase().replaceAll("_", "-");

const fleetIcon = (selected = false, own = false) => L.divIcon({
  className: `driver-fleet-marker ${selected ? "selected" : ""} ${own ? "own" : ""}`,
  html: `<div class="driver-fleet-marker-dot"><span></span></div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -20],
});

function MapViewport({ points, selectedPosition }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (points.length > 1) {
        map.fitBounds(points, { padding: [40, 40], maxZoom: 14, animate: false });
      } else if (selectedPosition) {
        map.setView(selectedPosition, Math.max(map.getZoom(), 14), { animate: false });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [map, points, selectedPosition]);
  return null;
}

export default function DriverLiveFleetMap() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recalculating, setRecalculating] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError("");
    try {
      const response = await apiRequest("/api/driver/live-fleet");
      const next = response?.vehicles || [];
      setVehicles(next);
      setSelectedId((current) => current && next.some((v) => String(v.trip?._id) === String(current)) ? current : String(next[0]?.trip?._id || ""));
    } catch (e) {
      setError(e.message || "Unable to load live fleet map.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const selected = useMemo(() => vehicles.find((v) => String(v.trip?._id) === String(selectedId)) || vehicles[0] || null, [vehicles, selectedId]);
  const tracked = useMemo(() => vehicles.filter((v) => Number.isFinite(Number(v.tracking?.latitude)) && Number.isFinite(Number(v.tracking?.longitude))), [vehicles]);
  const points = useMemo(() => tracked.map((v) => [Number(v.tracking.latitude), Number(v.tracking.longitude)]), [tracked]);
  const selectedPosition = selected?.tracking && Number.isFinite(Number(selected.tracking.latitude)) && Number.isFinite(Number(selected.tracking.longitude))
    ? [Number(selected.tracking.latitude), Number(selected.tracking.longitude)] : null;
  const routePoints = useMemo(() => Array.isArray(selected?.routeOptimization?.geometryPoints)
    ? selected.routeOptimization.geometryPoints.filter((p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude))).map((p) => [Number(p.latitude), Number(p.longitude)])
    : [], [selected]);

  const recalculate = async () => {
    if (!selected?.trip?._id) return;
    setRecalculating(true); setError(""); setMessage("");
    try {
      const currentPosition = selectedPosition ? { latitude: selectedPosition[0], longitude: selectedPosition[1] } : undefined;
      const response = await apiRequest(`/api/routes/${selected.trip._id}/recalculate`, {
        method: "POST",
        body: JSON.stringify(currentPosition ? { currentPosition } : {}),
      });
      const route = response?.route;
      if (route) {
        setVehicles((current) => current.map((v) => String(v.trip?._id) === String(selected.trip._id) ? { ...v, routeOptimization: route, alternativeRoutes: route.alternatives || [] } : v));
        setMessage(route.recommendation?.better ? `Better route found — saves about ${n(route.recommendation.timeSavedMinutes, 0)} minutes.` : "Route recalculated. The current route remains the best available option.");
      }
    } catch (e) { setError(e.message || "Unable to recalculate route."); }
    finally { setRecalculating(false); }
  };

  const traffic = selected?.routeOptimization?.traffic || {};
  const route = selected?.routeOptimization;
  const congestion = Number(traffic.congestionPercent || 0);
  const hasLiveTraffic = Number(traffic.samples || 0) > 0 && traffic.source !== "NO_TRAFFIC_DATA";
  const trafficLabel = hasLiveTraffic ? (traffic.label || (congestion >= 60 ? "Heavy" : congestion >= 30 ? "Moderate" : congestion >= 10 ? "Light" : "Free-flow")) : "Unknown";
  const trafficAnalysis = route?.trafficAnalysis || {};
  const ownDriver = (() => { try { return JSON.parse(sessionStorage.getItem("fleetUser") || "{}")._id || JSON.parse(sessionStorage.getItem("fleetUser") || "{}").id; } catch { return ""; } })();

  return <DriverLayout title="Live Fleet Map" subtitle="Live fleet positions, optimized routes and traffic intelligence">
    <div className="driver-toolbar">
      <div><h2>Live Fleet Map</h2><p>Monitor active fleet vehicles and the route efficiency of your current trip.</p></div>
      <button className="driver-button" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "driver-refresh-spin" : ""}/> Refresh</button>
    </div>
    {error && <div className="driver-alert error">{error}</div>}
    {message && <div className="driver-alert success">{message}</div>}

    <div className="driver-fleet-layout">
      <section className="driver-panel driver-fleet-map-panel">
        <div className="driver-fleet-map-head">
          <div><strong>Fleet positions</strong><span>{tracked.length} live vehicle{tracked.length === 1 ? "" : "s"} · updates every 5 seconds</span></div>
          <span className="driver-live-pill"><Activity size={13}/> LIVE</span>
        </div>
        <div className="driver-fleet-map-canvas">
          {loading ? <div className="driver-map-loading"><div className="driver-spinner"/><span>Loading live fleet map...</span></div> : <MapContainer center={selectedPosition || points[0] || [20.5937, 78.9629]} zoom={selectedPosition ? 14 : 5} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {routePoints.length > 1 && <Polyline positions={routePoints} pathOptions={{ weight: 6, opacity: .78 }} />}
            {tracked.map((vehicle) => {
              const position = [Number(vehicle.tracking.latitude), Number(vehicle.tracking.longitude)];
              const isSelected = String(vehicle.trip?._id) === String(selected?.trip?._id);
              const isOwn = ownDriver && String(vehicle.assignedDriver?._id || "") === String(ownDriver);
              return <Marker key={String(vehicle.trip?._id || vehicle._id)} position={position} icon={fleetIcon(isSelected, isOwn)} eventHandlers={{ click: () => setSelectedId(String(vehicle.trip?._id || "")) }}>
                <Popup><strong>{vehicle.registrationNumber}</strong><br/>Driver: {vehicle.assignedDriver?.fullName || "—"}<br/>Trip: {vehicle.trip?.tripId || "—"}<br/>Speed: {n(vehicle.tracking.speed, 1)} km/h<br/>Updated: {fmt(vehicle.tracking.recordedAt)}</Popup>
              </Marker>;
            })}
            <MapViewport points={points} selectedPosition={selectedPosition}/>
          </MapContainer>}
        </div>
        {!tracked.length && !loading && <div className="driver-map-empty"><MapPin size={24}/><strong>No live fleet coordinates yet</strong><span>Vehicles appear here after an active driver/device sends GPS coordinates.</span></div>}
      </section>

      <aside className="driver-panel driver-route-intelligence-panel">
        <div className="driver-fleet-section-title"><div><Route size={18}/><div><h2>Route Intelligence</h2><span>Select an active vehicle to inspect its route.</span></div></div></div>
        {vehicles.length > 0 && <select className="driver-select driver-fleet-trip-select" value={selected?.trip?._id || ""} onChange={(e) => setSelectedId(e.target.value)}>{vehicles.map((v) => <option key={String(v.trip?._id)} value={String(v.trip?._id)}>{v.trip?.tripId} — {v.registrationNumber}</option>)}</select>}
        {!selected ? <div className="driver-empty"><Truck size={34}/><h3>No active fleet trips</h3><p>Start an active trip to see live vehicles and route intelligence.</p></div> : <>
          <div className="driver-selected-trip"><strong>{selected.trip?.tripId}</strong><span>{selected.trip?.pickupLocation} → {selected.trip?.destination}</span></div>
          <div className="driver-route-kpis">
            <div><Route size={16}/><span>Optimized Distance</span><strong>{route?.distanceKm != null ? `${n(route.distanceKm, 2)} km` : "—"}</strong></div>
            <div><Clock3 size={16}/><span>ETA / Duration</span><strong>{route?.durationMinutes != null ? `${n(route.durationMinutes, 0)} min` : "—"}</strong></div>
            <div><TrafficCone size={16}/><span>Traffic</span><strong>{route ? (hasLiveTraffic ? `${trafficLabel} · ${n(route.trafficDelayMinutes, 0)} min delay` : "Unknown · no traffic data") : "—"}</strong></div>
            <div><Zap size={16}/><span>Optimization Score</span><strong>{route?.optimizationScore != null ? `${n(route.optimizationScore, 0)}/100` : "—"}</strong></div>
            <div><Gauge size={16}/><span>Current Speed</span><strong>{selected.tracking ? `${n(selected.tracking.speed, 1)} km/h` : "—"}</strong></div>
            <div><MapPin size={16}/><span>Remaining Distance</span><strong>{selected.tracking ? `${n(selected.tracking.remainingDistance, 2)} km` : "—"}</strong></div>
          </div>
          <div className="driver-info-list driver-fleet-extra-info">
            <div className="driver-info-row"><span>Distance Travelled</span><strong>{selected.tracking ? `${n(selected.tracking.distanceTravelled, 2)} km` : "—"}</strong></div>
            <div className="driver-info-row"><span>Estimated Arrival</span><strong>{fmt(selected.tracking?.estimatedArrival)}{selected.tracking?.estimatedArrivalSource && selected.tracking.estimatedArrivalSource !== "NONE" ? ` · ${etaLabel(selected.tracking.estimatedArrivalSource)}` : ""}</strong></div>
            <div className="driver-info-row"><span>Traffic Source</span><strong>{traffic.source || "—"}</strong></div>
            <div className="driver-info-row"><span>Traffic Samples</span><strong>{traffic.samples || 0} live points</strong></div>
            <div className="driver-info-row"><span>Observed / baseline speed</span><strong>{hasLiveTraffic && traffic.observedSpeedKph != null ? `${n(traffic.observedSpeedKph, 1)} / ${n(traffic.baselineSpeedKph, 1)} km/h` : "—"}</strong></div>
            <div className="driver-info-row"><span>Routing Provider</span><strong>{route?.provider || "—"}</strong></div>{route?.routingDiagnostics?.fallbackReason && <div className="driver-info-row"><span>Routing Fallback</span><strong>{route.routingDiagnostics.fallbackReason.replaceAll("_"," ")}</strong></div>}
            <div className="driver-info-row"><span>Last GPS Update</span><strong>{fmt(selected.tracking?.recordedAt)}</strong></div>
          </div>
          {Array.isArray(route?.explanation) && route.explanation.length > 0 && <div className="driver-route-explanation"><strong>Why this route?</strong><ul>{route.explanation.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}{trafficAnalysis.samplePoints>0&&<div className="driver-route-traffic-analysis"><strong>Road-segment traffic analysis</strong><div className="driver-score-grid"><div><span>Sample points</span><b>{trafficAnalysis.samplePoints}</b></div><div><span>Segments analyzed</span><b>{trafficAnalysis.segmentsAnalyzed}</b></div><div><span>Coverage</span><b>{trafficAnalysis.coveragePercent}%</b></div><div><span>Avg congestion</span><b>{trafficAnalysis.averageCongestionPercent}%</b></div><div><span>Bottleneck</span><b>{trafficAnalysis.bottleneckCongestionPercent}%</b></div><div><span>Closures</span><b>{trafficAnalysis.roadClosures}</b></div></div></div>}
          {route?.scoreBreakdown && <div className="driver-route-score-breakdown"><strong>Optimization score breakdown</strong><div className="driver-score-grid">{[["Time",route.scoreBreakdown.time],["Traffic",route.scoreBreakdown.traffic],["Distance",route.scoreBreakdown.distance],["Reliability",route.scoreBreakdown.reliability],["Closures",route.scoreBreakdown.closure],["Fuel",route.scoreBreakdown.fuel]].map(([label,value])=><div key={label}><span>{label}</span><b>{value == null ? "N/A" : `${value}/100`}</b></div>)}</div></div>}
          {route?.recommendation?.better && <div className="driver-better-route"><Zap size={18}/><div><strong>Better route available</strong><span>Save about {n(route.recommendation.timeSavedMinutes, 0)} min{route.recommendation.distanceComparison === "SIMILAR" ? " · Similar distance" : route.recommendation.distanceDifferenceKm != null ? ` · ${route.recommendation.distanceComparison === "SHORTER" ? "shorter" : "longer"} by ${n(Math.abs(route.recommendation.distanceDifferenceKm), 2)} km` : ""}.</span></div></div>}
          {Array.isArray(route?.alternatives) && route.alternatives.length > 0 && <div className="driver-route-alternatives"><strong>Alternative routes</strong>{route.alternatives.map((alt, index) => <div className="driver-route-alternative" key={`${alt.provider}-${index}`}><span>Option {index + 1}</span><span>{n(alt.distanceKm, 1)} km</span><span>{n(alt.durationMinutes, 0)} min</span><span>Score {n(alt.optimizationScore, 0)}</span></div>)}</div>}
          <div className="driver-actions driver-fleet-actions"><button className="driver-button primary" onClick={recalculate} disabled={recalculating}><RefreshCw size={15}/>{recalculating ? "Recalculating..." : "Recalculate Route"}</button><button className="driver-button" onClick={() => navigate(`/driver/trips/${selected.trip?._id}`)}>View Trip Details</button></div>
        </>}
      </aside>
    </div>
  </DriverLayout>;
}
