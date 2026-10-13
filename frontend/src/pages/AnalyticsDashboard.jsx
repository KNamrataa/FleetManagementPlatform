import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowLeft, BarChart3, CalendarRange, Car, CircleDollarSign, RefreshCw, Route, TrendingUp, Wrench } from "lucide-react";
import { apiRequest, getStoredUser } from "../services/api";
import "./AnalyticsDashboard.css";

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const shiftKey = (key, days) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const number = v => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });
const money = v => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const titleRole = role => ({ FLEET_MANAGER: "Fleet Manager", FINANCE_MANAGER: "Finance Manager", MAINTENANCE_MANAGER: "Maintenance Manager", TRIP_MANAGER: "Trip Manager", DISPATCHER: "Trip Manager", VIEWER: "Management / Viewer", SUPER_ADMIN: "Super Admin" }[role] || "FleetFlow");
const homeForRole = role => ({ FLEET_MANAGER: "/fleet-manager", FINANCE_MANAGER: "/finance-manager", MAINTENANCE_MANAGER: "/maintenance", TRIP_MANAGER: "/trip-manager", DISPATCHER: "/trip-manager", VIEWER: "/management", SUPER_ADMIN: "/super-admin" }[role] || "/dashboard");

function Panel({ title, subtitle, children, className = "" }) {
  return <section className={`ff-analytics-panel ${className}`}><div className="ff-analytics-panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section>;
}
function BarChart({ items, valueLabel = number, empty = "No data is available for this period." }) {
  const max = Math.max(1, ...items.map(x => Number(x.value || 0)));
  if (!items.length || items.every(x => !Number(x.value))) return <div className="ff-analytics-empty">{empty}</div>;
  return <div className="ff-analytics-bars">{items.map((item, index) => <div className="ff-analytics-bar-row" key={`${item.label}-${index}`}><div className="ff-analytics-bar-label" title={item.label}>{item.label}</div><div className="ff-analytics-bar-track"><span style={{ width: `${Math.max(item.value > 0 ? 2 : 0, Number(item.value || 0) / max * 100)}%` }} /></div><strong>{valueLabel(item.value)}</strong></div>)}</div>;
}
function TrendChart({ items, series, format = number }) {
  const values = items.flatMap(item => series.map(s => Math.max(0, Number(item[s.key] || 0))));
  const rawMax = Math.max(0, ...values);
  if (!items.length || rawMax === 0) return <div className="ff-analytics-empty">No trend data is available for this period.</div>;

  // Round the vertical scale to readable steps and reserve space for axis labels.
  const roughStep = rawMax / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1)));
  const normalized = roughStep / magnitude;
  const niceStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const axisMax = Math.max(niceStep, Math.ceil(rawMax / niceStep) * niceStep);
  const tickValues = Array.from({ length: 5 }, (_, i) => axisMax - i * axisMax / 4);
  const chartW = 760, chartH = 300, left = 68, right = 18, top = 20, bottom = 48;
  const plotW = chartW - left - right;
  const plotH = chartH - top - bottom;
  const xAt = i => left + (items.length === 1 ? plotW / 2 : i * plotW / (items.length - 1));
  const yAt = value => top + plotH * (1 - Number(value || 0) / axisMax);
  const labelEvery = Math.max(1, Math.ceil(items.length / 7));
  const shownDates = items.map((item, i) => ({ item, i })).filter(({ i }) => i === 0 || i === items.length - 1 || i % labelEvery === 0);
  const dateLabel = date => {
    const d = new Date(`${date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(date).slice(5) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };
  return <>
    <div className="ff-analytics-svg-wrap">
      <svg viewBox={`0 0 ${chartW} ${chartH}`} role="img" aria-label="Trend chart with values on both axes" preserveAspectRatio="xMidYMid meet">
        {tickValues.map((tick, i) => {
          const y = top + plotH * i / 4;
          return <g key={`tick-${i}`}>
            <line x1={left} x2={chartW - right} y1={y} y2={y} className="ff-analytics-gridline" />
            <text x={left - 12} y={y + 4} textAnchor="end" className="ff-analytics-y-label">{format(tick)}</text>
          </g>;
        })}
        <line x1={left} x2={left} y1={top} y2={top + plotH} className="ff-analytics-axis-line" />
        <line x1={left} x2={chartW - right} y1={top + plotH} y2={top + plotH} className="ff-analytics-axis-line" />
        {series.map(s => {
          const coords = items.map((item, i) => ({ x: xAt(i), y: yAt(item[s.key]), item, i }));
          return <g key={s.key}>
            {coords.length > 1 && <polyline points={coords.map(p => `${p.x},${p.y}`).join(' ')} fill="none" className={`ff-analytics-line ${s.className || ''}`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
            {coords.map(p => <circle key={`${s.key}-${p.i}`} cx={p.x} cy={p.y} r={items.length > 20 ? 2.5 : 4} className={`ff-analytics-point ${s.className || ''}`}><title>{`${p.item.date}: ${s.label} ${format(p.item[s.key])}`}</title></circle>)}
          </g>;
        })}
        {shownDates.map(({ item, i }) => <text key={item.date} x={xAt(i)} y={chartH - 17} textAnchor="middle" className="ff-analytics-axis-label">{dateLabel(item.date)}</text>)}
      </svg>
    </div>
    <div className="ff-analytics-legend">{series.map(s => <span key={s.key}><i className={s.className || ''}/>{s.label}</span>)}</div>
  </>;
}
function DonutChart({ items }) {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!items.length || total <= 0) return <div className="ff-analytics-empty">No status data is available.</div>;
  const palette = ["#ef4444", "#0ea5e9", "#22c55e", "#f59e0b", "#8b5cf6", "#64748b", "#ec4899"];
  const stops = items.reduce((acc, item, i) => { const start = acc.total; const end = start + Number(item.value || 0) / total * 100; acc.total = end; acc.parts.push(`${palette[i % palette.length]} ${start}% ${end}%`); return acc; }, { total: 0, parts: [] }).parts.join(", ");
  return <div className="ff-analytics-donut-layout"><div className="ff-analytics-donut" style={{ background: `conic-gradient(${stops})` }}><div><strong>{number(total)}</strong><span>Total</span></div></div><div className="ff-analytics-donut-legend">{items.map((item,i)=><div key={`${item.label}-${i}`}><span><i style={{ background: palette[i % palette.length] }}/>{item.label}</span><strong>{number(item.value)}</strong></div>)}</div></div>;
}

export default function AnalyticsDashboard() {
  const user = useMemo(() => getStoredUser() || {}, []);
  const role = String(user.role || "VIEWER").toUpperCase().replace(/[\s-]+/g, "_");
  const navigate = useNavigate();
  const today = useMemo(() => todayKey(), []);
  const [startDate, setStartDate] = useState(shiftKey(today, -6));
  const [endDate, setEndDate] = useState(today);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const response = await apiRequest(`/api/analytics/summary?${params}`);
      setAnalytics(response.analytics || null);
    } catch (e) { setError(e.message || "Unable to load analytics."); }
    finally { setLoading(false); }
  }, [startDate, endDate]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const chart = analytics?.chartData || {};
  const daily = chart.dailyTrends || [];
  const tripStatuses = chart.tripStatuses || [];
  const vehicleStatuses = chart.vehicleStatuses || [];
  const expenseCategories = chart.expenseCategories || [];
  const finance = analytics?.finance || {};
  const fleet = analytics?.fleet || {};
  const trips = analytics?.trips || {};
  const maintenance = analytics?.maintenance || {};
  const isFinance = role === "FINANCE_MANAGER";
  const isMaintenance = role === "MAINTENANCE_MANAGER";
  const isFleet = role === "FLEET_MANAGER";
  const isTrips = role === "TRIP_MANAGER" || role === "DISPATCHER";
  const isExecutive = !isFinance && !isMaintenance && !isFleet && !isTrips;

  const kpis = isFinance ? [[CircleDollarSign,"Revenue",money(finance.revenue)], [CircleDollarSign,"Expenses",money(finance.expenses)], [TrendingUp,"Profit estimate",money(finance.profitEstimate)], [Activity,"Overdue invoices",number(finance.overdueInvoices)]]
    : isMaintenance ? [[Wrench,"Open work orders",number(maintenance.openWorkOrders)], [CalendarRange,"Overdue services",number(maintenance.overdueServices)], [CircleDollarSign,"Maintenance cost",money(maintenance.maintenanceCost)], [Activity,"Open vehicle issues",number(maintenance.openVehicleIssues)]]
    : isFleet ? [[Car,"Total vehicles",number(fleet.totalVehicles)], [Activity,"Active drivers",number(fleet.activeDrivers)], [Route,"Trips in period",number(trips.tripsCreated)], [Wrench,"Overdue services",number(fleet.overdueServices)]]
    : isTrips ? [[Route,"Trips in period",number(trips.tripsCreated)], [Activity,"Completed trips",number(trips.completedInPeriod)], [TrendingUp,"Completion rate",`${number(trips.completionRate)}%`], [CalendarRange,"Unassigned trips",number(trips.currentlyUnassigned)]]
    : [[Car,"Total vehicles",number(fleet.totalVehicles)], [Route,"Trips in period",number(trips.tripsCreated)], [CircleDollarSign,"Revenue",money(finance.revenue)], [TrendingUp,"Profit estimate",money(finance.profitEstimate)]];

  return <main className="ff-analytics-page">
    <header className="ff-analytics-header"><button className="ff-analytics-back" type="button" onClick={() => navigate(homeForRole(role))}><ArrowLeft size={17}/> Back to dashboard</button><div className="ff-analytics-heading"><div className="ff-analytics-heading-icon"><BarChart3 size={23}/></div><div><p>FLEETFLOW INSIGHTS</p><h1>{titleRole(role)} Analytics</h1><span>Charts and trends calculated from your FleetFlow records</span></div></div><button className="ff-analytics-refresh" type="button" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? "ff-spin" : ""}/> Refresh</button></header>
    <section className="ff-analytics-filter"><label>From date<input type="date" value={startDate} max={endDate} onChange={e=>setStartDate(e.target.value)}/></label><label>To date<input type="date" value={endDate} min={startDate} max={today} onChange={e=>setEndDate(e.target.value)}/></label><div className="ff-analytics-presets"><button type="button" onClick={()=>{setStartDate(shiftKey(today,-6));setEndDate(today);}}>7 days</button><button type="button" onClick={()=>{setStartDate(shiftKey(today,-29));setEndDate(today);}}>30 days</button><button type="button" onClick={()=>{setStartDate(`${today.slice(0,4)}-${today.slice(5,7)}-01`);setEndDate(today);}}>This month</button></div></section>
    {error && <div className="ff-analytics-error" role="alert">{error}<button type="button" onClick={load}>Retry</button></div>}
    {loading && !analytics ? <div className="ff-analytics-loading">Loading analytics from your database…</div> : <>
      <section className="ff-analytics-kpis">{kpis.map(([Icon,label,value])=><article key={label}><span className="ff-analytics-kpi-icon"><Icon size={19}/></span><div><p>{label}</p><strong>{value}</strong></div></article>)}</section>
      <section className="ff-analytics-chart-grid">
        <Panel title={isFinance ? "Revenue and expense trend" : isMaintenance ? "Maintenance spending trend" : "Trip activity trend"} subtitle="Daily totals for the selected period" className="ff-analytics-wide"><TrendChart items={isMaintenance ? (chart.maintenanceTrend || []).map(x=>({date:x.date,maintenanceCost:x.cost})) : daily} series={isFinance ? [{key:"revenue",label:"Revenue",className:"blue"},{key:"expenses",label:"Expenses",className:"red"}] : isMaintenance ? [{key:"maintenanceCost",label:"Maintenance cost",className:"red"}] : [{key:"trips",label:"Trips created",className:"blue"},{key:"completedTrips",label:"Completed",className:"green"}] } format={isFinance || isMaintenance ? money : number}/></Panel>
        {(isFinance || isExecutive) && <Panel title="Expense categories" subtitle="Recorded expense totals by category"><DonutChart items={expenseCategories}/></Panel>}
        {(isFleet || isExecutive) && <Panel title="Vehicle status distribution" subtitle="Current vehicle status across the fleet"><DonutChart items={vehicleStatuses}/></Panel>}
        {(isTrips || isFleet || isExecutive) && <Panel title="Trip status distribution" subtitle="Current trip statuses"><DonutChart items={tripStatuses}/></Panel>}
        {isFinance && <Panel title="Budget utilization" subtitle="All active budgets for the selected period"><>
          {(finance.budgetUtilization || finance.budgetWarnings || []).length > 0 ? <>
            <BarChart items={(finance.budgetUtilization || finance.budgetWarnings || []).map(x=>({label:x.name || x.category,value:x.usagePercent}))} valueLabel={v=>`${number(v)}%`} empty="No budget records are available."/>
            <div className="ff-analytics-budget-table-wrap"><table className="ff-analytics-budget-table"><thead><tr><th>Budget</th><th>Allocated</th><th>Spent</th><th>Remaining</th><th>Used</th></tr></thead><tbody>{(finance.budgetUtilization || finance.budgetWarnings || []).map((b,i)=><tr key={`${b.name}-${i}`}><td>{b.name || b.category || "Budget"}</td><td>{money(b.allocated)}</td><td>{money(b.spent)}</td><td>{money(b.remaining ?? (Number(b.allocated || 0)-Number(b.spent || 0)))}</td><td>{number(b.usagePercent)}%</td></tr>)}</tbody></table></div>
          </> : <div className="ff-analytics-empty">No active budgets overlap the selected date range. Check each budget's start and end dates.</div>}
        </></Panel>}
        {isMaintenance && <Panel title="Maintenance work and cost" subtitle="Completed jobs and recorded costs by day"><BarChart items={(chart.maintenanceTrend || []).map(x=>({label:x.date,value:x.cost}))} valueLabel={money}/></Panel>}
        {isFleet && <Panel title="Fleet health snapshot" subtitle="Items that may need attention"><BarChart items={[{label:"Open maintenance orders",value:fleet.openMaintenanceOrders},{label:"Overdue services",value:fleet.overdueServices},{label:"Expiring documents",value:fleet.documentsExpiringWithin30Days},{label:"Open vehicle issues",value:fleet.openVehicleIssues}]} /></Panel>}
        {isTrips && <Panel title="Customer satisfaction" subtitle="Ratings received during the selected period"><div className="ff-analytics-rating-grid"><div><span>Driver rating</span><strong>{number(analytics?.customer?.averageDriverRating)} / 5</strong></div><div><span>Service rating</span><strong>{number(analytics?.customer?.averageServiceRating)} / 5</strong></div><div><span>Ratings received</span><strong>{number(analytics?.customer?.ratingsCount)}</strong></div></div></Panel>}
      </section>
      <Panel title="Items requiring attention" subtitle="Prioritized from current FleetFlow records" className="ff-analytics-alert-panel">{analytics?.alerts?.length ? <div className="ff-analytics-alert-list">{analytics.alerts.map((item,i)=><div key={`${item.message}-${i}`}><span className={item.severity === "HIGH" ? "high" : "medium"}>{item.severity || "INFO"}</span><p>{item.message}</p><strong>{number(item.count)}</strong></div>)}</div> : <div className="ff-analytics-empty">No active analytics alerts for the selected scope.</div>}</Panel>
      <p className="ff-analytics-footnote">Date range: {startDate} to {endDate}. Charts reflect the records and date fields currently available in FleetFlow.</p>
    </>}
  </main>;
}
