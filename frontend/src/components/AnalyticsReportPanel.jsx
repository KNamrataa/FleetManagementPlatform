import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, FileText, Mail, RefreshCw, Send } from "lucide-react";
import { apiRequest, getStoredUser } from "../services/api";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const dateInput = value => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const INITIAL_TODAY = dateInput(new Date());
const INITIAL_WEEK_AGO = dateInput(new Date(new Date().getTime() - 6 * 86400000));

export default function AnalyticsReportPanel() {
  const user = useMemo(() => getStoredUser(), []);
  const today = INITIAL_TODAY;
  const weekAgo = INITIAL_WEEK_AGO;
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [analytics, setAnalytics] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isAdmin = user?.role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const query = new URLSearchParams({ startDate, endDate }).toString();
      const [summary, reports] = await Promise.all([
        apiRequest(`/api/analytics/summary?${query}`),
        apiRequest("/api/analytics/reports/history?limit=5"),
      ]);
      setAnalytics(summary.analytics || null);
      setHistory(reports.data || []);
    } catch (e) { setError(e.message || "Unable to load analytics."); }
    finally { setLoading(false); }
  }, [startDate, endDate]);
  useEffect(() => { load(); }, [load]);

  const sendNow = async () => {
    setSending(true); setError(""); setMessage("");
    try {
      const result = await apiRequest("/api/analytics/reports/send-now", { method: "POST" });
      setMessage(result.message || "Daily report email was accepted for delivery.");
      try {
        const reports = await apiRequest("/api/analytics/reports/history?limit=5");
        setHistory(reports.data || []);
      } catch (historyError) {
        // Email delivery has already succeeded; keep that success visible if history refresh fails.
      }
    } catch (e) {
      setError(e.message || e.data?.report?.errorMessage || "Unable to send the report. Check backend email configuration and report history.");
      try {
        const reports = await apiRequest("/api/analytics/reports/history?limit=5");
        setHistory(reports.data || []);
      } catch (historyError) {}
    }
    finally { setSending(false); }
  };
  const runAll = async () => {
    setSending(true); setError(""); setMessage("");
    try {
      const result = await apiRequest("/api/analytics/reports/run-all", { method: "POST" });
      await load();
      setMessage(`Report run finished: ${result.result?.sent || 0} sent, ${result.result?.failed || 0} failed.`);
    } catch (e) { setError(e.message || "Unable to run manager reports."); }
    finally { setSending(false); }
  };

  const metricCards = [];
  if (analytics?.fleet) metricCards.push(["Vehicles", analytics.fleet.totalVehicles], ["Active drivers", analytics.fleet.activeDrivers], ["Open work orders", analytics.fleet.openMaintenanceOrders], ["Services overdue", analytics.fleet.overdueServices]);
  if (analytics?.trips) metricCards.push(["Trips in period", analytics.trips.tripsCreated], ["Completed trips", analytics.trips.completedInPeriod], ["Trip completion", `${analytics.trips.completionRate}%`], ["Unassigned trips", analytics.trips.currentlyUnassigned]);
  if (analytics?.finance) metricCards.push(["Revenue", money(analytics.finance.revenue)], ["Expenses", money(analytics.finance.expenses)], ["Fuel cost", money(analytics.finance.fuelCost)], ["Profit estimate", money(analytics.finance.profitEstimate)], ["Overdue invoices", analytics.finance.overdueInvoices]);
  if (analytics?.maintenance) metricCards.push(["Open work orders", analytics.maintenance.openWorkOrders], ["Overdue services", analytics.maintenance.overdueServices], ["Maintenance cost", money(analytics.maintenance.maintenanceCost)], ["Open vehicle issues", analytics.maintenance.openVehicleIssues]);
  if (analytics?.customer) metricCards.push(["Driver rating", analytics.customer.averageDriverRating], ["Service rating", analytics.customer.averageServiceRating], ["Ratings in period", analytics.customer.ratingsCount]);

  const panelStyle = { border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 14, padding: 18, margin: "16px 0", background: "var(--card-bg, transparent)", color: "var(--text-color, #172033)" };
  const buttonStyle = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 12px", border: "1px solid var(--border-color, #cbd5e1)", borderRadius: 9, background: "var(--card-bg, transparent)", color: "inherit", cursor: "pointer", minHeight: 38 };
  const fieldStyle = { padding: "8px 10px", border: "1px solid var(--border-color, #cbd5e1)", borderRadius: 8, maxWidth: "100%", minWidth: 0, background: "var(--card-bg, transparent)", color: "inherit" };

  return <section className="fleetflow-analytics-report-panel" style={panelStyle}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Activity size={21} />
        <div><h2 style={{ margin: 0, fontSize: 18 }}>Dashboard Analytics & Daily Reports</h2><p style={{ margin: "4px 0 0", opacity: .72, fontSize: 13 }}>Analytics from your existing FleetFlow records</p></div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={buttonStyle} onClick={load} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        <button type="button" style={buttonStyle} onClick={sendNow} disabled={sending || loading}><Send size={15} /> {sending ? "Sending…" : "Email my report"}</button>
        {isAdmin && <button type="button" style={buttonStyle} onClick={runAll} disabled={sending || loading}><Mail size={15} /> Send all manager reports</button>}
      </div>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginTop: 16 }}>
      <label style={{ display: "grid", gap: 5, fontSize: 12 }}>From date<input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 5, fontSize: 12 }}>To date<input type="date" value={endDate} min={startDate} max={today} onChange={e => setEndDate(e.target.value)} style={fieldStyle} /></label>
      <span style={{ fontSize: 12, opacity: .7 }}>Compare with the preceding period of equal length.</span>
    </div>
    {error && <p role="alert" style={{ color: "#b91c1c", margin: "12px 0 0" }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />{error}</p>}
    {message && <p role="status" style={{ color: "#047857", margin: "12px 0 0" }}><CheckCircle2 size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />{message}</p>}
    {loading && !analytics ? <p>Loading analytics…</p> : metricCards.length > 0 ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(145px, 100%), 1fr))", gap: 10, marginTop: 16 }}>
      {metricCards.map(([label, value]) => <div key={label} style={{ border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 10, padding: 12, minWidth: 0 }}><div style={{ fontSize: 12, opacity: .72 }}>{label}</div><strong style={{ display: "block", marginTop: 7, fontSize: 20, overflowWrap: "anywhere" }}>{value ?? 0}</strong></div>)}
    </div> : !loading && <p style={{ opacity: .72 }}>No analytics available yet.</p>}
    {analytics?.alerts?.length > 0 && <div style={{ marginTop: 16 }}><h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Items requiring attention</h3><div style={{ display: "grid", gap: 7 }}>{analytics.alerts.slice(0, 5).map((alert, index) => <div key={`${alert.message}-${index}`} style={{ display: "flex", gap: 8, alignItems: "start", padding: 10, borderRadius: 8, background: alert.severity === "HIGH" ? "#fff7ed" : "#f8fafc", color: "#334155" }}><AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 13 }}>{alert.message}</span></div>)}</div></div>}
    {analytics?.comparisons && <div style={{ marginTop: 16 }}><h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Compared with the previous period</h3><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{Object.entries(analytics.comparisons).map(([key, value]) => <span key={key} style={{ border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>{key.replaceAll(/([A-Z])/g, " $1")}: <strong>{value.changePercent > 0 ? "+" : ""}{value.changePercent}%</strong></span>)}</div></div>}
    <div style={{ marginTop: 18 }}>
      <h3 style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 15, margin: "0 0 8px" }}><FileText size={17} /> Recent report deliveries</h3>
      {history.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>Report</th><th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>Date</th><th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>Status</th><th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>Attempts</th></tr></thead><tbody>{history.map(row => <tr key={row._id}><td style={{ padding: 8, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>{row.reportType?.replaceAll("_", " ")}</td><td style={{ padding: 8, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>{row.reportDate}</td><td style={{ padding: 8, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>{row.status === "SENT" ? <CheckCircle2 size={15} color="#059669" /> : row.status === "FAILED" ? <AlertTriangle size={15} color="#dc2626" /> : <Clock3 size={15} />}{` ${row.status}`}</td><td style={{ padding: 8, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>{row.attempts}</td></tr>)}</tbody></table></div> : <p style={{ opacity: .72, fontSize: 13 }}>No report deliveries recorded yet. Daily reports are scheduled for 8:00 AM IST.</p>}
    </div>
  </section>;
}