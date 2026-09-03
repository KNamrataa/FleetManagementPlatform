import { useCallback, useEffect, useState } from "react";
import { Activity, Car, CheckCircle, Clock3, Gauge, RefreshCw, Route, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";
import DriverLayout from "./DriverLayout";
import "./DriverDashboard.css";

const n = (v) => Number(v || 0);
const statusClass = (s = "") => s.toLowerCase().replaceAll("_", "-");
const fmtDate = (v) => v ? new Date(v).toLocaleString() : "—";

export default function DriverOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await apiRequest("/api/driver/dashboard"); setData(response.dashboard); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const d = data || {};
  const cards = [
    [Activity, "Today's Trips", n(d.todayTrips)],
    [Route, "Active Trip", d.activeTrip?.tripId || "None"],
    [Car, "Assigned Vehicle", d.assignedVehicle?.registrationNumber || "None"],
    [CheckCircle, "Completed Trips", n(d.completedTrips)],
    [UserCheck, "Driver Status", d.driverStatus || "—"],
    [Gauge, "Total Distance", `${n(d.totalDistance).toLocaleString()} km`],
  ];

  return <DriverLayout title="Driver Overview" subtitle="Your assigned operations and trip activity">
    <div className="driver-toolbar"><div><h2>Operations Overview</h2><p>Live information from MongoDB</p></div><button className="driver-button" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    {error && <div className="driver-alert error">{error}</div>}
    {loading && !data ? <div className="driver-loading"><div className="driver-loading-text"><div className="driver-spinner"/><p>Loading your dashboard...</p></div></div> : <>
      <div className="driver-cards">{cards.map(([Icon, label, value]) => <div className="driver-card" key={label}><div className="driver-card-icon"><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong></div></div>)}</div>
      <div className="driver-grid">
        <section className="driver-panel"><h2>Active Trip</h2>{d.activeTrip ? <><div className="driver-detail-grid"><div className="driver-detail"><span>Trip ID</span><strong>{d.activeTrip.tripId}</strong></div><div className="driver-detail"><span>Status</span><strong><span className={`driver-badge ${statusClass(d.activeTrip.tripStatus)}`}>{d.activeTrip.tripStatus.replaceAll("_", " ")}</span></strong></div><div className="driver-detail"><span>Customer</span><strong>{d.activeTrip.customer?.fullName || "—"}</strong></div><div className="driver-detail"><span>Vehicle</span><strong>{d.activeTrip.vehicle?.registrationNumber || "—"}</strong></div><div className="driver-detail"><span>Route</span><strong className="driver-route">{d.activeTrip.pickupLocation} → {d.activeTrip.destination}</strong></div><div className="driver-detail"><span>Started</span><strong>{fmtDate(d.activeTrip.actualStart)}</strong></div></div><div className="driver-actions" style={{marginTop:16}}><button className="driver-button primary" onClick={() => navigate(`/driver/trips/${d.activeTrip._id}`)}>View Trip</button></div></> : <div className="driver-empty"><Clock3 size={34}/><h3>No active trip</h3><p>You do not have an in-progress trip right now.</p></div>}</section>
        <section className="driver-panel"><h2>My Vehicle</h2>{d.assignedVehicle ? <div className="driver-info-list"><div className="driver-info-row"><span>Registration</span><strong>{d.assignedVehicle.registrationNumber}</strong></div><div className="driver-info-row"><span>Vehicle</span><strong>{d.assignedVehicle.make} {d.assignedVehicle.model}</strong></div><div className="driver-info-row"><span>Type</span><strong>{d.assignedVehicle.vehicleType}</strong></div><div className="driver-info-row"><span>Status</span><strong><span className={`driver-badge ${statusClass(d.assignedVehicle.status)}`}>{d.assignedVehicle.status?.replaceAll("_", " ")}</span></strong></div></div> : <div className="driver-empty"><Car size={34}/><h3>No vehicle assigned</h3><p>No vehicle is currently assigned to you.</p></div>}</section>
      </div>
      <section className="driver-panel" style={{marginTop:18}}><div className="driver-toolbar"><div><h2>Today's Trips</h2><p>Trips scheduled for your account today</p></div><button className="driver-button" onClick={() => navigate("/driver/trips")}>View all</button></div><div className="driver-table-wrap"><table className="driver-table"><thead><tr><th>Trip</th><th>Route</th><th>Vehicle</th><th>Time</th><th>Status</th></tr></thead><tbody>{(d.todayTripsList || []).map(t => <tr key={t._id}><td>{t.tripId}</td><td>{t.pickupLocation} → {t.destination}</td><td>{t.vehicle?.registrationNumber || "—"}</td><td>{fmtDate(t.scheduledStart)}</td><td><span className={`driver-badge ${statusClass(t.tripStatus)}`}>{t.tripStatus.replaceAll("_", " ")}</span></td></tr>)}{!d.todayTripsList?.length && <tr><td colSpan="5" className="driver-empty">No trips scheduled for today.</td></tr>}</tbody></table></div></section>
    </>}
  </DriverLayout>;
}
