import NotificationBell from "../components/NotificationBell";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  UserCircle,
  Wrench,
  X,
} from "lucide-react";
import { apiRequest, getStoredUser } from "../services/api";
import "./MaintenanceManager.css";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const label = value => String(value || "").replaceAll("_", " ");
const date = value => value
  ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  : "—";
const dateTime = value => value ? new Date(value).toLocaleString("en-IN") : "—";

export default function MaintenanceManagerDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(getStoredUser() || {});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest("/api/maintenance/dashboard"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) setUser(storedUser);
  }, [location.pathname]);

  const logout = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear the local session even when the logout endpoint is unavailable.
    }
    sessionStorage.removeItem("fleetUser");
    sessionStorage.removeItem("fleetToken");
    navigate("/login", { replace: true });
  };

  const path = location.pathname;
  const title = path === "/maintenance"
    ? "Maintenance Overview"
    : path.includes("requests")
      ? "Maintenance Requests"
      : path.includes("work-orders")
        ? "Work Orders"
        : path.includes("vehicles")
          ? "Vehicles"
          : path.includes("schedule")
            ? "Service Schedule"
            : path.includes("history")
              ? "Maintenance History"
              : path.includes("costs")
                ? "Maintenance Costs"
                : "My Profile";

  return (
    <div className="mm-shell">
      <aside className={`mm-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="mm-brand">
          <div className="mm-brand-icon"><Car size={22} /></div>
          <span>Fleet<span>Flow</span></span>
        </div>

        <div className="mm-user">
          <div className="mm-avatar">{(user.fullName || "M").charAt(0).toUpperCase()}</div>
          <div>
            <strong>{user.fullName || "Maintenance Manager"}</strong>
            <span>Maintenance Manager</span>
          </div>
        </div>

        <nav className="mm-nav">
          {[
            ["/maintenance", "Overview", LayoutDashboard],
            ["/maintenance/requests", "Maintenance Requests", AlertTriangle],
            ["/maintenance/work-orders", "Work Orders", ClipboardList],
            ["/maintenance/vehicles", "Vehicles", Car],
            ["/maintenance/schedule", "Service Schedule", CalendarDays],
            ["/maintenance/history", "Maintenance History", Clock],
            ["/maintenance/costs", "Maintenance Costs", DollarSign],
            ["/maintenance/profile", "Profile", UserCircle],
          ].map(([to, text, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/maintenance"}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `mm-nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{text}</span>
            </NavLink>
          ))}
        </nav>

        <button className="mm-logout" onClick={logout}>
          <LogOut size={18} /> Logout
        </button>
      </aside>

      {menuOpen && (
        <button className="mm-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />
      )}

      <main className="mm-main">
        <header className="mm-header">
          <button className="mm-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
            <Menu size={21} />
          </button>
          <div>
            <p>MAINTENANCE MANAGER</p>
            <h1>{title}</h1>
            <span>Vehicle servicing, repairs and maintenance control</span>
          </div>
          <NotificationBell />
          <div className="mm-header-user">{user.fullName || "Maintenance Manager"}</div>
        </header>

        <div className="mm-content">
          {error && (
            <div className="mm-alert error">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button>
            </div>
          )}

          {path === "/maintenance" && (
            <Overview data={data} loading={loading} reload={loadDashboard} navigate={navigate} />
          )}
          {path.includes("requests") && <Requests />}
          {path.includes("work-orders") && <WorkOrders />}
          {path.includes("vehicles") && <Vehicles />}
          {path.includes("schedule") && <Schedules />}
          {path.includes("history") && <History />}
          {path.includes("costs") && <Costs />}
          {path.includes("profile") && <Profile />}
        </div>
      </main>
    </div>
  );
}

