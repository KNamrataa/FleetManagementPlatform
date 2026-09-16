import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle, Eye, RefreshCw, Search, Truck, X, XCircle } from "lucide-react";
import FleetManagerLayout from "./FleetManagerLayout";
import { apiRequest } from "../services/api";

const STATUSES = ["PENDING", "REVIEWED", "ACCEPTED", "TRIP_CREATED", "REJECTED", "CANCELLED"];
const emptySchedule = { vehicle: "", driver: "", scheduledStart: "", scheduledEnd: "", distance: 0, notes: "" };

function dateTimeValue(request) {
  const base = request?.requestedDate ? new Date(request.requestedDate) : new Date(Date.now() + 3600000);
  if (Number.isNaN(base.getTime())) return new Date(Date.now() + 3600000).toISOString().slice(0, 16);
  if (request?.requestedTime && /^\d{1,2}:\d{2}$/.test(request.requestedTime)) {
    const [h, m] = request.requestedTime.split(":").map(Number);
    base.setHours(h, m, 0, 0);
  }
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const fmtDate = (value) => value ? new Date(value).toLocaleString() : "—";

export default function TripRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modal, setModal] = useState(null);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, v, d] = await Promise.all([
        apiRequest(`/api/trip-requests?search=${encodeURIComponent(search)}&status=${status}`),
        apiRequest("/api/vehicles?status=AVAILABLE"),
        apiRequest("/api/drivers?status=AVAILABLE"),
      ]);
      setRequests(r.requests || []);
      setVehicles(v.vehicles || []);
      setDrivers(d.drivers || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => STATUSES.reduce((acc, key) => ({ ...acc, [key]: requests.filter(r => r.status === key).length }), {}), [requests]);
  const eligibleVehicles = vehicles.filter((v) => (v.ownershipType !== "DRIVER_OWNED" || v.approvalStatus === "APPROVED") && !["MAINTENANCE", "INACTIVE", "ON_TRIP"].includes(v.status));
  const selectedVehicle = eligibleVehicles.find((v) => v._id === schedule.vehicle);
  useEffect(() => {
    if (selectedVehicle?.ownershipType === "DRIVER_OWNED") {
      const ownerId = selectedVehicle.ownerId?._id || selectedVehicle.ownerId || "";
      setSchedule((current) => current.driver === ownerId ? current : ({ ...current, driver: ownerId }));
    }
  }, [selectedVehicle?._id, selectedVehicle?.ownershipType, selectedVehicle?.ownerId?._id, selectedVehicle?.ownerId]);

  const updateStatus = async (request, nextStatus) => {
    try {
      const body = { status: nextStatus };
      if (nextStatus === "REJECTED") {
        const reason = window.prompt("Reason for rejecting this request:", "") || "";
        body.rejectionReason = reason;
      }
      const result = await apiRequest(`/api/trip-requests/${request._id}/status`, { method: "PATCH", body: JSON.stringify(body) });
      setSuccess(result.message);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const openSchedule = (request) => {
    setSchedule({ ...emptySchedule, scheduledStart: dateTimeValue(request), notes: request.specialInstructions || "" });
    setModal({ type: "schedule", request });
  };

  const submitSchedule = async (e) => {
    e.preventDefault();
    if (!modal?.request) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiRequest(`/api/trip-requests/${modal.request._id}/schedule`, { method: "POST", body: JSON.stringify(schedule) });
      setSuccess(result.message);
      setModal(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FleetManagerLayout title="Trip Requests" subtitle="Review customer requests and schedule fleet resources">
      <div className="fm-toolbar">
        <div><h2>Customer Trip Requests</h2><p>Customer requests are stored in MongoDB and become operational trips only after scheduling.</p></div>
        <div className="fm-actions"><button onClick={load}><RefreshCw size={16}/> Refresh</button></div>
      </div>

      {error && <div className="fm-alert error">{error}<button onClick={() => setError("")}><X size={14}/></button></div>}
      {success && <div className="fm-alert success">{success}<button onClick={() => setSuccess("")}><X size={14}/></button></div>}

      <div className="fm-stats">
        <div className="fm-stat"><div className="fm-stat-icon"><Calendar size={18}/></div><div><span>Pending</span><strong>{counts.PENDING || 0}</strong></div></div>
        <div className="fm-stat"><div className="fm-stat-icon"><Eye size={18}/></div><div><span>Reviewed</span><strong>{counts.REVIEWED || 0}</strong></div></div>
        <div className="fm-stat"><div className="fm-stat-icon"><CheckCircle size={18}/></div><div><span>Accepted</span><strong>{counts.ACCEPTED || 0}</strong></div></div>
        <div className="fm-stat"><div className="fm-stat-icon"><Truck size={18}/></div><div><span>Scheduled</span><strong>{counts.TRIP_CREATED || 0}</strong></div></div>
        <div className="fm-stat"><div className="fm-stat-icon"><XCircle size={18}/></div><div><span>Rejected</span><strong>{counts.REJECTED || 0}</strong></div></div>
      </div>

      <div className="fm-card">
        <div className="fm-filters">
          <div className="fm-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search request, customer, pickup, destination..."/></div>
          <select value={status} onChange={e => setStatus(e.target.value)}><option value="">All Status</option>{STATUSES.map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select>
        </div>
        {loading ? <div className="fm-loading"><div className="spinner"/>Loading customer requests...</div> : !requests.length ? <div className="fm-empty-state"><Calendar size={34}/><h3>No customer trip requests</h3><p>New requests submitted by customers will appear here.</p></div> : (
          <div className="fm-table-wrap"><table className="fm-table"><thead><tr><th>Request</th><th>Customer</th><th>Route</th><th>Requested</th><th>Service</th><th>Vehicle Requirement</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{requests.map(r => <tr key={r._id}>
              <td><strong>{r.requestNumber}</strong></td>
              <td>{r.customer?.fullName || "Unknown"}<small>{r.customer?.email || ""}</small></td>
              <td>{r.pickupLocation} → {r.destination}</td>
              <td>{fmtDate(r.requestedDate)}{r.requestedTime ? <small>{r.requestedTime}</small> : null}</td>
              <td>{r.serviceType || "—"}</td>
              <td>{r.vehicleType || "Any suitable vehicle"}</td>
              <td><span className={`fm-badge ${r.status.toLowerCase().replaceAll("_", "-")}`}>{r.status.replaceAll("_", " ")}</span></td>
              <td><div className="fm-icon-actions">
                <button title="View" onClick={() => setModal({ type: "view", request: r })}><Eye size={16}/></button>
                {r.status === "PENDING" && <button title="Mark reviewed" onClick={() => updateStatus(r, "REVIEWED")}><Eye size={16}/></button>}
                {!["TRIP_CREATED", "REJECTED", "CANCELLED"].includes(r.status) && <button className="activate" title="Accept" onClick={() => updateStatus(r, "ACCEPTED")}><CheckCircle size={16}/></button>}
                {!["TRIP_CREATED", "REJECTED", "CANCELLED"].includes(r.status) && <button className="primary" title="Schedule trip" onClick={() => openSchedule(r)}><Truck size={16}/></button>}
                {!["TRIP_CREATED", "REJECTED", "CANCELLED"].includes(r.status) && <button className="danger" title="Reject" onClick={() => updateStatus(r, "REJECTED")}><XCircle size={16}/></button>}
              </div></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </div>

      {modal && <div className="fm-modal-backdrop" onMouseDown={() => setModal(null)}><div className="fm-modal wide" onMouseDown={e => e.stopPropagation()}>
        {modal.type === "view" ? <>
          <div className="fm-modal-head"><h2>{modal.request.requestNumber}</h2><button onClick={() => setModal(null)}><X/></button></div>
          <div className="fm-detail-grid">
            {[['Customer', modal.request.customer?.fullName || '—'], ['Email', modal.request.customer?.email || '—'], ['Pickup', modal.request.pickupLocation], ['Destination', modal.request.destination], ['Requested', `${fmtDate(modal.request.requestedDate)} ${modal.request.requestedTime || ''}`], ['Service Type', modal.request.serviceType || '—'], ['Vehicle Requirement', modal.request.vehicleType || '—'], ['Passengers', modal.request.passengerCount || 0], ['Cargo', modal.request.cargoDetails || '—'], ['Cargo Weight', modal.request.cargoWeight ? `${modal.request.cargoWeight} kg` : '—'], ['Status', modal.request.status.replaceAll('_', ' ')], ['Special Instructions', modal.request.specialInstructions || '—']].map(([a,b]) => <div key={a}><span>{a}</span><strong>{b}</strong></div>)}
          </div>
          {modal.request.trip && <div className="fm-alert success">Trip {modal.request.trip.tripId || "created"} is already associated with this request.</div>}
        </> : <form onSubmit={submitSchedule}>
          <div className="fm-modal-head"><h2>Schedule {modal.request.requestNumber}</h2><button type="button" onClick={() => setModal(null)}><X/></button></div>
          <div className="fm-detail-grid"><div><span>Customer</span><strong>{modal.request.customer?.fullName || "—"}</strong></div><div><span>Route</span><strong>{modal.request.pickupLocation} → {modal.request.destination}</strong></div></div>
          <div className="fm-form-grid">
            <label>Vehicle<select required value={schedule.vehicle} onChange={e => { const value=e.target.value; const next=eligibleVehicles.find(v=>v._id===value); setSchedule({...schedule, vehicle:value, driver:next?.ownershipType === "DRIVER_OWNED" ? (next.ownerId?._id || next.ownerId || "") : schedule.driver}); }}><option value="">Select available vehicle</option>{eligibleVehicles.map(v => <option key={v._id} value={v._id}>{v.vehicleNumber || v.registrationNumber} — {v.registrationNumber} ({v.ownershipType === "DRIVER_OWNED" ? `Owner: ${v.ownerId?.fullName || "Unknown"}` : "Company"})</option>)}</select></label>
            <label>Driver<select required disabled={selectedVehicle?.ownershipType === "DRIVER_OWNED"} value={schedule.driver} onChange={e => setSchedule({...schedule, driver: e.target.value})}><option value="">{selectedVehicle?.ownershipType === "DRIVER_OWNED" ? "Owner-driver selected automatically" : "Select available driver"}</option>{drivers.map(d => <option key={d._id} value={d._id}>{d.fullName} ({d.status})</option>)}</select>{selectedVehicle?.ownershipType === "DRIVER_OWNED" && <small>Driver-owned vehicle: only {selectedVehicle.ownerId?.fullName || "the owner-driver"} can be assigned.</small>}</label>
            <label>Scheduled Start<input required type="datetime-local" value={schedule.scheduledStart} onChange={e => setSchedule({...schedule, scheduledStart: e.target.value})}/></label>
            <label>Scheduled End<input type="datetime-local" value={schedule.scheduledEnd} onChange={e => setSchedule({...schedule, scheduledEnd: e.target.value})}/></label>
            <label>Distance (km)<input type="number" min="0" value={schedule.distance} onChange={e => setSchedule({...schedule, distance: e.target.value})}/></label>
            <label>Notes<textarea value={schedule.notes} onChange={e => setSchedule({...schedule, notes: e.target.value})}/></label>
          </div>
          <div className="fm-modal-foot"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Scheduling..." : "Accept & Schedule Trip"}</button></div>
        </form>}
      </div></div>}
    </FleetManagerLayout>
  );
}