import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Activity, ClipboardList, FileText, LayoutDashboard, LogOut, Menu, MapPin, ReceiptIndianRupee, Send, UserCircle, X, Car } from "lucide-react";
import { API_URL, authFetch, getStoredUser, clearAuthSession } from "../services/api";
import NotificationBell from "../components/NotificationBell";
import "./CustomerDashboard.css";

export default function CustomerLayout({ title, subtitle, children }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const user = getStoredUser() || {};
  const nav = [
    ["/customer", "Overview", LayoutDashboard],
    ["/customer/trip-request", "Trip Request", Send],
    ["/customer/trips", "My Trips", Activity],
    ["/customer/tracking", "Live Tracking", MapPin],
    ["/customer/history", "Trip History", ClipboardList],
    ["/customer/billing", "Billing", ReceiptIndianRupee],
    ["/customer/profile", "Profile", UserCircle],
  ];
  const logout = async () => {
    try { await authFetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch {}
    clearAuthSession();
    navigate("/login", { replace: true });
  };
  return (
    <div className="customer-shell">
      <aside className={`customer-sidebar ${open ? "open" : ""}`}>
        <div className="customer-brand"><div className="customer-brand-icon"><Car size={21} /></div><span>Fleet<span>Flow</span></span></div>
        <div className="customer-role">CUSTOMER</div>
        <nav>
          {nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/customer"} onClick={() => setOpen(false)} className={({ isActive }) => `customer-nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{label}</span></NavLink>)}
        </nav>
        <button className="customer-logout" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>
      {open && <button className="customer-mobile-overlay" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>}
      <main className="customer-main">
        <header className="customer-header">
          <button className="customer-menu" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div><p>CUSTOMER</p><h1>{title}</h1><span>{subtitle}</span></div>
          <NotificationBell />
          <div className="customer-user"><strong>{user.fullName || "Customer"}</strong><small>{user.email || ""}</small></div>
        </header>
        <div className="customer-content">{children}</div>
      </main>
    </div>
  );
}