function Overview({ data, loading, reload, navigate }) {
  const k = data?.kpis || {};
  const cards = [
    [Car, "Total Vehicles", k.totalVehicles],
    [Wrench, "Under Maintenance", k.vehiclesUnderMaintenance],
    [AlertTriangle, "Open Requests", k.openRequests],
    [AlertTriangle, "High Priority", k.highPriorityRequests],
    [ClipboardList, "Active Work Orders", k.activeWorkOrders],
    [CheckCircle2, "Completed Work Orders", k.completedWorkOrders],
    [CalendarDays, "Service Due", k.vehiclesDueForService],
    [DollarSign, "Maintenance Cost", money(k.totalMaintenanceCost)],
  ];

  return (
    <>
      <Toolbar
        title="Maintenance Overview"
        subtitle="Live maintenance data from MongoDB"
        action={<button onClick={reload} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh</button>}
      />

      {loading && !data ? (
        <div className="mm-loading"><div className="spinner" /> Loading maintenance data...</div>
      ) : (
        <>
          <div className="mm-stats">
            {cards.map(([Icon, name, value]) => (
              <div className="mm-stat" key={name}>
                <div className="mm-stat-icon"><Icon size={19} /></div>
                <div><span>{name}</span><strong>{value ?? 0}</strong></div>
              </div>
            ))}
          </div>

          <div className="mm-grid-2">
            <Panel title="Recent Maintenance Requests">
              <Table
                headers={["Vehicle", "Issue", "Severity", "Reported By", "Status"]}
                rows={(data?.recentRequests || []).map(issue => [
                  issue.vehicle?.vehicleNumber || issue.vehicle?.registrationNumber || "—",
                  label(issue.issueType),
                  <Badge key="severity" value={issue.severity} />,
                  issue.reportedBy?.fullName || "—",
                  <Badge key="status" value={issue.status} />,
                ])}
                empty="No maintenance requests."
              />
            </Panel>

            <Panel title="Active Work Orders">
              <Table
                headers={["Work Order", "Vehicle", "Type", "Priority", "Status"]}
                rows={(data?.activeWorkOrders || []).map(order => [
                  order.workOrderNumber,
                  order.vehicle?.vehicleNumber || "—",
                  order.maintenanceType,
                  <Badge key="priority" value={order.priority} />,
                  <Badge key="status" value={order.status} />,
                ])}
                empty="No active work orders."
              />
            </Panel>
          </div>

          <Panel title="Upcoming Service / Due Soon">
            <Table
              headers={["Vehicle", "Service", "Due Date", "Due Odometer", "Status"]}
              rows={(data?.upcomingServices || []).map(schedule => [
                schedule.vehicle?.vehicleNumber || "—",
                schedule.serviceType,
                date(schedule.nextServiceDate),
                schedule.nextServiceOdometer ?? "—",
                <Badge key="status" value={schedule.calculatedStatus} />,
              ])}
              empty="No services currently due."
            />
            <div className="mm-inline-actions">
              <button onClick={() => navigate("/maintenance/requests")}>Review Requests</button>
              <button onClick={() => navigate("/maintenance/work-orders")}>Manage Work Orders</button>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

function Requests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [issueType, setIssueType] = useState("");
  const [selected, setSelected] = useState(null);
  const [createFor, setCreateFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (status) query.set("status", status);
      if (severity) query.set("severity", severity);
      if (issueType) query.set("issueType", issueType);
      const result = await apiRequest(`/api/maintenance/requests?${query.toString()}`);
      setRows(result.issues || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, severity, issueType]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const changeStatus = async (id, next) => {
    setError("");
    try {
      await apiRequest(`/api/maintenance/requests/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <Toolbar
        title="Maintenance Requests"
        subtitle="Driver-reported vehicle issues from MongoDB"
        action={<button onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh</button>}
      />

      <div className="mm-card mm-filter-card">
        <div className="mm-filters">
          <div className="mm-search">
            <Search size={17} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vehicle, driver or issue" />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Status</option>
            {['OPEN', 'IN_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          <select value={severity} onChange={e => setSeverity(e.target.value)}>
            <option value="">All Severity</option>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={issueType} onChange={e => setIssueType(e.target.value)}>
            <option value="">All Issue Types</option>
            {['ENGINE', 'BRAKE', 'TYRE', 'ELECTRICAL', 'AC', 'TRANSMISSION', 'OTHER'].map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="mm-alert error">{error}</div>}

      {loading ? (
        <div className="mm-loading"><div className="spinner" /> Loading maintenance requests...</div>
      ) : (
        <Panel title={`${rows.length} Request${rows.length === 1 ? "" : "s"}`}>
          <Table
            headers={["Issue", "Vehicle", "Driver", "Issue Type", "Severity", "Status", "Actions"]}
            rows={rows.map(issue => [
              issue._id?.slice(-8).toUpperCase(),
              issue.vehicle?.vehicleNumber || issue.vehicle?.registrationNumber || "—",
              issue.reportedBy?.fullName || "—",
              label(issue.issueType),
              <Badge key="severity" value={issue.severity} />,
              <Badge key="status" value={issue.status} />,
              <div className="mm-actions" key="actions">
                <button onClick={() => setSelected(issue)}>View</button>
                {issue.status === "OPEN" && <button onClick={() => changeStatus(issue._id, "IN_REVIEW")}>Review</button>}
                {['IN_REVIEW', 'IN_PROGRESS'].includes(issue.status) && <button className="primary" onClick={() => setCreateFor(issue)}>Create Work Order</button>}
                {issue.status === "IN_PROGRESS" && <button onClick={() => changeStatus(issue._id, "RESOLVED")}>Resolve</button>}
              </div>,
            ])}
            empty="No maintenance requests match the current filters."
          />
        </Panel>
      )}

      {selected && <RequestModal issue={selected} close={() => setSelected(null)} />}
      {createFor && <CreateWorkOrderModal issue={createFor} close={() => setCreateFor(null)} done={load} />}
    </>
  );
}

function RequestModal({ issue, close }) {
  return (
    <Modal title="Maintenance Request" subtitle={issue._id} close={close}>
      <div className="mm-detail-grid">
        <Detail label="Vehicle" value={`${issue.vehicle?.vehicleNumber || "—"} / ${issue.vehicle?.registrationNumber || "—"}`} />
        <Detail label="Driver" value={issue.reportedBy?.fullName || "—"} />
        <Detail label="Trip" value={issue.trip?.tripId || "Not linked"} />
        <Detail label="Issue Type" value={label(issue.issueType)} />
        <Detail label="Severity" value={label(issue.severity)} />
        <Detail label="Status" value={label(issue.status)} />
        <Detail label="Reported" value={dateTime(issue.reportedAt || issue.createdAt)} />
      </div>
      <div className="mm-description"><strong>Description</strong><p>{issue.description}</p></div>
      {issue.resolutionNotes && <div className="mm-description"><strong>Resolution Notes</strong><p>{issue.resolutionNotes}</p></div>}
      <div className="mm-modal-footer"><button onClick={close}>Close</button></div>
    </Modal>
  );
}

function CreateWorkOrderModal({ issue, close, done }) {
  const [form, setForm] = useState({
    maintenanceType: label(issue.issueType),
    priority: issue.severity || "MEDIUM",
    description: issue.description || "",
    assignedMechanic: "",
    expectedCompletionDate: "",
    odometerAtStart: issue.vehicle?.currentOdometer ?? "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (name, value) => setForm(previous => ({ ...previous, [name]: value }));

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiRequest("/api/maintenance/work-orders", {
        method: "POST",
        body: JSON.stringify({
          maintenanceRequest: issue._id,
          vehicle: issue.vehicle?._id,
          ...form,
        }),
      });
      close();
      await done();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Create Work Order" subtitle={`${issue.vehicle?.vehicleNumber || "Vehicle"} • ${label(issue.issueType)}`} close={close} wide>
      {error && <div className="mm-alert error">{error}</div>}
      <form onSubmit={submit}>
        <div className="mm-form-grid">
          <label>Maintenance Type<input required value={form.maintenanceType} onChange={e => update("maintenanceType", e.target.value)} /></label>
          <label>Priority
            <select value={form.priority} onChange={e => update("priority", e.target.value)}>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Assigned Mechanic<input value={form.assignedMechanic} onChange={e => update("assignedMechanic", e.target.value)} placeholder="e.g. Ravi Kumar" /></label>
          <label>Expected Completion<input type="datetime-local" value={form.expectedCompletionDate} onChange={e => update("expectedCompletionDate", e.target.value)} /></label>
          <label>Starting Odometer<input required type="number" min="0" value={form.odometerAtStart} onChange={e => update("odometerAtStart", e.target.value)} /></label>
          <label className="full">Repair Description<textarea required minLength="5" value={form.description} onChange={e => update("description", e.target.value)} /></label>
          <label className="full">Notes<textarea value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Additional maintenance instructions" /></label>
        </div>
        <div className="mm-modal-footer">
          <button type="button" onClick={close}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? "Creating..." : "Create Work Order"}</button>
        </div>
      </form>
    </Modal>
  );
}

function WorkOrders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows((await apiRequest("/api/maintenance/work-orders")).workOrders || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const start = async id => {
    setError("");
    try {
      await apiRequest(`/api/maintenance/work-orders/${id}/start`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const release = async id => {
    setError("");
    try {
      const result = await apiRequest(`/api/maintenance/work-orders/${id}/release`, { method: "POST" });
      await load();
      window.alert(result.message);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <Toolbar
        title="Work Orders"
        subtitle="Track repair jobs and vehicle availability"
        action={<button onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh</button>}
      />
      {error && <div className="mm-alert error">{error}</div>}
      {loading ? <div className="mm-loading"><div className="spinner" /> Loading work orders...</div> : (
        <Panel title={`${rows.length} Work Order${rows.length === 1 ? "" : "s"}`}>
          <Table
            headers={["Work Order", "Vehicle", "Type", "Mechanic", "Priority", "Status", "Actions"]}
            rows={rows.map(order => [
              order.workOrderNumber,
              order.vehicle?.vehicleNumber || "—",
              order.maintenanceType,
              order.assignedMechanic || "Unassigned",
              <Badge key="priority" value={order.priority} />,
              <Badge key="status" value={order.status} />,
              <div className="mm-actions" key="actions">
                {['PENDING', 'ASSIGNED', 'ON_HOLD'].includes(order.status) && <button className="primary" onClick={() => start(order._id)}>Start</button>}
                {order.status === "IN_PROGRESS" && <button className="primary" onClick={() => setComplete(order)}>Complete</button>}
                {order.status === "COMPLETED" && order.vehicle?.status === "MAINTENANCE" && <button className="primary" onClick={() => release(order._id)}>Release Vehicle</button>}
              </div>,
            ])}
            empty="No work orders found."
          />
        </Panel>
      )}
      {complete && <CompleteModal order={complete} close={() => setComplete(null)} done={() => { setComplete(null); load(); }} />}
    </>
  );
}

function CompleteModal({ order, close, done }) {
  const [form, setForm] = useState({
    laborCost: order.laborCost || 0,
    partsCost: order.partsCost || 0,
    otherCost: order.otherCost || 0,
    finalOdometer: order.vehicle?.currentOdometer || 0,
    notes: order.notes || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/maintenance/work-orders/${order._id}/complete`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      await done();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Complete Work Order" subtitle={order.workOrderNumber} close={close}>
      {error && <div className="mm-alert error">{error}</div>}
      <form onSubmit={submit}>
        <div className="mm-form-grid">
          <label>Labor Cost<input type="number" min="0" value={form.laborCost} onChange={e => setForm({ ...form, laborCost: e.target.value })} /></label>
          <label>Parts Cost<input type="number" min="0" value={form.partsCost} onChange={e => setForm({ ...form, partsCost: e.target.value })} /></label>
          <label>Other Cost<input type="number" min="0" value={form.otherCost} onChange={e => setForm({ ...form, otherCost: e.target.value })} /></label>
          <label>Final Odometer<input required type="number" min={order.vehicle?.currentOdometer || 0} value={form.finalOdometer} onChange={e => setForm({ ...form, finalOdometer: e.target.value })} /></label>
          <label className="full">Completion Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        <div className="mm-modal-footer"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Completing..." : "Complete Maintenance"}</button></div>
      </form>
    </Modal>
  );
}

function Vehicles() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createFor, setCreateFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setRows((await apiRequest("/api/maintenance/vehicles")).vehicles || []); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Toolbar title="Vehicles" subtitle="Shared vehicle records used by Fleet Manager and Driver dashboards" action={<button onClick={load} disabled={loading}><RefreshCw size={16} /> Refresh</button>} />
      {error && <div className="mm-alert error">{error}</div>}
      {loading ? <div className="mm-loading"><div className="spinner" /> Loading vehicles...</div> : <Panel title={`${rows.length} Vehicles`}>
        <Table
          headers={["Vehicle", "Registration", "Type", "Status", "Odometer", "Open Issues", "Work Orders", "Last Service", "Actions"]}
          rows={rows.map(vehicle => [
            vehicle.vehicleNumber || "—",
            vehicle.registrationNumber || "—",
            vehicle.vehicleType || "—",
            <Badge key="status" value={vehicle.status} />,
            `${Number(vehicle.currentOdometer || 0).toLocaleString()} km`,
            vehicle.openIssues,
            vehicle.activeWorkOrders,
            date(vehicle.lastServiceDate),
            vehicle.status === "MAINTENANCE" ? <button className="primary" onClick={() => setCreateFor(vehicle)}>Create Work Order</button> : "—",
          ])}
          empty="No vehicles found."
        />
      </Panel>}
      {createFor && <CreateVehicleWorkOrderModal vehicle={createFor} close={() => setCreateFor(null)} done={() => { setCreateFor(null); load(); }} />}
    </>
  );
}

function CreateVehicleWorkOrderModal({ vehicle, close, done }) {
  const [form, setForm] = useState({ maintenanceType: "General Maintenance", priority: "MEDIUM", description: "", assignedMechanic: "", expectedCompletionDate: "", odometerAtStart: vehicle.currentOdometer ?? "", notes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (name, value) => setForm(prev => ({ ...prev, [name]: value }));
  const submit = async event => {
    event.preventDefault(); setSaving(true); setError("");
    try { await apiRequest("/api/maintenance/work-orders", { method: "POST", body: JSON.stringify({ vehicle: vehicle._id, ...form }) }); await done(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return <Modal title="Create Maintenance Work Order" subtitle={`${vehicle.vehicleNumber || "Vehicle"} • ${vehicle.registrationNumber || ""}`} close={close} wide>
    {error && <div className="mm-alert error">{error}</div>}
    <form onSubmit={submit}><div className="mm-form-grid">
      <label>Maintenance Type<input required value={form.maintenanceType} onChange={e => update("maintenanceType", e.target.value)} /></label>
      <label>Priority<select value={form.priority} onChange={e => update("priority", e.target.value)}>{["LOW","MEDIUM","HIGH","CRITICAL"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Assigned Mechanic<input value={form.assignedMechanic} onChange={e => update("assignedMechanic", e.target.value)} placeholder="e.g. Ravi Kumar" /></label>
      <label>Expected Completion<input type="datetime-local" value={form.expectedCompletionDate} onChange={e => update("expectedCompletionDate", e.target.value)} /></label>
      <label>Starting Odometer<input required type="number" min="0" value={form.odometerAtStart} onChange={e => update("odometerAtStart", e.target.value)} /></label>
      <label className="full">Maintenance Description<textarea required minLength="5" value={form.description} onChange={e => update("description", e.target.value)} /></label>
      <label className="full">Notes<textarea value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Additional maintenance instructions" /></label>
    </div><div className="mm-modal-footer"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating..." : "Create Work Order"}</button></div></form>
  </Modal>;
}

function Schedules() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setRows((await apiRequest("/api/maintenance/schedules")).schedules || []); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Toolbar title="Service Schedule" subtitle="Due status is calculated from service dates and vehicle odometer" action={<button className="primary" onClick={() => setShow(true)}>Add Schedule</button>} />
      {error && <div className="mm-alert error">{error}</div>}
      {loading ? <div className="mm-loading"><div className="spinner" /> Loading schedules...</div> : <Panel title="Service Schedule"><Table headers={["Vehicle", "Service", "Next Date", "Next Odometer", "Status"]} rows={rows.map(schedule => [schedule.vehicle?.vehicleNumber || "—", schedule.serviceType, date(schedule.nextServiceDate), schedule.nextServiceOdometer ?? "—", <Badge key="status" value={schedule.calculatedStatus} />])} empty="No service schedules found." /></Panel>}
      {show && <ScheduleModal close={() => setShow(false)} done={() => { setShow(false); load(); }} />}
    </>
  );
}

function ScheduleModal({ close, done }) {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({ vehicle: "", serviceType: "General Service", nextServiceDate: "", nextServiceOdometer: "", description: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest("/api/maintenance/vehicles").then(result => setVehicles(result.vehicles || [])).catch(err => setError(err.message));
  }, []);

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiRequest("/api/maintenance/schedules", { method: "POST", body: JSON.stringify(form) });
      await done();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Service Schedule" close={close}>
      {error && <div className="mm-alert error">{error}</div>}
      <form onSubmit={submit}>
        <div className="mm-form-grid">
          <label className="full">Vehicle<select required value={form.vehicle} onChange={e => setForm({ ...form, vehicle: e.target.value })}><option value="">Select vehicle</option>{vehicles.map(vehicle => <option key={vehicle._id} value={vehicle._id}>{vehicle.vehicleNumber} — {vehicle.registrationNumber}</option>)}</select></label>
          <label>Service Type<input required value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} /></label>
          <label>Next Service Date<input type="date" value={form.nextServiceDate} onChange={e => setForm({ ...form, nextServiceDate: e.target.value })} /></label>
          <label>Next Service Odometer<input type="number" min="0" value={form.nextServiceOdometer} onChange={e => setForm({ ...form, nextServiceOdometer: e.target.value })} /></label>
          <label className="full">Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        </div>
        <div className="mm-modal-footer"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating..." : "Create Schedule"}</button></div>
      </form>
    </Modal>
  );
}

function History() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { apiRequest("/api/maintenance/history").then(result => setRows(result.records || [])).catch(err => setError(err.message)); }, []);
  return <><Toolbar title="Maintenance History" subtitle="Completed maintenance records stored in MongoDB" />{error && <div className="mm-alert error">{error}</div>}<Panel title={`${rows.length} Record${rows.length === 1 ? "" : "s"}`}><Table headers={["Vehicle", "Work Order", "Service", "Mechanic", "Completed", "Odometer", "Cost"]} rows={rows.map(record => [record.vehicle?.vehicleNumber || "—", record.workOrder?.workOrderNumber || "—", record.serviceType, record.mechanic || "—", date(record.completionDate), record.odometer == null ? "—" : `${Number(record.odometer).toLocaleString()} km`, money(record.totalCost)])} empty="No completed maintenance records." /></Panel></>;
}

function Costs() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { apiRequest("/api/maintenance/costs").then(setData).catch(err => setError(err.message)); }, []);
  const totals = data?.totals || {};
  return <><Toolbar title="Maintenance Costs" subtitle="Calculated from completed maintenance records" />{error && <div className="mm-alert error">{error}</div>}<div className="mm-stats mm-cost-stats">{[["Total", totals.total], ["This Month", totals.currentMonth], ["This Year", totals.currentYear], ["Labor", totals.labor], ["Parts", totals.parts], ["Other", totals.other]].map(([name, value]) => <div className="mm-stat" key={name}><div className="mm-stat-icon"><DollarSign size={19} /></div><div><span>{name}</span><strong>{money(value)}</strong></div></div>)}</div><Panel title="Vehicle-wise Maintenance Cost"><Table headers={["Vehicle", "Total Cost", "Records"]} rows={(data?.byVehicle || []).map(item => [item.vehicle?.vehicleNumber || item.vehicle?.registrationNumber || "—", money(item.total), item.count])} empty="No maintenance costs recorded." /></Panel></>;
}

function Profile() {
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiRequest("/api/maintenance/profile")
      .then(result => { setUser(result.user); setForm({ fullName: result.user.fullName || "", phone: result.user.phone || "" }); })
      .catch(err => setMessage(err.message));
  }, []);

  const save = async event => {
    event.preventDefault();
    try {
      const result = await apiRequest("/api/maintenance/profile", { method: "PUT", body: JSON.stringify(form) });
      setUser(result.user);
      setForm({ fullName: result.user.fullName || "", phone: result.user.phone || "" });
      setEditing(false);
      setMessage("Profile updated successfully.");
      const stored = getStoredUser();
      if (stored) sessionStorage.setItem("fleetUser", JSON.stringify({ ...stored, ...result.user }));
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (!user) return <div className="mm-loading">Loading profile...</div>;

  return (
    <>
      <Toolbar title="My Profile" subtitle="Maintenance Manager account details" />
      <Panel title="Profile">
        {message && <div className={`mm-alert ${message.toLowerCase().includes("success") ? "success" : "error"}`}>{message}</div>}
        {editing ? (
          <form onSubmit={save}>
            <div className="mm-form-grid">
              <label>Full Name<input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></label>
              <label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
            </div>
            <div className="mm-modal-footer"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button className="primary">Save Changes</button></div>
          </form>
        ) : (
          <>
            <div className="mm-detail-grid">
              <Detail label="Full Name" value={user.fullName} />
              <Detail label="Email" value={user.email} />
              <Detail label="Phone" value={user.phone || "Not provided"} />
              <Detail label="Role" value={label(user.role)} />
              <Detail label="Account Status" value={label(user.accountStatus || (user.isActive ? "ACTIVE" : "INACTIVE"))} />
              <Detail label="Created" value={date(user.createdAt)} />
              <Detail label="Last Login" value={dateTime(user.lastLoginAt)} />
            </div>
            <button className="primary" onClick={() => { setMessage(""); setEditing(true); }}>Edit Profile</button>
          </>
        )}
      </Panel>
    </>
  );
}

function Toolbar({ title, subtitle, action }) {
  return <div className="mm-toolbar"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}

function Panel({ title, children }) {
  return <section className="mm-card"><div className="mm-card-head"><h2>{title}</h2></div>{children}</section>;
}

function Table({ headers, rows, empty }) {
  return <div className="mm-table-wrap"><table className="mm-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="mm-empty">{empty}</td></tr>}</tbody></table></div>;
}

function Badge({ value }) {
  return <span className={`mm-badge ${String(value || "").toLowerCase().replaceAll("_", "-")}`}>{label(value)}</span>;
}

function Detail({ label: detailLabel, value }) {
  return <div className="mm-detail"><span>{detailLabel}</span><strong>{value}</strong></div>;
}

function Modal({ title, subtitle, close, children, wide = false }) {
  return <div className="mm-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div className={`mm-modal ${wide ? "wide" : ""}`}><div className="mm-modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" onClick={close} aria-label="Close"><X size={20} /></button></div>{children}</div></div>;
}
