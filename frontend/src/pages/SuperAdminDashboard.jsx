import NotificationBell from "../components/NotificationBell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  Car,
  CheckCircle,
  CircleDollarSign,
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
import SuperAdminDataView from "./SuperAdminDataView";
import LiveFleetMap from "../components/LiveFleetMap";
import { downloadTablePdf, parseCsv } from "../utils/pdfExport";

function formatStatus(status) {
  return status ? String(status).replaceAll("_", " ") : "—";
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function SuperAdminDashboard() {
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminView, setAdminView] = useState("overview");

  const [dashboard, setDashboard] = useState(null);
  const [overviewExtras, setOverviewExtras] = useState(null);

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [adminData, setAdminData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [viewLoading, setViewLoading] = useState(false);
  const [error, setError] = useState("");

  const [users, setUsers] = useState([]);

  const [viewPage, setViewPage] = useState(1);
  const [viewPagination, setViewPagination] = useState(null);

  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

  const [viewSearch, setViewSearch] = useState("");
  const [viewStatus, setViewStatus] = useState("");

  /*
   * Common authenticated API request helper.
   * authFetch already handles API_URL internally,
   * therefore all paths passed here must be relative.
   */
  const request = useCallback(async (path, options = {}) => {
    const response = await authFetch(path, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body
          ? {
              "Content-Type": "application/json",
            }
          : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }

    return data;
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [dashboardData, userData, extrasData] = await Promise.all([
        request("/api/admin/dashboard-overview"),
        request("/api/admin/users"),
        request("/api/admin/overview-extras"),
      ]);

      setDashboard(dashboardData);
      setUsers(userData.users || []);
      setOverviewExtras(extrasData);
    } catch (err) {
      console.error("Super Admin dashboard error:", err);

      setError(
        err.message || "Unable to load Super Admin dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadAdminView = useCallback(
    async (view, pageOverride = viewPage) => {
      if (view === "overview") {
        return loadDashboard();
      }

      try {
        setViewLoading(true);
        setError("");

        const query = new URLSearchParams();

        query.set("page", pageOverride);
        query.set("limit", view === "tracking" ? 50 : 25);

        if (viewSearch.trim()) {
          query.set("search", viewSearch.trim());
        }

        if (viewStatus) {
          query.set("status", viewStatus);
        }

        const reportQuery = new URLSearchParams();

        if (reportFrom) {
          reportQuery.set("from", reportFrom);
        }

        if (reportTo) {
          reportQuery.set("to", reportTo);
        }

        const endpoints = {
          vehicles: `/api/admin/vehicles?active=true&${query.toString()}`,

          drivers: `/api/admin/drivers?active=true&${query.toString()}`,

          trips: `/api/admin/trips?${query.toString()}`,

          tracking: `/api/admin/tracking?${query.toString()}`,

          fuel: `/api/admin/fuel?${query.toString()}`,

          maintenance: `/api/admin/maintenance?${query.toString()}`,

          expenses: `/api/admin/expenses?${query.toString()}`,

          reports: `/api/admin/reports${
            reportQuery.toString()
              ? `?${reportQuery.toString()}`
              : ""
          }`,

          settings: "/api/admin/settings",
        };

        const data = await request(endpoints[view]);

        if (view === "vehicles") {
          setVehicles(data.vehicles || []);
        } else if (view === "drivers") {
          setDrivers(data.drivers || []);
        } else {
          setAdminData(data);
        }

        setViewPagination(data.pagination || null);
      } catch (err) {
        console.error(`Unable to load ${view}:`, err);

        setError(
          err.message || `Unable to load ${view}.`
        );
      } finally {
        setViewLoading(false);
      }
    },
    [
      loadDashboard,
      request,
      viewPage,
      reportFrom,
      reportTo,
      viewSearch,
      viewStatus,
    ]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (adminView !== "overview") {
      loadAdminView(adminView);
    }
  }, [adminView, loadAdminView]);

  useEffect(() => {
    const refreshTracking = () => {
      if (adminView === "tracking") {
        loadAdminView("tracking", viewPage);
      }
    };

    window.addEventListener(
      "fleetflow-tracking-refresh",
      refreshTracking
    );

    return () => {
      window.removeEventListener(
        "fleetflow-tracking-refresh",
        refreshTracking
      );
    };
  }, [adminView, viewPage, loadAdminView]);

  const openAdminView = (view) => {
    setViewPage(1);
    setViewSearch("");
    setViewStatus("");
    setViewPagination(null);
    setAdminView(view);
    setSidebarOpen(false);
  };

  const refresh = () => {
    loadAdminView(adminView, viewPage);
  };

  const changePage = (page) => {
    if (
      page < 1 ||
      (viewPagination?.totalPages &&
        page > viewPagination.totalPages)
    ) {
      return;
    }

    setViewPage(page);
  };

  const fetchAdminExportCsv = async (resource) => {
    const exportPath = `/api/admin/export/${resource}`;

    const response = await authFetch(exportPath, {
      credentials: "include",
      headers: {
        Accept: "text/csv,text/plain,*/*",
      },
    });

    if (!response.ok) {
      let message = "Unable to export data.";

      try {
        const data = await response.json();

        if (data?.message) {
          message = data.message;
        }
      } catch {
      }

      throw new Error(message);
    }

    return response.text();
  };

  const exportCsv = async (resource) => {
    try {
      setError("");

      const csv = await fetchAdminExportCsv(resource);

      if (!csv || !csv.trim()) {
        throw new Error("No data available to export.");
      }

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8",
      });

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = url;
      a.download = `fleetflow-${resource}.csv`;

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export error:", err);

      setError(
        err.message || "Unable to export data."
      );
    }
  };

  const exportPdf = async (resource) => {
    try {
      setError("");

      const csv = await fetchAdminExportCsv(resource);

      const parsed = parseCsv(csv);

      if (!parsed.length) {
        throw new Error(
          "No data available to export."
        );
      }

      const headers = parsed[0];
      const rows = parsed.slice(1);

      downloadTablePdf(
        `FleetFlow - ${resource
          .replaceAll("_", " ")
          .toUpperCase()} Report`,
        headers,
        rows,
        `fleetflow-${resource}`
      );
    } catch (err) {
      console.error("PDF export error:", err);

      setError(
        err.message || "Unable to export PDF."
      );
    }
  };

  const logout = async () => {
    try {
      await request("/api/auth/logout", {
        method: "POST",
      });
    } catch (err) {
      console.error("Logout error:", err);
    }

    sessionStorage.removeItem("fleetUser");
    sessionStorage.removeItem("fleetToken");

    navigate("/login", {
      replace: true,
    });
  };

  const stats = useMemo(() => {
    const totalUsers =
      dashboard?.stats?.totalUsers ?? users.length;

    const activeUsers =
      dashboard?.stats?.activeUsers ??
      users.filter((user) => user.isActive).length;

    return {
      totalUsers,

      activeUsers,

      inactiveUsers:
        totalUsers - activeUsers,

      totalVehicles:
        dashboard?.stats?.totalVehicles ?? 0,

      totalDrivers:
        dashboard?.stats?.totalDrivers ?? 0,

      activeTrips:
        dashboard?.stats?.activeTrips ?? 0,

      customers:
        dashboard?.stats?.totalCustomers ??
        users.filter(
          (user) => user.role === "CUSTOMER"
        ).length,

      maintenanceCostThisMonth:
        dashboard?.stats?.maintenanceCostThisMonth ?? 0,

      fuelCostThisMonth:
        dashboard?.stats?.fuelCostThisMonth ?? 0,
    };
  }, [dashboard, users]);

  const navItemClass = (view) =>
    `nav-item ${
      adminView === view ? "active" : ""
    }`;

  return (
    <div className="dashboard-page super-admin-dashboard">
      <aside
        className={`dashboard-sidebar ${
          sidebarOpen ? "open" : ""
        }`}
      >
        <div className="dashboard-logo">
          <div className="dashboard-logo-icon">
            <Car size={22} />
          </div>

          <span>
            Fleet<span>Flow</span>
          </span>
        </div>

        <nav className="dashboard-nav">
          <button
            className={navItemClass("overview")}
            onClick={() =>
              openAdminView("overview")
            }
          >
            <LayoutDashboard size={18} />
            Overview
          </button>

          <button
            className={navItemClass("vehicles")}
            onClick={() =>
              openAdminView("vehicles")
            }
          >
            <Car size={18} />
            Vehicles
          </button>

          <button
            className={navItemClass("drivers")}
            onClick={() =>
              openAdminView("drivers")
            }
          >
            <Users size={18} />
            Drivers
          </button>

          <button
            className={navItemClass("trips")}
            onClick={() =>
              openAdminView("trips")
            }
          >
            <Activity size={18} />
            Trips
          </button>

          <button
            className={navItemClass("tracking")}
            onClick={() =>
              openAdminView("tracking")
            }
          >
            <MapPin size={18} />
            Live Tracking
          </button>

          <button
            className={navItemClass("fuel")}
            onClick={() =>
              openAdminView("fuel")
            }
          >
            <Fuel size={18} />
            Fuel
          </button>

          <button
            className={navItemClass("maintenance")}
            onClick={() =>
              openAdminView("maintenance")
            }
          >
            <Wrench size={18} />
            Maintenance
          </button>

          <button
            className={navItemClass("expenses")}
            onClick={() =>
              openAdminView("expenses")
            }
          >
            <CircleDollarSign size={18} />
            Expenses
          </button>

          <button
            className={navItemClass("reports")}
            onClick={() =>
              openAdminView("reports")
            }
          >
            <FileText size={18} />
            Reports
          </button>

          <Link
            to="/super-admin/users"
            className="nav-item"
            onClick={() =>
              setSidebarOpen(false)
            }
          >
            <Users size={18} />
            User Management
          </Link>

          <Link
            to="/super-admin/security"
            className="nav-item"
            onClick={() =>
              setSidebarOpen(false)
            }
          >
            <ShieldCheck size={18} />
            Permissions & Access
          </Link>

          <button
            className={navItemClass("settings")}
            onClick={() =>
              openAdminView("settings")
            }
          >
            <Settings size={18} />
            Settings
          </button>
        </nav>

        <button
          className="logout-button"
          onClick={logout}
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <button
            className="mobile-menu-button"
            onClick={() =>
              setSidebarOpen(
                (value) => !value
              )
            }
          >
            {sidebarOpen ? (
              <X size={22} />
            ) : (
              <Menu size={22} />
            )}
          </button>

          <div>
            <p className="dashboard-eyebrow">
              SUPER ADMIN
            </p>

            <h1>
              {
                {
                  overview:
                    "Dashboard Overview",
                  vehicles:
                    "Vehicle Overview",
                  drivers:
                    "Driver Overview",
                  trips: "Trips",
                  tracking:
                    "Live Tracking",
                  fuel: "Fuel Expenses",
                  maintenance:
                    "Maintenance",
                  expenses:
                    "Expenses",
                  reports:
                    "Reports & Analytics",
                  settings:
                    "Settings",
                }[adminView]
              }
            </h1>

            <p className="dashboard-subtitle">
              {
                {
                  overview:
                    "Complete fleet and platform overview",
                  vehicles:
                    "Active vehicles from MongoDB",
                  drivers:
                    "Active drivers from MongoDB",
                  trips:
                    "All trip records and current statuses",
                  tracking:
                    "Latest GPS information for tracked trips",
                  fuel:
                    "Fleet fuel transactions and costs",
                  maintenance:
                    "Vehicle issues, work orders and service schedules",
                  expenses:
                    "Fleet expense and payment records",
                  reports:
                    "Read-only operational and financial reports",
                  settings:
                    "Super Admin account and FleetFlow system information",
                }[adminView]
              }
            </p>
          </div>

          <div className="admin-header-actions">
            <NotificationBell />

            <button
              className="dashboard-refresh-button"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw
                size={17}
                className={
                  loading ? "spin" : ""
                }
              />
              Refresh
            </button>

            <div className="admin-badge">
              <ShieldCheck size={17} />
              Super Admin
            </div>
          </div>
        </header>

        {adminView !== "overview" &&
          adminView !== "reports" &&
          adminView !== "settings" && (
            <div
              className="sa-data-panel"
              style={{ marginBottom: 16 }}
            >
              <div className="sa-settings-grid">
                <div>
                  <small>Search</small>

                  <input
                    className="sa-report-date"
                    value={viewSearch}
                    onChange={(e) =>
                      setViewSearch(
                        e.target.value
                      )
                    }
                    placeholder="Search current module..."
                  />
                </div>

                <div>
                  <small>Status</small>

                  <select
                    className="sa-report-date"
                    value={viewStatus}
                    onChange={(e) =>
                      setViewStatus(
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      All statuses
                    </option>

                    {[
                      "AVAILABLE",
                      "ASSIGNED",
                      "ON_TRIP",
                      "MAINTENANCE",
                      "INACTIVE",
                      "SCHEDULED",
                      "IN_PROGRESS",
                      "PAUSED",
                      "COMPLETED",
                      "CANCELLED",
                      "PENDING",
                      "ISSUED",
                      "PAID",
                    ].map((value) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {value.replaceAll(
                          "_",
                          " "
                        )}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

        {error && (
          <div className="dashboard-alert error">
            {error}
          </div>
        )}

        {viewLoading ? (
          <div
            className="dashboard-card"
            style={{ padding: 28 }}
          >
            Loading {adminView} data…
          </div>
        ) : adminView === "overview" ? (
          <OverviewView
            dashboard={dashboard}
            overviewExtras={overviewExtras}
            stats={stats}
            loading={loading}
          />
        ) : adminView === "vehicles" ? (
          <AdminVehiclesView
            vehicles={vehicles}
            loading={viewLoading}
            pagination={viewPagination}
            onPageChange={changePage}
            onExport={() =>
              exportCsv("vehicles")
            }
            onExportPdf={() =>
              exportPdf("vehicles")
            }
          />
        ) : adminView === "drivers" ? (
          <AdminDriversView
            drivers={drivers}
            loading={viewLoading}
            pagination={viewPagination}
            onPageChange={changePage}
            onExport={() =>
              exportCsv("drivers")
            }
            onExportPdf={() =>
              exportPdf("drivers")
            }
          />
        ) : (
          <SuperAdminDataView
            view={adminView}
            data={adminData}
            pagination={viewPagination}
            onPageChange={changePage}
            onExport={exportCsv}
            onExportPdf={exportPdf}
            reportFrom={reportFrom}
            reportTo={reportTo}
            setReportFrom={setReportFrom}
            setReportTo={setReportTo}
          />
        )}
      </main>
    </div>
  );
}

function OverviewView({
  dashboard,
  overviewExtras,
  stats,
  loading,
}) {
  const vehicleStatus =
    dashboard?.vehicleStatus || {};

  const tripStatus =
    dashboard?.tripStatus || {};

  const vehicles =
    dashboard?.vehicles || [];

  const liveFleet =
    dashboard?.liveFleet || [];

  const recentTrips =
    dashboard?.recentTrips || [];

  return (
    <div className="sa-overview">
      <section className="stats-grid sa-stats-grid">
        <StatCard
          icon={<Users />}
          title="Total Users"
          value={stats.totalUsers}
        />

        <StatCard
          icon={<CheckCircle />}
          title="Active Users"
          value={stats.activeUsers}
        />

        <StatCard
          icon={<Users />}
          title="Inactive Users"
          value={stats.inactiveUsers}
        />

        <StatCard
          icon={<Car />}
          title="Total Vehicles"
          value={
            loading
              ? "…"
              : stats.totalVehicles
          }
          dynamic
        />

        <StatCard
          icon={<Users />}
          title="Total Drivers"
          value={
            loading
              ? "…"
              : stats.totalDrivers
          }
          dynamic
        />

        <StatCard
          icon={<Activity />}
          title="Active Trips"
          value={
            loading
              ? "…"
              : stats.activeTrips
          }
          dynamic
        />

        <StatCard
          icon={<Users />}
          title="Customers"
          value={stats.customers}
        />
      </section>

      <section className="dashboard-two-column">
        <DashboardCard title="Fleet Status Overview">
          <div className="status-list">
            <StatusRow
              label="Available"
              value={
                vehicleStatus.AVAILABLE || 0
              }
            />

            <StatusRow
              label="On Trip"
              value={
                vehicleStatus.ON_TRIP || 0
              }
            />

            <StatusRow
              label="Assigned"
              value={
                vehicleStatus.ASSIGNED || 0
              }
            />

            <StatusRow
              label="Maintenance"
              value={
                vehicleStatus.MAINTENANCE || 0
              }
            />

            <StatusRow
              label="Inactive"
              value={
                vehicleStatus.INACTIVE || 0
              }
            />
          </div>
        </DashboardCard>

        <DashboardCard title="Trip Overview">
          <div className="status-list">
            <StatusRow
              label="Scheduled"
              value={
                tripStatus.SCHEDULED || 0
              }
            />

            <StatusRow
              label="Assigned"
              value={
                tripStatus.ASSIGNED || 0
              }
            />

            <StatusRow
              label="In Progress"
              value={
                tripStatus.IN_PROGRESS || 0
              }
            />

            <StatusRow
              label="Paused"
              value={
                tripStatus.PAUSED || 0
              }
            />

            <StatusRow
              label="Completed"
              value={
                tripStatus.COMPLETED || 0
              }
            />

            <StatusRow
              label="Cancelled"
              value={
                tripStatus.CANCELLED || 0
              }
            />
          </div>
        </DashboardCard>
      </section>

      <DashboardCard title="Fleet Vehicles">
        <div className="table-wrapper">
          <table className="dashboard-table sa-wide-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Type</th>
                <th>Driver</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="4"
                    className="table-empty"
                  >
                    Loading vehicles...
                  </td>
                </tr>
              ) : vehicles.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="table-empty"
                  >
                    No vehicles found.
                  </td>
                </tr>
              ) : (
                vehicles.map((vehicle) => (
                  <tr key={vehicle._id}>
                    <td>
                      <strong>
                        {vehicle.registrationNumber ||
                          vehicle.vehicleNumber ||
                          "—"}
                      </strong>
                    </td>

                    <td>
                      {vehicle.vehicleType ||
                        "—"}
                    </td>

                    <td>
                      {vehicle.assignedDriver
                        ?.fullName ||
                        "Not Assigned"}
                    </td>

                    <td>
                      <StatusBadge
                        status={
                          vehicle.status
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <DashboardCard title="Live Fleet Status">
        <div className="sa-live-grid">
          {loading ? (
            <div className="table-empty">
              Loading live fleet data...
            </div>
          ) : liveFleet.length === 0 ? (
            <div className="table-empty">
              No active vehicle assignments.
            </div>
          ) : (
            liveFleet
              .slice(0, 3)
              .map((vehicle) => (
                <div
                  className="sa-live-card"
                  key={vehicle._id}
                >
                  <div className="sa-live-head">
                    <strong>
                      {
                        vehicle.registrationNumber
                      }
                    </strong>

                    <StatusBadge
                      status={
                        vehicle.status
                      }
                    />
                  </div>

                  <div className="sa-live-driver">
                    {vehicle.driver
                      ?.fullName ||
                      "Not Assigned"}
                  </div>

                  <div className="sa-live-meta">
                    <span>
                      <MapPin size={13} />

                      {vehicle.vehicleType ||
                        "Vehicle"}
                    </span>

                    <span>
                      <Activity size={13} />

                      {formatStatus(
                        vehicle.status
                      )}
                    </span>
                  </div>
                </div>
              ))
          )}
        </div>
      </DashboardCard>

      <DashboardCard
        title="Recent Trips"
        action={
          <button
            className="sa-small-action"
            onClick={() =>
              window.location.assign(
                "/fleet-manager/trips"
              )
            }
          >
            View all
          </button>
        }
      >
        <div className="table-wrapper">
          <table className="dashboard-table sa-wide-table">
            <thead>
              <tr>
                <th>Trip ID</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="table-empty"
                  >
                    Loading trips...
                  </td>
                </tr>
              ) : recentTrips.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="table-empty"
                  >
                    No trips found.
                  </td>
                </tr>
              ) : (
                recentTrips
                  .slice(0, 5)
                  .map((trip) => (
                    <tr key={trip._id}>
                      <td>
                        <strong>
                          {trip.tripId}
                        </strong>
                      </td>

                      <td>
                        {trip.customer
                          ?.fullName || "—"}
                      </td>

                      <td>
                        {trip.pickupLocation ||
                          "—"}{" "}
                        →{" "}
                        {trip.destination ||
                          "—"}
                      </td>

                      <td>
                        {trip.driver
                          ?.fullName || "—"}
                      </td>

                      <td>
                        {trip.vehicle
                          ?.registrationNumber ||
                          "—"}
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            trip.tripStatus
                          }
                        />
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <section className="dashboard-two-column">
        <DashboardCard title="Fuel Overview">
          <div className="static-finance">
            <strong>
              ₹
              {Number(
                stats.fuelCostThisMonth || 0
              ).toLocaleString("en-IN")}
            </strong>

            <span>
              Total fuel cost this month
            </span>
          </div>
        </DashboardCard>

        <DashboardCard title="Maintenance Overview">
          <div className="static-finance">
            <strong>
              ₹
              {Number(
                stats.maintenanceCostThisMonth ||
                  0
              ).toLocaleString("en-IN")}
            </strong>

            <span>
              Total maintenance cost this
              month
            </span>
          </div>
        </DashboardCard>
      </section>

      {overviewExtras && (
        <section className="dashboard-two-column">
          <DashboardCard title="Financial Overview">
            <div className="status-list">
              <StatusRow
                label="Total Expenses"
                value={`₹${Number(
                  overviewExtras.financial
                    ?.totalExpenses || 0
                ).toLocaleString("en-IN")}`}
              />

              <StatusRow
                label="Fuel Cost"
                value={`₹${Number(
                  overviewExtras.financial
                    ?.fuelCost || 0
                ).toLocaleString("en-IN")}`}
              />

              <StatusRow
                label="Maintenance Cost"
                value={`₹${Number(
                  overviewExtras.financial
                    ?.maintenanceCost || 0
                ).toLocaleString("en-IN")}`}
              />

              <StatusRow
                label="Trip Expenses"
                value={`₹${Number(
                  overviewExtras.financial
                    ?.tripExpenses || 0
                ).toLocaleString("en-IN")}`}
              />

              <StatusRow
                label="Revenue"
                value={`₹${Number(
                  overviewExtras.financial
                    ?.revenue || 0
                ).toLocaleString("en-IN")}`}
              />
            </div>
          </DashboardCard>

          <DashboardCard title="Customer Overview">
            <div className="status-list">
              <StatusRow
                label="Total Customers"
                value={
                  overviewExtras.customers
                    ?.total || 0
                }
              />

              <StatusRow
                label="Active Customers"
                value={
                  overviewExtras.customers
                    ?.active || 0
                }
              />

              <StatusRow
                label="New Requests"
                value={
                  overviewExtras.customers
                    ?.newRequests || 0
                }
              />

              <StatusRow
                label="Active Customer Trips"
                value={
                  overviewExtras.customers
                    ?.activeTrips || 0
                }
              />

              <StatusRow
                label="Completed Customer Trips"
                value={
                  overviewExtras.customers
                    ?.completedTrips || 0
                }
              />
            </div>
          </DashboardCard>

          <DashboardCard title="Maintenance Overview">
            <div className="status-list">
              <StatusRow
                label="Vehicles Under Maintenance"
                value={
                  overviewExtras.maintenance
                    ?.vehiclesUnderMaintenance ||
                  0
                }
              />

              <StatusRow
                label="Service Due Soon"
                value={
                  overviewExtras.maintenance
                    ?.serviceDueSoon || 0
                }
              />

              <StatusRow
                label="Overdue"
                value={
                  overviewExtras.maintenance
                    ?.overdue || 0
                }
              />

              <StatusRow
                label="Completed This Month"
                value={
                  overviewExtras.maintenance
                    ?.completedThisMonth || 0
                }
              />

              <StatusRow
                label="Maintenance Cost"
                value={`₹${Number(
                  overviewExtras.maintenance
                    ?.totalCost || 0
                ).toLocaleString("en-IN")}`}
              />
            </div>
          </DashboardCard>

          <DashboardCard title="Driver Overview">
            <div className="status-list">
              <StatusRow
                label="Total Drivers"
                value={
                  overviewExtras.drivers
                    ?.total || 0
                }
              />

              <StatusRow
                label="Available"
                value={
                  overviewExtras.drivers
                    ?.status?.AVAILABLE || 0
                }
              />

              <StatusRow
                label="On Trip"
                value={
                  overviewExtras.drivers
                    ?.status?.ON_TRIP || 0
                }
              />

              <StatusRow
                label="Off Duty"
                value={
                  overviewExtras.drivers
                    ?.status?.OFF_DUTY || 0
                }
              />

              <StatusRow
                label="Inactive"
                value={
                  overviewExtras.drivers
                    ?.status?.INACTIVE || 0
                }
              />
            </div>
          </DashboardCard>
        </section>
      )}

      {overviewExtras && (
        <DashboardCard title="Live Fleet Map">
          <LiveFleetMap
            vehicles={
              overviewExtras.liveFleet
            }
          />

          {!overviewExtras.liveFleet?.some(
            (vehicle) =>
              vehicle.tracking
          ) && (
            <div
              className="table-empty"
              style={{ padding: 12 }}
            >
              Location unavailable for
              the current fleet.
            </div>
          )}
        </DashboardCard>
      )}

      <DashboardCard title="Recent Activities">
        <div className="sa-activity-list">
          {(dashboard?.recentActivities ||
            []).length ? (
            dashboard.recentActivities.map(
              (activity, index) => (
                <div
                  className="sa-activity"
                  key={`${activity.title}-${index}`}
                >
                  <span className="sa-activity-dot" />

                  <div>
                    <strong>
                      {activity.title}
                    </strong>

                    <small>
                      {formatDateTime(
                        activity.time
                      )}
                    </small>
                  </div>
                </div>
              )
            )
          ) : (
            <div className="table-empty">
              No recent activity recorded
              yet.
            </div>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}

function AdminVehiclesView({
  vehicles,
  loading,
  pagination,
  onPageChange,
  onExport,
  onExportPdf,
}) {
  return (
    <DashboardCard
      title={`Active Vehicles (${vehicles.length})`}
      icon={<Car size={18} />}
    >
      <div className="table-wrapper">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Registration</th>
              <th>Vehicle</th>
              <th>Type</th>
              <th>Driver</th>
              <th>Status</th>
              <th>Odometer</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan="6"
                  className="table-empty"
                >
                  Loading active vehicles...
                </td>
              </tr>
            ) : vehicles.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="table-empty"
                >
                  No active vehicles found.
                </td>
              </tr>
            ) : (
              vehicles.map((vehicle) => (
                <tr key={vehicle._id}>
                  <td>
                    <strong>
                      {vehicle.registrationNumber ||
                        "—"}
                    </strong>
                  </td>

                  <td>
                    {[
                      vehicle.make,
                      vehicle.model,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                      vehicle.vehicleNumber ||
                      "—"}
                  </td>

                  <td>
                    {vehicle.vehicleType ||
                      "—"}
                  </td>

                  <td>
                    {vehicle.assignedDriver
                      ?.fullName ||
                      "Not Assigned"}
                  </td>

                  <td>
                    <StatusBadge
                      status={
                        vehicle.status
                      }
                    />
                  </td>

                  <td>
                    {Number(
                      vehicle.currentOdometer ||
                        0
                    ).toLocaleString()}{" "}
                    km
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePager
        pagination={pagination}
        onPageChange={onPageChange}
        onExport={onExport}
        onExportPdf={onExportPdf}
      />
    </DashboardCard>
  );
}

function AdminDriversView({
  drivers,
  loading,
  pagination,
  onPageChange,
  onExport,
  onExportPdf,
}) {
  return (
    <DashboardCard
      title={`Active Drivers (${drivers.length})`}
      icon={<Users size={18} />}
    >
      <div className="table-wrapper">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Email</th>
              <th>Phone</th>
              <th>License</th>
              <th>Vehicle</th>
              <th>Status</th>
              <th>License Expiry</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan="7"
                  className="table-empty"
                >
                  Loading active drivers...
                </td>
              </tr>
            ) : drivers.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  className="table-empty"
                >
                  No active drivers found.
                </td>
              </tr>
            ) : (
              drivers.map((driver) => (
                <tr key={driver._id}>
                  <td>
                    <strong>
                      {driver.fullName ||
                        "—"}
                    </strong>
                  </td>

                  <td>
                    {driver.email || "—"}
                  </td>

                  <td>
                    {driver.phone || "—"}
                  </td>

                  <td>
                    {driver.profile
                      ?.licenseNumber ||
                      "—"}
                  </td>

                  <td>
                    {driver.profile
                      ?.assignedVehicle
                      ?.registrationNumber ||
                      "Not Assigned"}
                  </td>

                  <td>
                    <StatusBadge
                      status={
                        driver.profile
                          ?.status ||
                        (driver.isActive
                          ? "AVAILABLE"
                          : "INACTIVE")
                      }
                    />
                  </td>

                  <td>
                    {driver.profile
                      ?.licenseExpiry
                      ? new Date(
                          driver.profile
                            .licenseExpiry
                        ).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePager
        pagination={pagination}
        onPageChange={onPageChange}
        onExport={onExport}
        onExportPdf={onExportPdf}
      />
    </DashboardCard>
  );
}

function TablePager({
  pagination,
  onPageChange,
  onExport,
  onExportPdf,
}) {
  if (
    !pagination &&
    !onExport &&
    !onExportPdf
  ) {
    return null;
  }

  return (
    <div className="sa-table-pager">
      {onExport && (
        <button
          className="sa-small-action"
          onClick={onExport}
        >
          Export CSV
        </button>
      )}

      {onExportPdf && (
        <button
          className="sa-small-action"
          onClick={onExportPdf}
        >
          Export PDF
        </button>
      )}

      {pagination && (
        <div>
          <button
            className="sa-small-action"
            disabled={!pagination.hasPrevPage}
            onClick={() =>
              onPageChange(
                pagination.page - 1
              )
            }
          >
            Previous
          </button>

          <span
            style={{
              margin: "0 10px",
            }}
          >
            Page {pagination.page} of{" "}
            {Math.max(
              1,
              pagination.totalPages
            )}
          </span>

          <button
            className="sa-small-action"
            disabled={!pagination.hasNextPage}
            onClick={() =>
              onPageChange(
                pagination.page + 1
              )
            }
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  dynamic,
}) {
  return (
    <div
      className={`sa-stat-card ${
        dynamic ? "dynamic" : ""
      }`}
    >
      <div className="sa-stat-icon">
        {icon}
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  children,
  icon,
  action,
}) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card-header">
        <h2>
          {icon}
          {title}
        </h2>

        {action}
      </div>

      {children}
    </section>
  );
}

function StatusRow({ label, value }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = String(
    status || "UNKNOWN"
  )
    .toLowerCase()
    .replaceAll("_", "-");

  return (
    <span
      className={`sa-status-badge ${normalized}`}
    >
      {formatStatus(status)}
    </span>
  );
}

export default SuperAdminDashboard;