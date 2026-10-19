import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, ClipboardCheck, RefreshCw, ShieldAlert, Upload, Wrench } from "lucide-react";
import { apiRequest } from "../services/api";
import DriverLayout from "./DriverLayout";
import "./DriverDashboard.css";
import "./DigitalVehicleInspection.css";

const LABEL = { PRE_TRIP: "Before trip", POST_TRIP: "After trip", PASSED: "Passed", DEFECTS_FOUND: "Defects found", SAFETY_HOLD: "Safety hold", PASS: "Pass", FAIL: "Fail", NOT_APPLICABLE: "Not applicable" };
const formatDate = v => v ? new Date(v).toLocaleString("en-IN") : "—";

async function imageToDataUrl(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const source = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("Unable to read image.")); r.readAsDataURL(file); });
  const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Invalid image file.")); img.src = source; });
  const scale = Math.min(1, 850 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL("image/jpeg", 0.62);
  if (result.length > 950_000) throw new Error("Photo is too large after compression. Choose a smaller image.");
  return result;
}

export default function DriverInspections() {
  const [vehicle, setVehicle] = useState(null);
  const [trips, setTrips] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [history, setHistory] = useState([]);
  const [type, setType] = useState("PRE_TRIP");
  const [tripId, setTripId] = useState("");
  const [odometer, setOdometer] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [base, tripData, historyData] = await Promise.all([
        apiRequest("/api/driver/inspections/checklist"),
        apiRequest("/api/driver/trips?limit=100"),
        apiRequest("/api/driver/inspections"),
      ]);
      setVehicle(base.vehicle || null);
      setChecklist((base.checklist || []).map(x => ({ ...x, status: "", severity: "LOW", notes: "", photos: [] })));
      setTrips(tripData.trips || []); setHistory(historyData.inspections || []);
      setOdometer(String(base.vehicle?.currentOdometer ?? ""));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateItem = (index, patch) => setChecklist(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const addPhoto = async (index, file) => {
    if (!file) return;
    setError("");
    try {
      if (checklist.reduce((sum, row) => sum + row.photos.length, 0) >= 3) throw new Error("You can attach up to 3 photographs per inspection.");
      const photo = await imageToDataUrl(file); setChecklist(rows => rows.map((row, i) => i === index ? { ...row, photos: [...row.photos, photo].slice(0, 3) } : row));
    } catch (e) { setError(e.message); }
  };
  const submit = async e => {
    e.preventDefault(); setError(""); setMessage("");
    if (!vehicle?._id) return setError("No assigned or registered vehicle was found for your driver account.");
    const incomplete = checklist.find(row => !row.status);
    if (incomplete) return setError(`Please complete: ${incomplete.item}.`);
    const failed = checklist.find(row => row.status === "FAIL" && row.notes.trim().length < 5);
    if (failed) return setError(`Add at least 5 characters describing the defect in ${failed.item}.`);
    setBusy(true);
    try {
      const result = await apiRequest("/api/driver/inspections", { method: "POST", body: JSON.stringify({ vehicleId: vehicle._id, tripId: tripId || undefined, inspectionType: type, odometerReading: Number(odometer), generalNotes, checklist }) });
      setMessage(result.message || "Inspection submitted.");
      setChecklist(rows => rows.map(row => ({ ...row, status: "", severity: "LOW", notes: "", photos: [] })));
      setGeneralNotes("");
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <DriverLayout title="Digital Vehicle Inspection" subtitle="Record vehicle condition before and after trips">
    <div className="driver-toolbar"><div><h2>Vehicle safety checklist</h2><p>Complete every item and report defects before submitting.</p></div><div className="driver-actions"><button type="button" className="driver-button" onClick={load}><RefreshCw size={16}/> Refresh</button></div></div>
    {error && <div className="driver-alert error"><AlertTriangle size={17}/> {error}</div>}
    {message && <div className="driver-alert success"><CheckCircle2 size={17}/> {message}</div>}
    {loading ? <div className="driver-loading"><div className="driver-loading-text"><div className="driver-spinner"/><p>Loading inspection form...</p></div></div> : <>
      {vehicle?.safetyHold && <div className="driver-alert error"><ShieldAlert size={20}/><div><strong>Vehicle is on safety hold</strong><p>{vehicle.safetyHoldReason || "An unresolved safety defect must be cleared by Maintenance."} Do not start a new trip with this vehicle.</p></div></div>}
      {!vehicle ? <section className="driver-panel"><div className="driver-empty"><ClipboardCheck size={38}/><h3>No vehicle available</h3><p>Your account needs an assigned vehicle or registered owner-driver vehicle before you can submit an inspection.</p></div></section> : <form onSubmit={submit}>
        <section className="driver-panel" style={{ marginBottom: 18 }}><div className="driver-panel-head"><div><h3>{vehicle.registrationNumber || vehicle.vehicleNumber || "Assigned vehicle"}</h3><p>{[vehicle.make, vehicle.model, vehicle.vehicleType].filter(Boolean).join(" · ")}</p></div><span className={`driver-badge ${vehicle.safetyHold ? "critical" : "available"}`}>{vehicle.safetyHold ? "SAFETY HOLD" : String(vehicle.status || "AVAILABLE").replaceAll("_", " ")}</span></div>
          <div className="driver-form-grid"><div className="driver-form-group"><label>Inspection type</label><select className="driver-select" value={type} onChange={e => setType(e.target.value)}><option value="PRE_TRIP">Before trip</option><option value="POST_TRIP">After trip</option></select></div><div className="driver-form-group"><label>Related trip (optional)</label><select className="driver-select" value={tripId} onChange={e => setTripId(e.target.value)}><option value="">Select trip</option>{trips.map(t => <option key={t._id} value={t._id}>{t.tripId || t._id.slice(-6)} · {t.tripStatus} · {t.destination || t.pickupLocation || "Trip"}</option>)}</select></div><div className="driver-form-group"><label>Odometer reading (km)</label><input className="driver-input" type="number" min={vehicle.currentOdometer || 0} step="0.1" required value={odometer} onChange={e => setOdometer(e.target.value)}/><small>Latest recorded: {Number(vehicle.currentOdometer || 0).toLocaleString()} km</small></div></div>
        </section>
        <section className="driver-panel" style={{ marginBottom: 18 }}><div className="driver-panel-head"><div><h3>Inspection checklist</h3><p>Choose Pass, Fail or Not applicable for each component.</p></div><ClipboardCheck size={22}/></div>
          <div style={{ display: "grid", gap: 12 }}>{checklist.map((row, index) => <div key={row.item} style={{ border: "1px solid var(--border, #dce3ea)", borderRadius: 12, padding: 14 }}><div className="driver-panel-head" style={{ marginBottom: 10 }}><h3 style={{ fontSize: 15, margin: 0 }}>{index + 1}. {row.item}</h3>{row.status === "FAIL" && <span className="driver-badge critical">DEFECT</span>}</div><div className="driver-form-group"><label>Condition</label><select className="driver-select" required value={row.status} onChange={e => updateItem(index, { status: e.target.value, ...(e.target.value === "FAIL" ? {} : { notes: "", photos: [] }) })}><option value="">Choose condition</option><option value="PASS">Pass</option><option value="FAIL">Fail — defect found</option><option value="NOT_APPLICABLE">Not applicable</option></select></div>
            {row.status === "FAIL" && <div className="driver-form-grid" style={{ marginTop: 10 }}><div className="driver-form-group full"><label>Defect description (required)</label><textarea className="driver-input" required minLength={5} maxLength={1000} value={row.notes} onChange={e => updateItem(index, { notes: e.target.value })} placeholder="Describe the defect, location and symptoms"/></div><div className="driver-form-group"><label>Severity</label><select className="driver-select" value={row.severity} onChange={e => updateItem(index, { severity: e.target.value })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select><small>Brakes, tyres, seat belts and steering defects are automatically treated as critical.</small></div><div className="driver-form-group"><label>Photographs (up to 3)</label><label className="driver-button" style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content" }}><Camera size={16}/> Add photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden disabled={row.photos.length >= 3} onChange={e => { addPhoto(index, e.target.files?.[0]); e.target.value = ""; }}/></label><small>{row.photos.length} photo(s) attached</small></div>{row.photos.length > 0 && <div className="driver-form-group full"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{row.photos.map((photo, photoIndex) => <div key={photoIndex} style={{ position: "relative" }}><img src={photo} alt={`${row.item} defect ${photoIndex + 1}`} style={{ width: 96, height: 76, objectFit: "cover", borderRadius: 8 }}/><button type="button" className="driver-button" style={{ display: "block", marginTop: 4 }} onClick={() => updateItem(index, { photos: row.photos.filter((_, i) => i !== photoIndex) })}>Remove</button></div>)}</div></div>}</div>}
          </div>)}</div>
        </section>
        <section className="driver-panel"><div className="driver-form-group"><label>Additional notes (optional)</label><textarea className="driver-input" maxLength={3000} rows={3} value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} placeholder="Any other observations"/></div><div className="driver-form-actions"><button className="driver-button primary" disabled={busy || !vehicle}>{busy ? "Submitting inspection..." : <><Upload size={16}/> Submit inspection</>}</button></div><p className="driver-muted" style={{ marginTop: 10 }}>Submitting a critical defect automatically creates maintenance issues and places the vehicle on safety hold. A manager must clear the hold after repairs.</p></section>
      </form>}
      <section className="driver-panel" style={{ marginTop: 22 }}><div className="driver-panel-head"><div><h3>Inspection history</h3><p>Recent submissions and their outcomes</p></div><ClipboardCheck size={21}/></div>{history.length ? <div style={{ display: "grid", gap: 10 }}>{history.map(item => <div key={item._id} className="driver-issue-item"><div className="driver-issue-item-head"><div className="driver-inline"><strong>{LABEL[item.inspectionType] || item.inspectionType}</strong><span className={`driver-badge ${item.overallStatus === "SAFETY_HOLD" ? "critical" : item.overallStatus === "PASSED" ? "available" : "pending"}`}>{LABEL[item.overallStatus] || item.overallStatus}</span></div><span className="driver-muted">{formatDate(item.submittedAt)}</span></div><p>{item.vehicle?.registrationNumber || "Vehicle"} · Odometer {Number(item.odometerReading || 0).toLocaleString()} km · {item.defects?.length || 0} defect(s)</p>{item.defects?.map(d => <p key={d._id || d.checklistItem} style={{ marginTop: 4 }}><AlertTriangle size={14} style={{ display: "inline" }}/> {d.checklistItem}: {d.description} ({d.severity})</p>)}</div>)}</div> : <div className="driver-empty"><ClipboardCheck size={34}/><p>No inspections have been submitted yet.</p></div>}</section>
    </>}
  </DriverLayout>;
}
