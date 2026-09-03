import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  Car,
  CheckCircle,
  CircleDollarSign,
  Clock,
  FileText,
  Fuel,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import "../Dashboard.css";
import { authFetch } from "../services/api";

const API_URL = "http://localhost:5000";

const roleLabels = {
  SUPER_ADMIN: "Super Admin",
  FLEET_MANAGER: "Fleet Manager",
  DISPATCHER: "Dispatcher",
  DRIVER: "Driver",
  MAINTENANCE_MANAGER: "Maintenance Manager",
  FINANCE_MANAGER: "Finance Manager",
  VIEWER: "Management / Viewer",
  CUSTOMER: "Customer",
};

const STATIC_DASHBOARD = {
  totalUsers: 9,
  activeUsers: 9,
  customers: 1,
  fuelCost: "₹1,84,500",
  maintenanceCost: "₹96,800",
  activities: [
    { title: "Trip TRP-1001 started", time: "20 minutes ago" },
    { title: "Vehicle AP16 AB 9012 marked for maintenance", time: "32 minutes ago" },
    { title: "New customer trip request received", time: "1 hour ago" },
    { title: "Fuel expenses submitted", time: "2 hours ago" },
    { title: "Trip TRP-0998 completed", time: "3 hours ago" },
  ],
};

function formatStatus(status) {
  return status ? status.replaceAll("_", " ") : "—";
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminView, setAdminView] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewLoading, setViewLoading] = useState(false);
  const [error, setError] = useState("");

  const [users, setUsers] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState({});
  const [updatingUser, setUpdatingUser] = useState(null);
  const [statusUpdatingUser, setStatusUpdatingUser] = useState(null);

  const request = useCallback(async (path, options = {}) => {
    const response = await authFetch(path, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [dashboardData, userData] = await Promise.all([
        request("/api/admin/dashboard-overview"),
        request("/api/admin/users"),
      ]);
      setDashboard(dashboardData);
      setUsers(userData.users || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to load Super Admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadAdminView = useCallback(async (view) => {
    if (view === "overview") return loadDashboard();
    try {
      setViewLoading(true);
      setError("");
      const endpoint = view === "vehicles" ? "/api/admin/vehicles?active=true" : "/api/admin/drivers?active=true";
      const data = await request(endpoint);
      if (view === "vehicles") setVehicles(data.vehicles || []);
      else setDrivers(data.drivers || []);
    } catch (err) {
      console.error(err);
      setError(err.message || `Unable to load ${view}.`);
    } finally {
      setViewLoading(false);
    }
  }, [loadDashboard, request]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (adminView !== "overview") loadAdminView(adminView);
  }, [adminView, loadAdminView]);

  const openAdminView = (view) => {
    setAdminView(view);
    setSidebarOpen(false);
  };

  const refresh = () => loadDashboard();

  const assignRole = async (userId) => {
    const role = selectedRoles[userId];
    if (!role) return;
    try {
      setUpdatingUser(userId);
      const data = await request(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      setUsers((prev) => prev.map((user) => user._id === userId ? data.user : user));
      setSelectedRoles((prev) => ({ ...prev, [userId]: "" }));
    } catch (err) {
      alert(err.message || "Unable to assign role.");
    } finally {
      setUpdatingUser(null);
    }
  };

  const toggleStatus = async (userId, currentStatus) => {
    try {
      setStatusUpdatingUser(userId);
      const data = await request(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      setUsers((prev) => prev.map((user) => user._id === userId ? data.user : user));
    } catch (err) {
      alert(err.message || "Unable to update account status.");
    } finally {
      setStatusUpdatingUser(null);
    }
  };

  const logout = async () => {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error(err);
    }
    sessionStorage.removeItem("fleetUser"); sessionStorage.removeItem("fleetToken");
    navigate("/login", { replace: true });
  };

  const stats = useMemo(() => ({
    totalUsers: STATIC_DASHBOARD.totalUsers,
    activeUsers: STATIC_DASHBOARD.activeUsers,
    totalVehicles: dashboard?.stats?.totalVehicles || 0,
    totalDrivers: dashboard?.stats?.totalDrivers || 0,
    activeTrips: dashboard?.stats?.activeTrips || 0,
    customers: STATIC_DASHBOARD.customers,
  }), [dashboard]);

  const navItemClass = (view) => `nav-item ${adminView === view ? "active" : ""}`;

  return (
    <div className="dashboard-page super-admin-dashboard">
      <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="dashboard-logo">
          <div className="dashboard-logo-icon"><Car size={22} /></div>
          <span>Fleet<span>Flow</span></span>
        </div>

        <nav className="dashboard-nav">
          <button className={navItemClass("overview")} onClick={() => openAdminView("overview")}><LayoutDashboard size={18} /> Overview</button>
          <button className={navItemClass("vehicles")} onClick={() => openAdminView("vehicles")}><Car size={18} /> Vehicles</button>
          <button className={navItemClass("drivers")} onClick={() => openAdminView("drivers")}><Users size={18} /> Drivers</button>
          <button className="nav-item"><Activity size={18} /> Trips</button>
          <button className="nav-item"><MapPin size={18} /> Live Tracking</button>
          <button className="nav-item"><Fuel size={18} /> Fuel</button>
          <button className="nav-item"><Wrench size={18} /> Maintenance</button>
          <button className="nav-item"><CircleDollarSign size={18} /> Expenses</button>
          <button className="nav-item"><FileText size={18} /> Reports</button>
          <Link to="/super-admin/users" className="nav-item" onClick={() => setSidebarOpen(false)}><Users size={18} /> User Management</Link>
          <button className="nav-item"><Settings size={18} /> Settings</button>
        </nav>

        <button className="logout-button" onClick={logout}><LogOut size={18} /> Sign Out</button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <button className="mobile-menu-button" onClick={() => setSidebarOpen((value) => !value)}>
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div>
            <p className="dashboard-eyebrow">SUPER ADMIN</p>
            <h1>{adminView === "overview" ? "Dashboard Overview" : adminView === "vehicles" ? "Vehicle Overview" : "Driver Overview"}</h1>
            <p className="dashboard-subtitle">
              {adminView === "overview" ? "Complete fleet and platform overview" : adminView === "vehicles" ? "Active vehicles from MongoDB" : "Active drivers from MongoDB"}
            </p>
          </div>
          <div className="admin-header-actions">
            <button className="dashboard-refresh-button" onClick={refresh} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""} /> Refresh</button>
            <div className="admin-badge"><ShieldCheck size={17} /> Super Admin</div>
          </div>
        </header>

        {error && <div className="dashboard-alert error">{error}</div>}

        {adminView === "overview" ? (
          <OverviewView dashboard={dashboard} stats={stats} loading={loading} />
        ) : adminView === "vehicles" ? (
          <AdminVehiclesView vehicles={vehicles} loading={viewLoading} />
        ) : (
          <AdminDriversView drivers={drivers} loading={viewLoading} />
        )}
      </main>
    </div>
  );
}

function OverviewView({ dashboard, stats, loading }) {
  const vehicleStatus = dashboard?.vehicleStatus || {};
  const tripStatus = dashboard?.tripStatus || {};
  const vehicles = dashboard?.vehicles || [];
  const liveFleet = dashboard?.liveFleet || [];
  const recentTrips = dashboard?.recentTrips || [];

  return (
    <div className="sa-overview">
      <section className="stats-grid sa-stats-grid">
        <StatCard icon={<Users />} title="Total Users" value={stats.totalUsers} />
        <StatCard icon={<CheckCircle />} title="Active Users" value={stats.activeUsers} />
        <StatCard icon={<Car />} title="Total Vehicles" value={loading ? "…" : stats.totalVehicles} dynamic />
        <StatCard icon={<Users />} title="Total Drivers" value={loading ? "…" : stats.totalDrivers} dynamic />
        <StatCard icon={<Activity />} title="Active Trips" value={loading ? "…" : stats.activeTrips} dynamic />
        <StatCard icon={<Users />} title="Customers" value={stats.customers} />
      </section>

      <section className="dashboard-two-column">
        <DashboardCard title="Fleet Status Overview">
          <div className="status-list">
            <StatusRow label="Available" value={vehicleStatus.AVAILABLE || 0} />
            <StatusRow label="On Trip" value={vehicleStatus.ON_TRIP || 0} />
            <StatusRow label="Idle" value={vehicleStatus.ASSIGNED || 0} />
            <StatusRow label="Maintenance" value={vehicleStatus.MAINTENANCE || 0} />
          </div>
        </DashboardCard>
        <DashboardCard title="Trip Overview">
          <div className="status-list">
            <StatusRow label="Scheduled" value={tripStatus.SCHEDULED || 0} />
            <StatusRow label="In Progress" value={tripStatus.IN_PROGRESS || 0} />
            <StatusRow label="Completed" value={tripStatus.COMPLETED || 0} />
            <StatusRow label="Cancelled" value={tripStatus.CANCELLED || 0} />
          </div>
        </DashboardCard>
      </section>

      <DashboardCard title="Fleet Vehicles">
        <div className="table-wrapper">
          <table className="dashboard-table sa-wide-table">
            <thead><tr><th>Vehicle</th><th>Type</th><th>Driver</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="4" className="table-empty">Loading vehicles...</td></tr> : vehicles.length === 0 ? <tr><td colSpan="4" className="table-empty">No vehicles found.</td></tr> : vehicles.map((vehicle) => (
                <tr key={vehicle._id}>
                  <td><strong>{vehicle.registrationNumber || vehicle.vehicleNumber || "—"}</strong></td>
                  <td>{vehicle.vehicleType || "—"}</td>
                  <td>{vehicle.assignedDriver?.fullName || "Not Assigned"}</td>
                  <td><StatusBadge status={vehicle.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <DashboardCard title="Live Fleet Status">
        <div className="sa-live-grid">
          {loading ? <div className="table-empty">Loading live fleet data...</div> : liveFleet.length === 0 ? <div className="table-empty">No active vehicle assignments.</div> : liveFleet.slice(0, 3).map((vehicle) => (
            <div className="sa-live-card" key={vehicle._id}>
              <div className="sa-live-head">
                <strong>{vehicle.registrationNumber}</strong>
                <StatusBadge status={vehicle.status} />
              </div>
              <div className="sa-live-driver">{vehicle.driver?.fullName || "Not Assigned"}</div>
              <div className="sa-live-meta"><span><MapPin size={13} /> {vehicle.vehicleType || "Vehicle"}</span><span><Activity size={13} /> {formatStatus(vehicle.status)}</span></div>
            </div>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard title="Recent Trips" action={<button className="sa-small-action" onClick={() => window.location.assign("/fleet-manager/trips")}>View all</button>}>
        <div className="table-wrapper">
          <table className="dashboard-table sa-wide-table">
            <thead><tr><th>Trip ID</th><th>Customer</th><th>Route</th><th>Driver</th><th>Vehicle</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="6" className="table-empty">Loading trips...</td></tr> : recentTrips.length === 0 ? <tr><td colSpan="6" className="table-empty">No trips found.</td></tr> : recentTrips.slice(0, 5).map((trip) => (
                <tr key={trip._id}>
                  <td><strong>{trip.tripId}</strong></td>
                  <td>{trip.customer?.fullName || "—"}</td>
                  <td>{trip.pickupLocation} → {trip.destination}</td>
                  <td>{trip.driver?.fullName || "—"}</td>
                  <td>{trip.vehicle?.registrationNumber || "—"}</td>
                  <td><StatusBadge status={trip.tripStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <section className="dashboard-two-column">
        <DashboardCard title="Fuel Overview"><div className="static-finance"><strong>{STATIC_DASHBOARD.fuelCost}</strong><span>Total fuel cost this month</span></div></DashboardCard>
        <DashboardCard title="Maintenance Overview"><div className="static-finance"><strong>{STATIC_DASHBOARD.maintenanceCost}</strong><span>Total maintenance cost this month</span></div></DashboardCard>
      </section>

      <DashboardCard title="Recent Activities">
        <div className="sa-activity-list">
          {STATIC_DASHBOARD.activities.map((activity, index) => (
            <div className="sa-activity" key={`${activity.title}-${index}`}><span className="sa-activity-dot" /><div><strong>{activity.title}</strong><small>{activity.time}</small></div></div>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
}

function AdminVehiclesView({ vehicles, loading }) {
  return <DashboardCard title={`Active Vehicles (${vehicles.length})`} icon={<Car size={18} />}>
    <div className="table-wrapper"><table className="dashboard-table"><thead><tr><th>Registration</th><th>Vehicle</th><th>Type</th><th>Driver</th><th>Status</th><th>Odometer</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="6" className="table-empty">Loading active vehicles...</td></tr> : vehicles.length === 0 ? <tr><td colSpan="6" className="table-empty">No active vehicles found.</td></tr> : vehicles.map((vehicle) => <tr key={vehicle._id}><td><strong>{vehicle.registrationNumber}</strong></td><td>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.vehicleNumber || "—"}</td><td>{vehicle.vehicleType}</td><td>{vehicle.assignedDriver?.fullName || "Not Assigned"}</td><td><StatusBadge status={vehicle.status} /></td><td>{Number(vehicle.currentOdometer || 0).toLocaleString()} km</td></tr>)}
    </tbody></table></div>
  </DashboardCard>;
}

function AdminDriversView({ drivers, loading }) {
  return <DashboardCard title={`Active Drivers (${drivers.length})`} icon={<Users size={18} />}>
    <div className="table-wrapper"><table className="dashboard-table"><thead><tr><th>Driver</th><th>Email</th><th>Phone</th><th>License</th><th>Vehicle</th><th>Status</th><th>License Expiry</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="7" className="table-empty">Loading active drivers...</td></tr> : drivers.length === 0 ? <tr><td colSpan="7" className="table-empty">No active drivers found.</td></tr> : drivers.map((driver) => <tr key={driver._id}><td><strong>{driver.fullName}</strong></td><td>{driver.email}</td><td>{driver.phone || "—"}</td><td>{driver.profile?.licenseNumber || "—"}</td><td>{driver.profile?.assignedVehicle?.registrationNumber || "Not Assigned"}</td><td><StatusBadge status={driver.profile?.status || (driver.isActive ? "AVAILABLE" : "INACTIVE")} /></td><td>{driver.profile?.licenseExpiry ? new Date(driver.profile.licenseExpiry).toLocaleDateString() : "—"}</td></tr>)}
    </tbody></table></div>
  </DashboardCard>;
}

function StatCard({ icon, title, value, dynamic }) {
  return <div className={`sa-stat-card ${dynamic ? "dynamic" : ""}`}><div className="sa-stat-icon">{icon}</div><div><span>{title}</span><strong>{value}</strong></div></div>;
}

function DashboardCard({ title, children, icon, action }) {
  return <section className="dashboard-card"><div className="dashboard-card-header"><h2>{icon}{title}</h2>{action}</div>{children}</section>;
}

function StatusRow({ label, value }) {
  return <div className="status-row"><span>{label}</span><strong>{value}</strong></div>;
}

function StatusBadge({ status }) {
  const normalized = String(status || "UNKNOWN").toLowerCase().replaceAll("_", "-");
  return <span className={`sa-status-badge ${normalized}`}>{formatStatus(status)}</span>;
}

export default SuperAdminDashboard;
