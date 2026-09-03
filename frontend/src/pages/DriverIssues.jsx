import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Eye, Plus, RefreshCw } from "lucide-react";
import { apiRequest } from "../services/api";
import DriverLayout from "./DriverLayout";
import "./DriverDashboard.css";

const cls = (s = "") => s.toLowerCase().replaceAll("_", "-");

export default function DriverIssues() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ issueType: "ENGINE", severity: "MEDIUM", description: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setIssues((await apiRequest("/api/driver/issues")).issues || []); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const r = await apiRequest("/api/driver/issues", { method: "POST", body: JSON.stringify(form) });
      setIssues((x) => [r.issue, ...x]);
      setMessage(r.message); setOpen(false);
      setForm({ issueType: "ENGINE", severity: "MEDIUM", description: "" });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <DriverLayout title="Vehicle Issues" subtitle="Report issues for your currently assigned vehicle">
    <div className="driver-toolbar">
      <div><h2>Reported Issues</h2><p>Issues you reported are stored in MongoDB</p></div>
      <div className="driver-actions"><button className="driver-button" onClick={load}><RefreshCw size={16}/> Refresh</button><button className="driver-button primary" onClick={() => setOpen(true)}><Plus size={16}/> Report Issue</button></div>
    </div>
    {error && <div className="driver-alert error">{error}</div>}
    {message && <div className="driver-alert success">{message}</div>}
    {loading ? <div className="driver-loading"><div className="driver-loading-text"><div className="driver-spinner"/><p>Loading issues...</p></div></div> : <section className="driver-panel">
      {issues.length ? <div className="driver-issue-list">{issues.map((i) => <div className="driver-issue-item" key={i._id}>
        <div className="driver-issue-item-head"><div className="driver-inline"><AlertTriangle size={18}/><h3>{i.issueType} · {i.severity}</h3><span className={`driver-badge ${cls(i.status)}`}>{i.status.replaceAll("_", " ")}</span></div><span className="driver-muted">{new Date(i.reportedAt || i.createdAt).toLocaleString()}</span></div>
        <p>{i.description}</p>
        <div className="driver-inline" style={{ marginTop: 10, fontSize: 12 }}><span>Vehicle: <strong>{i.vehicle?.registrationNumber || "—"}</strong></span>{i.trip?.tripId && <span>Trip: <strong>{i.trip.tripId}</strong></span>}</div>
        <div className="driver-actions" style={{ marginTop: 10 }}><button className="driver-button" onClick={() => setSelected(i)}><Eye size={15}/> View Details</button></div>
      </div>)}</div> : <div className="driver-empty"><AlertTriangle size={38}/><h3>No issues reported</h3><p>Use Report Issue if your assigned vehicle has a problem.</p></div>}
    </section>}

    {open && <div className="driver-modal-backdrop"><div className="driver-modal"><div className="driver-modal-head"><h2>Report Vehicle Issue</h2><button className="driver-icon-button" onClick={() => setOpen(false)}>×</button></div>
      <form className="driver-form" onSubmit={submit}>
        <div className="driver-form-group"><label>Issue Type</label><select className="driver-select" value={form.issueType} onChange={(e) => setForm({ ...form, issueType: e.target.value })}><option>ENGINE</option><option>BRAKE</option><option>TYRE</option><option>ELECTRICAL</option><option>AC</option><option>TRANSMISSION</option><option>OTHER</option></select></div>
        <div className="driver-form-group"><label>Severity</label><select className="driver-select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></div>
        <div className="driver-form-group full"><label>Description</label><textarea className="driver-input" required minLength="5" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the issue clearly"/></div>
        <div className="driver-form-actions"><button type="button" className="driver-button" onClick={() => setOpen(false)}>Cancel</button><button className="driver-button primary" disabled={busy}>{busy ? "Submitting..." : "Submit Issue"}</button></div>
      </form>
    </div></div>}

    {selected && <div className="driver-modal-backdrop"><div className="driver-modal"><div className="driver-modal-head"><h2>Issue Details</h2><button className="driver-icon-button" onClick={() => setSelected(null)}>×</button></div>
      <div className="driver-info-list"><div className="driver-info-row"><span>Vehicle</span><strong>{selected.vehicle?.registrationNumber || "—"}</strong></div><div className="driver-info-row"><span>Issue Type</span><strong>{selected.issueType}</strong></div><div className="driver-info-row"><span>Severity</span><strong>{selected.severity}</strong></div><div className="driver-info-row"><span>Status</span><strong>{selected.status}</strong></div><div className="driver-info-row"><span>Reported</span><strong>{new Date(selected.reportedAt || selected.createdAt).toLocaleString()}</strong></div><div className="driver-info-row"><span>Description</span><strong>{selected.description}</strong></div>{selected.resolutionNotes && <div className="driver-info-row"><span>Resolution</span><strong>{selected.resolutionNotes}</strong></div>}</div>
      <div className="driver-form-actions"><button className="driver-button" onClick={() => setSelected(null)}>Close</button></div>
    </div></div>}
  </DriverLayout>;
}
