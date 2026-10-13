import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  Pause,
  RefreshCw,
  Check,
  Radio,
  MapPinned,
  Route,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket } from "../services/socket";
import { apiRequest } from "../services/api";
import DriverLayout from "./DriverLayout";
import "./DriverDashboard.css";

const cls = (s = "") => s.toLowerCase().replaceAll("_", "-");
const fmt = (v) => (v ? new Date(v).toLocaleString() : "—");

export default function DriverTripDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(false);
  const [finalOdometer, setFinalOdometer] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [routeSuggestion, setRouteSuggestion] = useState(null);
  const [routeOptimization, setRouteOptimization] = useState(null);

  const watchRef = useRef(null);
  const gpsIntervalRef = useRef(null);
  const lastSentRef = useRef(0);
  const sendingRef = useRef(false);

  const [gpsState, setGpsState] = useState({
    sharing: false,
    message: "Waiting for an active trip.",
    lastSent: null,
    coords: null,
    accuracy: null,
    error: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest(`/api/driver/trips/${id}`);
      setTrip(response.trip);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadRouteOptimization = useCallback(async () => {
    if (!id) return;
    try {
      let response = await apiRequest(`/api/routes/${id}`);
      let route = response?.route || null;
      if (!route || route.status !== "READY") {
        try {
          const optimized = await apiRequest(`/api/routes/${id}/optimize`, { method: "POST", body: JSON.stringify({}) });
          route = optimized?.route || route;
        } catch (optimizationError) {
          console.warn("Initial route optimization unavailable:", optimizationError.message);
        }
      }
      if (route) {
        setRouteOptimization(route);
        if (route.recommendation?.better) {
          setRouteSuggestion({
            available: true,
            timeSavedMinutes: Number(route.recommendation.timeSavedMinutes || 0),
            distanceSavedKm: Number(route.recommendation.distanceSavedKm || 0),
            distanceKm: route.distanceKm,
            durationMinutes: route.durationMinutes,
            trafficDelayMinutes: route.trafficDelayMinutes,
            traffic: route.traffic,
            optimizationScore: route.optimizationScore,
            provider: route.provider,
            geometry: route.geometry,
            geometryPoints: route.geometryPoints,
            alternatives: route.alternatives,
          });
        }
      }
    } catch (e) {
      console.warn("Unable to load route optimization:", e.message);
    }
  }, [id]);

  useEffect(() => {
    loadRouteOptimization();
  }, [loadRouteOptimization]);

  useEffect(() => {
    const active = ["IN_PROGRESS", "PAUSED"].includes(trip?.tripStatus);

    if (!active) {
      if (watchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }

      if (gpsIntervalRef.current !== null) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }

      setGpsState((state) => ({
        ...state,
        sharing: false,
        message: "GPS sharing is off because the trip is not active.",
      }));

      return;
    }

    if (!navigator.geolocation) {
      setGpsState((state) => ({
        ...state,
        sharing: false,
        message: "This browser does not support geolocation.",
        error: "Geolocation API is not supported.",
      }));

      return;
    }

    const socket = getSocket();
    const sendGps = async (position) => {
      if (!position?.coords || sendingRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastSentRef.current < 3000) {
        return;
      }

      const {
        latitude,
        longitude,
        speed,
        accuracy,
        heading,
      } = position.coords;

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return;
      }

      sendingRef.current = true;
      lastSentRef.current = now;

      const recordedAt = new Date(
        position.timestamp || Date.now()
      ).toISOString();

      const payload = {
        tripId: id,
        latitude,
        longitude,
        speed: speed ?? 0,
        accuracy: accuracy ?? null,
        heading: heading ?? null,
        recordedAt,
        currentLocation: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      };

      setGpsState((state) => ({
        ...state,
        sharing: true,
        message: "Sending live GPS location...",
        coords: {
          latitude,
          longitude,
        },
        accuracy: accuracy ?? null,
        error: null,
      }));

      let socketSent = false;
      try {
        if (!socket.connected) {
          socket.connect();
        }

        await new Promise((resolve) => {
          let finished = false;

          const finish = () => {
            if (finished) return;
            finished = true;
            resolve();
          };

          socket.emit("driver:gps", payload, (ack) => {
            if (ack?.success) {
              socketSent = true;
              if (ack?.routeSuggestion?.available) setRouteSuggestion(ack.routeSuggestion);

              setGpsState((state) => ({
                ...state,
                sharing: true,
                message: "Live GPS location is being shared.",
                lastSent: new Date(),
              }));
            } else {
              setGpsState((state) => ({
                ...state,
                message:
                  ack?.message ||
                  "Socket GPS update failed. Trying HTTP fallback...",
              }));
            }

            finish();
          });

          setTimeout(finish, 5000);
        });
      } catch (socketError) {
        console.warn(
          "Socket GPS update failed:",
          socketError
        );
      }

      if (!socketSent) {
        try {
          const response = await apiRequest(
            `/api/gps/trips/${id}`,
            {
              method: "POST",
              body: JSON.stringify(payload),
            }
          );

          if (response?.success) {
            if (response?.tracking?.routeSuggestion?.available) setRouteSuggestion(response.tracking.routeSuggestion);
            setGpsState((state) => ({
              ...state,
              sharing: true,
              message: "Live GPS location is being shared.",
              lastSent: new Date(),
            }));
          }
        } catch (httpError) {
          console.error(
            "HTTP GPS update failed:",
            httpError
          );

          setGpsState((state) => ({
            ...state,
            sharing: false,
            message:
              httpError?.message ||
              "Unable to send GPS location.",
            error: httpError,
          }));
        }
      }

      sendingRef.current = false;
    };
    const onPosition = (position) => {
      sendGps(position);
    };

    const onError = (geoError) => {
      let message =
        "GPS signal unavailable. Tracking will resume automatically.";

      if (geoError.code === 1) {
        message =
          "Location permission denied. Enable location access in your browser.";
      } else if (geoError.code === 2) {
        message =
          "Location unavailable. Make sure Windows/browser location services are enabled.";
      } else if (geoError.code === 3) {
        message =
          "GPS request timed out. Retrying automatically...";
      }

      setGpsState((state) => ({
        ...state,
        sharing: false,
        message,
        error: geoError,
      }));
    };

    navigator.geolocation.getCurrentPosition(
      onPosition,
      onError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );

    watchRef.current = navigator.geolocation.watchPosition(
      onPosition,
      onError,
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      }
    );

    gpsIntervalRef.current = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      navigator.geolocation.getCurrentPosition(
        onPosition,
        onError,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }
      );
    }, 5000);

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(
          watchRef.current
        );
        watchRef.current = null;
      }

      if (gpsIntervalRef.current !== null) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }

    };
  }, [trip?.tripStatus, id]);

  const recalculateRoute = async () => {
    setBusy(true);
    setError("");
    try {
      const currentPosition = gpsState.coords
        ? { latitude: gpsState.coords.latitude, longitude: gpsState.coords.longitude }
        : undefined;
      const response = await apiRequest(`/api/routes/${id}/recalculate`, {
        method: "POST",
        body: JSON.stringify(currentPosition ? { currentPosition } : {}),
      });
      if (response?.route?.recommendation?.better || response?.route?.distanceKm) {
        const route = response.route;
        setRouteOptimization(route);
        setRouteSuggestion({
          available: Boolean(route.recommendation?.better),
          timeSavedMinutes: Number(route.recommendation?.timeSavedMinutes || 0),
          distanceSavedKm: Number(route.recommendation?.distanceSavedKm || 0),
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          trafficDelayMinutes: route.trafficDelayMinutes,
          traffic: route.traffic,
          optimizationScore: route.optimizationScore,
          provider: route.provider,
          geometry: route.geometry,
          geometryPoints: route.geometryPoints,
          alternatives: route.alternatives,
        });
      }
      setMessage(response?.route?.recommendation?.better ? "A more efficient route was found." : "Route recalculated. The current route remains the best available option.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(
        `/api/driver/trips/${id}/accept`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      setTrip(response.trip);
      setMessage(response.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(
        `/api/driver/trips/${id}/start`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      setTrip(response.trip);
      setMessage(
        response.message ||
          "Trip started. Live GPS tracking is now active."
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pause = async () => {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(
        `/api/driver/trips/${id}/pause`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      setTrip(response.trip);
      setMessage(response.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(
        `/api/driver/trips/${id}/resume`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      setTrip(response.trip);
      setMessage(response.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    setError("");

    try {
      const response = await apiRequest(
        `/api/driver/trips/${id}/complete`,
        {
          method: "POST",
          body: JSON.stringify({
            finalOdometer:
              finalOdometer === ""
                ? undefined
                : Number(finalOdometer),
            notes,
            confirmation: true,
          }),
        }
      );

      setTrip(response.trip);
      setMessage(response.message);
      setModal(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DriverLayout
      title="Trip Details"
      subtitle="View and operate your assigned trip"
    >
      <div className="driver-toolbar">
        <div>
          <button
            className="driver-button"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>

        <button
          className="driver-button"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="driver-alert error">
          {error}
        </div>
      )}

      {message && (
        <div className="driver-alert success">
          {message}
        </div>
      )}

      {loading ? (
        <div className="driver-loading">
          <div className="driver-loading-text">
            <div className="driver-spinner" />
            <p>Loading trip...</p>
          </div>
        </div>
      ) : trip ? (
        <>
          <section className="driver-panel">
            <div
              className="driver-inline"
              style={{ marginBottom: 18 }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  {trip.tripId}
                </h2>

                <span className="driver-muted">
                  {trip.pickupLocation} →{" "}
                  {trip.destination}
                </span>
              </div>

              <span
                className={`driver-badge ${cls(
                  trip.tripStatus
                )}`}
                style={{ marginLeft: "auto" }}
              >
                {trip.tripStatus.replaceAll(
                  "_",
                  " "
                )}
              </span>
            </div>

            {}
            <div
              className={`driver-gps-status ${
                gpsState.sharing
                  ? "active"
                  : "warning"
              }`}
            >
              <div>
                <span className="driver-gps-icon">
                  {gpsState.sharing ? (
                    <Radio size={18} />
                  ) : (
                    <MapPinned size={18} />
                  )}
                </span>

                <div>
                  <strong>
                    {gpsState.sharing
                      ? "Live location sharing ON"
                      : "Live location needs attention"}
                  </strong>

                  <p>
                    {gpsState.message}
                  </p>
                </div>
              </div>

              <small>
                {gpsState.coords
                  ? `${gpsState.coords.latitude.toFixed(
                      6
                    )}, ${gpsState.coords.longitude.toFixed(
                      6
                    )}`
                  : "Waiting for coordinates"}

                {gpsState.accuracy != null
                  ? ` · ±${Math.round(
                      gpsState.accuracy
                    )}m`
                  : ""}

                {gpsState.lastSent
                  ? ` · sent ${gpsState.lastSent.toLocaleTimeString()}`
                  : ""}
              </small>
            </div>

            {routeOptimization && (
              <section className="driver-route-optimization">
                <div className="driver-route-optimization-head">
                  <div className="driver-inline" style={{ gap: 10 }}>
                    <Route size={20} />
                    <div>
                      <strong>Route Optimization</strong>
                      <p className="driver-muted" style={{ margin: "4px 0 0" }}>
                        Distance, ETA and traffic-aware route efficiency for this trip.
                      </p>
                    </div>
                  </div>
                  <button className="driver-button" onClick={recalculateRoute} disabled={busy}>
                    <RefreshCw size={15} />
                    Recalculate Route
                  </button>
                </div>
                <div className="driver-detail-grid" style={{ marginTop: 14 }}>
                  <div className="driver-detail"><span>Optimized distance</span><strong>{routeOptimization.distanceKm != null ? `${Number(routeOptimization.distanceKm).toFixed(2)} km` : "—"}</strong></div>
                  <div className="driver-detail"><span>Estimated travel time</span><strong>{routeOptimization.durationMinutes != null ? `${Number(routeOptimization.durationMinutes).toFixed(1)} min` : "—"}</strong></div>
                  <div className="driver-detail"><span>Traffic delay</span><strong>{routeOptimization.traffic?.source !== "NO_TRAFFIC_DATA" && routeOptimization.trafficDelayMinutes != null ? `${Number(routeOptimization.trafficDelayMinutes).toFixed(1)} min` : "—"}</strong></div>
                  <div className="driver-detail"><span>Optimization score</span><strong>{routeOptimization.optimizationScore != null ? `${routeOptimization.optimizationScore}/100` : "N/A (no traffic data)"}</strong></div><div className="driver-detail"><span>Fuel estimate</span><strong>{routeOptimization.fuelEstimate?.fuelUnits != null ? `${Number(routeOptimization.fuelEstimate.fuelUnits).toFixed(2)} ${routeOptimization.fuelEstimate.fuelType === "ELECTRIC" ? "kWh" : "units"}` : "—"}</strong></div><div className="driver-detail"><span>Fuel cost estimate</span><strong>{routeOptimization.fuelEstimate?.fuelCost != null ? `₹${Number(routeOptimization.fuelEstimate.fuelCost).toFixed(2)}` : "—"}</strong></div><div className="driver-detail"><span>Route reliability</span><strong>{routeOptimization.reliabilityScore != null ? `${Math.round(routeOptimization.reliabilityScore)}/100` : "—"}</strong></div>
                  <div className="driver-detail"><span>Traffic condition</span><strong>{routeOptimization.traffic?.source === "NO_TRAFFIC_DATA" || !Number(routeOptimization.traffic?.samples || 0) ? "Unknown — no traffic data" : (routeOptimization.traffic?.label || routeOptimization.traffic?.condition || `${Math.round(routeOptimization.traffic.congestionPercent || 0)}% congestion`)}</strong></div>
                  <div className="driver-detail"><span>Routing provider</span><strong>{routeOptimization.provider || "—"}</strong></div>
                </div>
                {trip.routePerformance && (
                  <div className="driver-detail-grid" style={{ marginTop: 10 }}>
                    <div className="driver-detail"><span>Actual duration</span><strong>{trip.routePerformance.actualDurationMinutes != null ? `${Number(trip.routePerformance.actualDurationMinutes).toFixed(1)} min` : "—"}</strong></div>
                    <div className="driver-detail"><span>ETA accuracy</span><strong>{trip.routePerformance.durationAccuracyPercent != null ? `${Number(trip.routePerformance.durationAccuracyPercent).toFixed(1)}%` : "—"}</strong></div>
                    <div className="driver-detail"><span>Duration variance</span><strong>{trip.routePerformance.durationVarianceMinutes != null ? `${Number(trip.routePerformance.durationVarianceMinutes).toFixed(1)} min` : "—"}</strong></div>
                    <div className="driver-detail"><span>Distance variance</span><strong>{trip.routePerformance.distanceVarianceKm != null ? `${Number(trip.routePerformance.distanceVarianceKm).toFixed(1)} km` : "—"}</strong></div>
                  </div>
                )}
                {Array.isArray(routeOptimization.alternatives) && routeOptimization.alternatives.length > 0 && (
                  <div className="driver-route-alternatives">
                    <strong>Alternative routes</strong>
                    {routeOptimization.alternatives.map((alternative, index) => (
                      <div className="driver-route-alternative" key={`${alternative.provider || "route"}-${index}`}>
                        <span>Route {index + 2}</span>
                        <span>{Number(alternative.distanceKm || 0).toFixed(1)} km</span>
                        <span>{Number(alternative.durationMinutes || 0).toFixed(1)} min</span>
                        <span>Score {alternative.optimizationScore ?? "—"}/100</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {routeSuggestion?.available && (
              <section
                style={{
                  marginTop: 18,
                  padding: 16,
                  borderRadius: 12,
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  background: "rgba(16, 185, 129, 0.08)",
                }}
              >
                <div className="driver-inline" style={{ gap: 10, alignItems: "center" }}>
                  <Route size={20} />
                  <div>
                    <strong>Better route available</strong>
                    <p className="driver-muted" style={{ margin: "4px 0 0" }}>
                      Traffic-aware FleetFlow optimization found a potentially faster route.
                    </p>
                  </div>
                  <button className="driver-button" onClick={recalculateRoute} disabled={busy} style={{ marginLeft: "auto" }}>
                    <RefreshCw size={15} />
                    Recalculate
                  </button>
                </div>
                <div className="driver-detail-grid" style={{ marginTop: 14 }}>
                  <div className="driver-detail"><span>Time saved</span><strong>{Number(routeSuggestion.timeSavedMinutes || 0).toFixed(1)} min</strong></div>
                  <div className="driver-detail"><span>Distance saved</span><strong>{Number(routeSuggestion.distanceSavedKm || 0).toFixed(1)} km</strong></div>
                  <div className="driver-detail"><span>New ETA</span><strong>{Number(routeSuggestion.durationMinutes || 0).toFixed(1)} min</strong></div>
                  <div className="driver-detail"><span>Traffic delay</span><strong>{Number(routeSuggestion.trafficDelayMinutes || 0).toFixed(1)} min</strong></div>
                  <div className="driver-detail"><span>Optimization score</span><strong>{routeSuggestion.optimizationScore ?? "—"}/100</strong></div>
                  <div className="driver-detail"><span>Routing provider</span><strong>{routeSuggestion.provider || "—"}</strong></div>
                </div>
              </section>
            )}

            <div className="driver-detail-grid">
              <div className="driver-detail">
                <span>Customer</span>
                <strong>
                  {trip.customer?.fullName ||
                    "—"}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Vehicle</span>
                <strong>
                  {trip.vehicle
                    ?.registrationNumber ||
                    "—"}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Vehicle Type</span>
                <strong>
                  {trip.vehicle?.vehicleType ||
                    "—"}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Customer Email</span>
                <strong>
                  {trip.customer?.email ||
                    "—"}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Pickup</span>
                <strong>
                  {trip.pickupLocation}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Destination</span>
                <strong>
                  {trip.destination}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Scheduled Start</span>
                <strong>
                  {fmt(trip.scheduledStart)}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Scheduled End</span>
                <strong>
                  {fmt(trip.scheduledEnd)}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Driver Acceptance</span>
                <strong>
                  {fmt(
                    trip.driverAcceptedAt
                  )}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Actual Start</span>
                <strong>
                  {fmt(trip.actualStart)}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Actual End</span>
                <strong>
                  {fmt(trip.actualEnd)}
                </strong>
              </div>

              <div className="driver-detail">
                <span>Distance</span>
                <strong>
                  {Number(
                    trip.distance || 0
                  ).toLocaleString()}{" "}
                  km
                </strong>
              </div>

              <div className="driver-detail">
                <span>Notes</span>
                <strong>
                  {trip.notes || "—"}
                </strong>
              </div>
            </div>

            <div
              className="driver-actions"
              style={{ marginTop: 20 }}
            >
              {trip.tripStatus === "ASSIGNED" &&
                !trip.driverAcceptedAt && (
                  <button
                    className="driver-button"
                    onClick={accept}
                    disabled={busy}
                  >
                    <Check size={16} />
                    {busy
                      ? "Processing..."
                      : "Accept Trip"}
                  </button>
                )}

              {trip.tripStatus === "ASSIGNED" &&
                trip.driverAcceptedAt && (
                  <button
                    className="driver-button primary"
                    onClick={start}
                    disabled={busy}
                  >
                    <Play size={16} />
                    {busy
                      ? "Starting..."
                      : "Start Trip"}
                  </button>
                )}

              {trip.tripStatus ===
                "IN_PROGRESS" && (
                <button
                  className="driver-button"
                  onClick={pause}
                  disabled={busy}
                >
                  <Pause size={16} />
                  {busy
                    ? "Pausing..."
                    : "Pause Trip"}
                </button>
              )}

              {trip.tripStatus === "PAUSED" && (
                <button
                  className="driver-button primary"
                  onClick={resume}
                  disabled={busy}
                >
                  <Play size={16} />
                  {busy
                    ? "Resuming..."
                    : "Resume Trip"}
                </button>
              )}

              {[
                "IN_PROGRESS",
                "PAUSED",
              ].includes(trip.tripStatus) && (
                <button
                  className="driver-button success"
                  onClick={() => setModal(true)}
                  disabled={busy}
                >
                  <CheckCircle2 size={16} />
                  Complete Trip
                </button>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="driver-panel">
          <div className="driver-empty">
            <h3>Trip not found</h3>
            <p>
              This trip is not available for your
              driver account.
            </p>
          </div>
        </section>
      )}

      {modal && (
        <div className="driver-modal-backdrop">
          <div className="driver-modal">
            <div className="driver-modal-head">
              <h2>Complete Trip</h2>

              <button
                className="driver-icon-button"
                onClick={() =>
                  setModal(false)
                }
              >
                ×
              </button>
            </div>

            <div className="driver-form">
              <div className="driver-form-group">
                <label>
                  Final Odometer
                </label>

                <input
                  className="driver-input"
                  type="number"
                  min="0"
                  value={finalOdometer}
                  onChange={(e) =>
                    setFinalOdometer(
                      e.target.value
                    )
                  }
                  placeholder="e.g. 72980"
                />
              </div>

              <div className="driver-form-group full">
                <label>
                  Trip Notes
                </label>

                <textarea
                  className="driver-input"
                  value={notes}
                  onChange={(e) =>
                    setNotes(e.target.value)
                  }
                  placeholder="Delivery/completion notes"
                />
              </div>

              <div className="driver-form-actions">
                <button
                  className="driver-button"
                  onClick={() =>
                    setModal(false)
                  }
                >
                  Cancel
                </button>

                <button
                  className="driver-button success"
                  onClick={complete}
                  disabled={busy}
                >
                  {busy
                    ? "Completing..."
                    : "Confirm Completion"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DriverLayout>
  );
}