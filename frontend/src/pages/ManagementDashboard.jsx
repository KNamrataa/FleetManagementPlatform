import NotificationBell from "../components/NotificationBell";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Fuel,
  LayoutDashboard,
  LogOut,
  Menu,
  Route,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, clearAuthSession, getStoredUser } from "../services/api";
import "./RoleDashboard.css";
import "./ManagementDashboard.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const number = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const percent = (value) => `${Number(value || 0).toFixed(1)}%`;
const dateText = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const statusText = (value) => String(value || "—").replaceAll("_", " ");

function ManagementDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("mgmt-0");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  if (!user || !user.role) return <Navigate to="/login" replace />;
  const role = String(user.role).trim().toUpperCase();
  if (role !== "VIEWER" && role !== "SUPER_ADMIN") return <Navigate to="/dashboard" replace />;

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await apiRequest("/api/management/dashboard");
      setData(response);
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to load management dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ids = ["mgmt-0", "mgmt-1", "mgmt-2", "mgmt-3", "mgmt-4", "mgmt-5"];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-100px 0px -55% 0px", threshold: [0.05, 0.2, 0.5] });
    ids.forEach((id) => { const element = document.getElementById(id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [data]);

  const logout = async () => {
    try { await apiRequest("/api/auth/logout", { method: "POST" }); } catch (err) { console.error(err); }
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  const goToSection = (id) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setSidebarOpen(false);
  };

  const k = data?.kpis || {};
  const vehicleStatus = data?.vehicleStatus || {};
  const tripStatus = data?.tripStatus || {};
  const monthly = data?.monthly || [];
  const vehiclePerformance = data?.vehiclePerformance || [];
  const driverPerformance = data?.driverPerformance || [];
  const tripPerformance = data?.tripPerformance || [];
  const customerPerformance = data?.customerPerformance || [];
  const financialReports = data?.financialReports || {};
  const reports = financialReports.reports || {};
  const maxMonthly = Math.max(1, ...monthly.map((m) => Math.max(m.revenue, m.expenses)));
  const maxVehicleTrips = Math.max(1, ...vehiclePerformance.map((v) => v.trips));
  const maxDriverTrips = Math.max(1, ...driverPerformance.map((d) => d.trips));
  const maxTripExpenses = Math.max(1, ...tripPerformance.map((t) => t.totalExpenses));
  const maxCustomerRevenue = Math.max(1, ...customerPerformance.map((c) => c.revenue));
  const fleetTotal = Math.max(1, Object.values(vehicleStatus).reduce((a, b) => a + b, 0));
  const available = vehicleStatus.AVAILABLE || 0;
  const onTrip = vehicleStatus.ON_TRIP || 0;
  const assigned = vehicleStatus.ASSIGNED || 0;
  const maintenanceVehicles = vehicleStatus.MAINTENANCE || 0;
  const fleetSegments = [
    { label: "Available", value: available, className: "available" },
    { label: "On Trip", value: onTrip, className: "trip" },
    { label: "Assigned", value: assigned, className: "assigned" },
    { label: "Maintenance", value: maintenanceVehicles, className: "maintenance" },
    { label: "Inactive", value: vehicleStatus.INACTIVE || 0, className: "inactive" },
  ];
  const navItems = [
    ["Overview", LayoutDashboard, "mgmt-0"],
    ["Fleet Performance", Truck, "mgmt-1"],
    ["Trip Performance", Route, "mgmt-2"],
    ["Financial Reports", BarChart3, "mgmt-3"],
    ["Maintenance", Wrench, "mgmt-4"],
    ["Customers", Users, "mgmt-5"],
  ];

  const fleetReportText = useMemo(() => reports.fleet || {}, [reports]);
  const driverReportText = useMemo(() => reports.driver || {}, [reports]);

  return (
    <div className="role-dashboard management-dashboard">
      <aside className={`role-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="role-logo"><div className="role-logo-icon"><Car size={22} /></div><span>Fleet<span>Flow</span></span></div>
        <div className="role-user"><div className="role-avatar">{user.fullName?.charAt(0)?.toUpperCase() || "M"}</div><div><strong>{user.fullName || "Management"}</strong><span>MANAGEMENT / VIEWER</span></div></div>
        <nav className="role-nav">
          {navItems.map(([label, Icon, id]) => <button key={label} type="button" className={`role-nav-item ${activeSection === id ? "active" : ""}`} onClick={() => goToSection(id)}><Icon size={18} />{label}</button>)}
        </nav>
        <button className="role-logout" onClick={logout}><LogOut size={18} />Sign Out</button>
      </aside>

      <main className="role-main">
        <header className="role-header">
          <button className="role-mobile-menu" onClick={() => setSidebarOpen((v) => !v)}>{sidebarOpen ? <X size={22} /> : <Menu size={22} />}</button>
          <div><p className="role-eyebrow">MANAGEMENT / VIEWER</p><h1>Management Dashboard</h1><p>Fleet performance, business monitoring and read-only analytics</p></div>
          <div className="role-header-user"><NotificationBell /><span>{user.fullName}</span><button className="management-refresh" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
        </header>

        <div className="role-content">
          {error && <div className="management-error"><AlertTriangle size={18} />{error}<button onClick={load}>Retry</button></div>}
          {loading && !data ? <div className="management-loading">Loading live management data…</div> : (
            <>
              <section id="mgmt-0" className="management-anchor">
                <div className="management-section-intro"><div><span className="management-section-kicker">BUSINESS OVERVIEW</span><h2>Overall Business Performance</h2><p>Read-only monitoring of fleet, drivers, trips, finance, maintenance and customers.</p></div><div className="management-readonly"><CheckCircle2 size={16} /> Read-only access</div></div>
                <div className="role-stats management-kpis">
                  <Metric icon={<Car />} title="Total Vehicles" value={k.totalVehicles} />
                  <Metric icon={<Users />} title="Total Drivers" value={k.totalDrivers} />
                  <Metric icon={<Activity />} title="Active Trips" value={k.activeTrips} />
                  <Metric icon={<CheckCircle2 />} title="Completed Trips" value={k.completedTrips} />
                  <Metric icon={<CircleDollarSign />} title="Total Expenses" value={money(k.totalExpenses)} />
                  <Metric icon={<Users />} title="Active Customers" value={k.activeCustomers} />
                  <Metric icon={<CircleDollarSign />} title="Revenue" value={money(k.revenue)} />
                  <Metric icon={<CircleDollarSign />} title="Net Profit" value={money(k.netProfit)} />
                </div>

                <section className="management-grid-two">
                  <DashboardCard title="Fleet Status Overview" icon={<Truck />}>
                    <div className="fleet-status-layout">
                      <div className="fleet-donut" style={{ background: `conic-gradient(#16a34a 0 ${available / fleetTotal * 360}deg, #dc2626 ${available / fleetTotal * 360} ${(available + onTrip) / fleetTotal * 360}deg, #f59e0b ${(available + onTrip) / fleetTotal * 360} ${(available + onTrip + assigned) / fleetTotal * 360}deg, #7c3aed ${(available + onTrip + assigned) / fleetTotal * 360} ${(available + onTrip + assigned + maintenanceVehicles) / fleetTotal * 360}deg, #64748b ${(available + onTrip + assigned + maintenanceVehicles) / fleetTotal * 360}deg 360deg)`}}><div>{k.totalVehicles}<span>Vehicles</span></div></div>
                      <div className="status-list">{fleetSegments.map((item) => <div className="status-list-row" key={item.label}><span><i className={`status-dot ${item.className}`} />{item.label}</span><strong>{item.value}</strong></div>)}</div>
                    </div>
                  </DashboardCard>
                  <DashboardCard title="Trip Status Summary" icon={<Route />}>
                    <div className="bar-list">{[["Scheduled", tripStatus.SCHEDULED || 0], ["Assigned", tripStatus.ASSIGNED || 0], ["In Progress", tripStatus.IN_PROGRESS || 0], ["Completed", tripStatus.COMPLETED || 0], ["Cancelled", tripStatus.CANCELLED || 0]].map(([label, value]) => { const total = Math.max(1, ...Object.values(tripStatus)); return <div className="bar-row" key={label}><div><span>{label}</span><strong>{value}</strong></div><div className="bar-track"><span style={{ width: `${(value / total) * 100}%` }} /></div></div>; })}</div>
                  </DashboardCard>
                </section>

                <DashboardCard title="Financial Performance — Last 6 Months" icon={<BarChart3 />}>
                  <div className="chart-legend"><span><i className="legend revenue" />Revenue</span><span><i className="legend expense" />Expenses</span></div>
                  <div className="monthly-chart">{monthly.map((m) => <div className="month-column" key={m.key}><div className="month-bars"><span className="month-bar revenue" style={{ height: `${Math.max(4, m.revenue / maxMonthly * 100)}%` }} title={`Revenue ${money(m.revenue)}`} /><span className="month-bar expense" style={{ height: `${Math.max(4, m.expenses / maxMonthly * 100)}%` }} title={`Expenses ${money(m.expenses)}`} /></div><strong>{m.label}</strong><small>{money(m.revenue)}</small></div>)}</div>
                </DashboardCard>
              </section>

              <section id="mgmt-1" className="management-anchor">
                <SectionHeading kicker="FLEET REPORT" title="Fleet Performance" description="Vehicle-by-vehicle utilization, trip activity, distance and operating cost analysis." icon={<Truck />} />
                <div className="management-summary-grid"><SummaryCard label="Vehicles" value={number(fleetReportText.vehicles)} /><SummaryCard label="Fleet Distance" value={`${number(fleetReportText.distance)} km`} /><SummaryCard label="Operating Cost" value={money(fleetReportText.operatingCost)} /><SummaryCard label="Maintenance Vehicles" value={number(k.vehiclesInMaintenance)} /></div>
                <DashboardCard title="Vehicle Performance — Every Vehicle" icon={<Truck />}>
                  <div className="role-table-wrapper"><table className="role-table performance-table"><thead><tr><th>Vehicle</th><th>Status</th><th>Trips</th><th>Completed</th><th>Distance</th><th>Fuel</th><th>Maintenance</th><th>Operating Cost</th><th>Cost/Trip</th><th>Completion</th></tr></thead><tbody>{vehiclePerformance.map((row) => <tr key={String(row.vehicleId)}><td><strong>{row.vehicleNumber || "—"}</strong><small>{row.registrationNumber || "—"}</small></td><td><StatusBadge value={row.status} /></td><td><BarValue value={row.trips} max={maxVehicleTrips} /></td><td>{row.completedTrips}</td><td>{number(row.totalDistance)} km</td><td>{money(row.fuelCost)}</td><td>{money(row.maintenanceCost)}</td><td><strong>{money(row.operatingCost)}</strong></td><td>{money(row.costPerTrip)}</td><td>{percent(row.completionRate)}</td></tr>)}{!vehiclePerformance.length && <EmptyRow colSpan="10" text="No vehicle performance data available." />}</tbody></table></div>
                </DashboardCard>
                <DashboardCard title="Fleet Analysis" icon={<Activity />}>
                  <div className="analysis-grid"><AnalysisItem title="Most active vehicles" text={vehiclePerformance.slice(0, 3).map((v) => `${v.registrationNumber || v.vehicleNumber || "Vehicle"} (${v.trips} trips)`).join(" • ") || "No trip data"} /><AnalysisItem title="Highest operating cost" text={vehiclePerformance[0] ? `${vehiclePerformance.slice().sort((a, b) => b.operatingCost - a.operatingCost)[0].registrationNumber || "Vehicle"} — ${money(vehiclePerformance.slice().sort((a, b) => b.operatingCost - a.operatingCost)[0].operatingCost)}` : "No cost data"} /><AnalysisItem title="Fleet completion rate" text={percent(k.completedTrips && (k.completedTrips / Math.max(1, k.completedTrips + k.activeTrips + (k.scheduledTrips || 0) + (k.cancelledTrips || 0))) * 100)} /><AnalysisItem title="Vehicles requiring attention" text={`${number((k.vehiclesInMaintenance || 0) + (data.serviceDueVehicles?.length || 0))} vehicles are under maintenance or due for service.`} /></div>
                </DashboardCard>
                <DashboardCard title="Driver Performance — Every Driver" icon={<Users />}>
                  <div className="role-table-wrapper"><table className="role-table performance-table"><thead><tr><th>Driver</th><th>Account</th><th>Trips</th><th>Completed</th><th>Active</th><th>Distance</th><th>Trip Expenses</th><th>Driver Expenses</th><th>Total Expense</th><th>Completion</th></tr></thead><tbody>{driverPerformance.map((row) => <tr key={String(row.driverId)}><td><strong>{row.name}</strong><small>{row.email}</small></td><td><StatusBadge value={row.accountActive ? "ACTIVE" : "INACTIVE"} /></td><td><BarValue value={row.trips} max={maxDriverTrips} /></td><td>{row.completedTrips}</td><td>{row.activeTrips}</td><td>{number(row.totalDistance)} km</td><td>{money(row.tripExpenses)}</td><td>{money(row.driverExpenses)}</td><td><strong>{money(row.totalExpense)}</strong></td><td>{percent(row.completionRate)}</td></tr>)}{!driverPerformance.length && <EmptyRow colSpan="10" text="No driver performance data available." />}</tbody></table></div>
                </DashboardCard>
              </section>

              <section id="mgmt-2" className="management-anchor">
                <SectionHeading kicker="TRIP REPORT" title="Trip Performance" description="Individual trip analysis covering route, driver, vehicle, revenue, costs, distance and profitability." icon={<Route />} />
                <div className="management-summary-grid"><SummaryCard label="Total Trips" value={number(reports.trip?.trips)} /><SummaryCard label="Completed Trips" value={number(reports.trip?.completedTrips)} /><SummaryCard label="Completion Rate" value={percent(reports.trip?.completionRate)} /><SummaryCard label="Active Trips" value={number(k.activeTrips)} /></div>
                <DashboardCard title="Trip-by-Trip Performance" icon={<Route />}>
                  <div className="role-table-wrapper"><table className="role-table performance-table"><thead><tr><th>Trip</th><th>Route</th><th>Driver</th><th>Vehicle</th><th>Status</th><th>Distance</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>Cost/km</th></tr></thead><tbody>{tripPerformance.map((row) => <tr key={String(row.tripObjectId)}><td><strong>{row.tripId}</strong><small>{dateText(row.scheduledStart)}</small></td><td><span className="route-cell">{row.pickup}<b>→</b>{row.destination}</span></td><td>{row.driver}</td><td>{row.vehicle}</td><td><StatusBadge value={row.status} /></td><td>{number(row.distance)} km</td><td>{money(row.revenue)}</td><td><BarValue value={row.totalExpenses} max={maxTripExpenses} moneyValue /></td><td className={row.profit >= 0 ? "profit-positive" : "profit-negative"}>{money(row.profit)}</td><td>{money(row.costPerKm)}</td></tr>)}{!tripPerformance.length && <EmptyRow colSpan="10" text="No trip performance data available." />}</tbody></table></div>
                </DashboardCard>
              </section>

              <section id="mgmt-3" className="management-anchor">
                <SectionHeading kicker="REPORTS & ANALYTICS" title="Financial Reports" description="Read-only fleet, driver, trip, fuel, maintenance and expense reports from the same MongoDB data." icon={<BarChart3 />} />
                <div className="management-summary-grid"><SummaryCard label="6-Month Revenue" value={money(financialReports.sixMonthRevenue)} /><SummaryCard label="6-Month Expenses" value={money(financialReports.sixMonthExpenses)} /><SummaryCard label="6-Month Profit" value={money(financialReports.sixMonthProfit)} /><SummaryCard label="Outstanding Receivables" value={money(k.outstandingReceivables)} /></div>
                <div className="management-report-cards">
                  <ReportCard title="Fleet Report" icon={<Truck />} value={`${number(reports.fleet?.vehicles)} vehicles`} detail={`${number(reports.fleet?.distance)} km tracked • ${money(reports.fleet?.operatingCost)} operating cost`} />
                  <ReportCard title="Driver Report" icon={<Users />} value={`${number(reports.driver?.drivers)} drivers`} detail={`${number(reports.driver?.completedTrips)} completed of ${number(reports.driver?.trips)} trips`} />
                  <ReportCard title="Trip Report" icon={<Route />} value={`${number(reports.trip?.trips)} trips`} detail={`${percent(reports.trip?.completionRate)} completion rate`} />
                  <ReportCard title="Fuel Report" icon={<Fuel />} value={money(reports.fuel?.totalCost)} detail={`${number(reports.fuel?.litres)} litres • ${money(reports.fuel?.currentMonthCost)} this month`} />
                  <ReportCard title="Maintenance Report" icon={<Wrench />} value={money(reports.maintenance?.totalCost)} detail={`${number(reports.maintenance?.services)} services • ${money(reports.maintenance?.currentMonthCost)} this month`} />
                  <ReportCard title="Expense Report" icon={<CircleDollarSign />} value={money(reports.expense?.totalCost)} detail={`${money(reports.expense?.currentMonthCost)} current month`} />
                </div>
                <DashboardCard title="Expense Category Analysis" icon={<CircleDollarSign />}>
                  <div className="category-report-list">{(financialReports.categories || []).map((item) => { const max = Math.max(1, ...((financialReports.categories || []).map((x) => x.value))); return <div className="category-report-row" key={item.key}><div><span>{item.label}</span><strong>{money(item.value)}</strong></div><div className="bar-track"><span style={{ width: `${(item.value / max) * 100}%` }} /></div></div>; })}</div>
                </DashboardCard>
              </section>

              <section id="mgmt-4" className="management-anchor">
                <SectionHeading kicker="MAINTENANCE REPORT" title="Maintenance Performance" description="Monitor service activity, maintenance cost and vehicles needing attention without changing operational data." icon={<Wrench />} />
                <div className="management-summary-grid"><SummaryCard label="Under Maintenance" value={number(k.vehiclesInMaintenance)} /><SummaryCard label="Active Work Orders" value={number(data.activeWorkOrders?.length)} /><SummaryCard label="Service Due" value={number(data.serviceDueVehicles?.length)} /><SummaryCard label="Maintenance Cost" value={money(k.maintenanceCost)} /></div>
                <div className="management-grid-two">
                  <DashboardCard title="Top Maintenance Cost Vehicles" icon={<Wrench />}><div className="compact-list">{(data.topCostVehicles || []).map((item) => <div key={String(item.vehicleId)}><span>{item.registrationNumber || item.vehicleNumber || "Vehicle"}<small>{item.services} services</small></span><strong>{money(item.totalCost)}</strong></div>)}{!data.topCostVehicles?.length && <div className="empty-state">No maintenance history available.</div>}</div></DashboardCard>
                  <DashboardCard title="Vehicles Due for Service" icon={<Clock3 />}><div className="compact-list">{(data.serviceDueVehicles || []).map((item, index) => <div key={`${item.vehicleNumber}-${index}`}><span>{item.registrationNumber || item.vehicleNumber || "Vehicle"}<small>{number(item.currentOdometer)} km</small></span><strong>{statusText(item.schedule?.status)}</strong></div>)}{!data.serviceDueVehicles?.length && <div className="empty-state">No vehicles are currently due.</div>}</div></DashboardCard>
                </div>
              </section>

              <section id="mgmt-5" className="management-anchor">
                <SectionHeading kicker="CUSTOMER REPORT" title="Customer Performance" description="Customer-level service activity, invoicing and receivables. No customer can be edited from this dashboard." icon={<Users />} />
                <div className="management-summary-grid"><SummaryCard label="Total Customers" value={number(k.totalCustomers)} /><SummaryCard label="Active Customers" value={number(k.activeCustomers)} /><SummaryCard label="Revenue" value={money(k.revenue)} /><SummaryCard label="Receivables" value={money(k.outstandingReceivables)} /></div>
                <DashboardCard title="Customer-by-Customer Analysis" icon={<Users />}>
                  <div className="role-table-wrapper"><table className="role-table performance-table"><thead><tr><th>Customer</th><th>Trips</th><th>Active</th><th>Completed</th><th>Invoices</th><th>Revenue</th><th>Paid</th><th>Outstanding</th><th>Account</th></tr></thead><tbody>{customerPerformance.map((row) => <tr key={String(row.customerId)}><td><strong>{row.name}</strong><small>{row.email}</small></td><td><BarValue value={row.trips} max={Math.max(1, ...customerPerformance.map((x) => x.trips))} /></td><td>{row.activeTrips}</td><td>{row.completedTrips}</td><td>{row.invoices}</td><td><BarValue value={row.revenue} max={maxCustomerRevenue} moneyValue /></td><td>{money(row.paid)}</td><td>{money(row.outstanding)}</td><td><StatusBadge value={row.accountActive ? "ACTIVE" : "INACTIVE"} /></td></tr>)}{!customerPerformance.length && <EmptyRow colSpan="9" text="No customer performance data available." />}</tbody></table></div>
                </DashboardCard>
              </section>

              <DashboardCard title="Recent Business Activity" icon={<Activity />}>
                <div className="activity-list">{(data.activity || []).map((item, index) => <div className="management-activity" key={`${item.date}-${index}`}><span className={`activity-type ${item.type.toLowerCase()}`}><Activity size={13} /></span><div><strong>{item.text}</strong><small>{dateText(item.date)}</small></div></div>)}{!data.activity?.length && <div className="empty-state">No recent activity.</div>}</div>
              </DashboardCard>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({ icon, title, value }) { return <div className="metric-card"><div className="metric-icon">{icon}</div><div><span>{title}</span><strong>{value}</strong></div></div>; }
function SummaryCard({ label, value }) { return <div className="management-summary-card"><span>{label}</span><strong>{value}</strong></div>; }
function ReportCard({ title, icon, value, detail }) { return <div className="management-report-card"><div className="report-icon">{icon}</div><div><span>{title}</span><strong>{value}</strong><small>{detail}</small></div></div>; }
function MetricMini({ icon, label, value }) { return <div className="metric-mini">{icon && <div>{icon}</div>}<span>{label}</span><strong>{value}</strong></div>; }
function DashboardCard({ title, icon, children }) { return <section className="role-section management-card"><div className="role-section-header"><h2>{icon}{title}</h2></div>{children}</section>; }
function SectionHeading({ kicker, title, description, icon }) { return <div className="management-section-heading"><div className="management-heading-icon">{icon}</div><div><span>{kicker}</span><h2>{title}</h2><p>{description}</p></div></div>; }
function AnalysisItem({ title, text }) { return <div className="analysis-item"><span>{title}</span><strong>{text}</strong></div>; }
function StatusBadge({ value }) { const normalized = String(value || "UNKNOWN").toLowerCase().replaceAll("_", "-"); return <span className={`management-status-badge ${normalized}`}>{statusText(value)}</span>; }
function BarValue({ value, max, moneyValue = false }) { const width = Math.min(100, Math.max(0, (Number(value || 0) / Math.max(1, Number(max || 1))) * 100)); return <div className="table-bar-value"><strong>{moneyValue ? money(value) : number(value)}</strong><span><i style={{ width: `${width}%` }} /></span></div>; }
function EmptyRow({ colSpan, text }) { return <tr><td colSpan={colSpan} className="empty-cell">{text}</td></tr>; }

export default ManagementDashboard;
