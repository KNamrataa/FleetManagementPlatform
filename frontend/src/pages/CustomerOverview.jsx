import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock3, FileText, RefreshCw, WalletCards, Send } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";
import CustomerLayout from "./CustomerLayout";
import "./CustomerDashboard.css";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateTime = (v) => v ? new Date(v).toLocaleString("en-IN") : "—";
const badge = (v) => String(v || "").toLowerCase().replaceAll("_", "-");

export default function CustomerOverview() {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const navigate = useNavigate();
  const load = useCallback(async () => { setLoading(true); setError(""); try { const r = await apiRequest("/api/customer/dashboard"); setData(r.dashboard); } catch (e) { setError(e.message); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const d = data || {};
  return <CustomerLayout title="Dashboard Overview" subtitle="Your transportation requests, trips and billing">
    <div className="customer-toolbar"><div><h2>Overview</h2><p>Live customer-safe information from MongoDB.</p></div><button className="customer-button" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    {error && <div className="customer-alert error">{error}</div>}
    {loading && !data ? <div className="customer-loading"><div className="customer-loading-inner"><div className="customer-spinner"/>Loading your dashboard...</div></div> : <>
      <div className="customer-stats">
        {[[Activity,"Active Trips",d.activeTripsCount],[Clock3,"Pending Requests",d.pendingRequestsCount],[CheckCircle2,"Completed Trips",d.completedTripsCount],[WalletCards,"Outstanding Billing",money(d.outstandingBillingAmount)]].map(([Icon,label,value]) => <div className="customer-stat" key={label}><div className="customer-stat-icon"><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong></div></div>)}
      </div>
      <div className="customer-grid">
        <section className="customer-card"><div className="customer-card-head"><h3>Active Trips</h3><Link className="customer-link" to="/customer/trips">View all</Link></div>{d.activeTrips?.length ? <div className="customer-overview-list">{d.activeTrips.map(t => <div className="customer-overview-item" key={t._id}><div><strong>{t.tripId}</strong><span>{t.pickupLocation} → {t.destination}</span><span>{dateTime(t.scheduledStart)}</span><span>{t.driverAcceptedAt ? `Driver accepted ${dateTime(t.driverAcceptedAt)}` : "Awaiting driver acceptance"}</span></div><div className="customer-actions-inline"><span className={`customer-badge ${badge(t.tripStatus)}`}>{t.tripStatus.replaceAll("_", " ")}</span><button className="customer-button" onClick={() => navigate(`/customer/tracking/${t._id}`)}>Track</button></div></div>)}</div> : <div className="customer-empty">No active trips.</div>}</section>
        <section className="customer-card"><div className="customer-card-head"><h3>Recent Trip Requests</h3><Link className="customer-link" to="/customer/trip-request">New request</Link></div>{d.recentRequests?.length ? <div className="customer-overview-list">{d.recentRequests.map(r => <div className="customer-overview-item" key={r._id}><div><strong>{r.requestNumber}</strong><span>{r.pickupLocation} → {r.destination}</span></div><span className={`customer-badge ${badge(r.status)}`}>{r.status.replaceAll("_", " ")}</span></div>)}</div> : <div className="customer-empty">No trip requests found.</div>}</section>
      </div>
      <section className="customer-card"><div className="customer-card-head"><h3>Recent Invoices</h3><Link className="customer-link" to="/customer/billing">View billing</Link></div><div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Invoice</th><th>Trip</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{d.recentInvoices?.length ? d.recentInvoices.map(i => <tr key={i._id}><td>{i.invoiceNumber}</td><td>{i.trip?.tripId || "—"}</td><td>{money(i.totalAmount)}</td><td>{money(i.paidAmount)}</td><td>{money(i.balanceAmount)}</td><td><span className={`customer-badge ${badge(i.status)}`}>{i.status.replaceAll("_", " ")}</span></td></tr>) : <tr><td colSpan="6" className="customer-empty">No invoices available.</td></tr>}</tbody></table></div></section>
      <section className="customer-card"><div className="customer-card-head"><h3>Quick Actions</h3></div><div className="customer-actions"><Link className="customer-button primary" to="/customer/trip-request"><Send size={16}/> Request a Trip</Link><Link className="customer-button" to="/customer/history"><FileText size={16}/> View Trip History</Link><Link className="customer-button" to="/customer/billing"><WalletCards size={16}/> View Billing</Link></div></section>
    </>}
  </CustomerLayout>;
}
