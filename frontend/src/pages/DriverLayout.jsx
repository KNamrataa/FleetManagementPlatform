import NotificationBell from "../components/NotificationBell";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Activity, Car, ClipboardList, LayoutDashboard, LogOut, Menu, UserCircle, Wrench, X, Receipt } from "lucide-react";
import { API_URL, authFetch } from "../services/api";
import "./DriverDashboard.css";

export default function DriverLayout({ title, subtitle, children }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  let user = {};
  try { user = JSON.parse(sessionStorage.getItem("fleetUser") || "{}"); } catch {}

  const logout = async () => {
    try { await authFetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch {}
    sessionStorage.removeItem("fleetUser"); sessionStorage.removeItem("fleetToken");
    navigate("/login", { replace: true });
  };

  const nav = [
    ["/driver", "Overview", LayoutDashboard],
    ["/driver/vehicle", "My Vehicle", Car],
    ["/driver/trips", "My Trips", Activity],
    ["/driver/history", "Trip History", ClipboardList],
    ["/driver/issues", "Vehicle Issues", Wrench],
    ["/driver/records", "Expenses & Vehicle History", Receipt],
    ["/driver/profile", "My Profile", UserCircle],
  ];

  return (
    <div className="driver-shell">
      <aside className={`driver-sidebar ${open ? "open" : ""}`}>
        <div className="driver-brand"><div className="driver-brand-icon"><Car size={21} /></div><span>Fleet<span>Flow</span></span></div>
        <div className="driver-user"><div className="driver-avatar">{(user.fullName || "D").charAt(0).toUpperCase()}</div><div><strong>{user.fullName || "Driver"}</strong><span>Driver</span></div></div>
        <nav className="driver-nav">
          {nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/driver"} onClick={() => setOpen(false)} className={({ isActive }) => `driver-nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{label}</span></NavLink>)}
        </nav>
        <button className="driver-logout" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>
      {open && <button className="driver-overlay" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>}
      <main className="driver-main">
        <header className="driver-header">
          <button className="driver-menu" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div><p>DRIVER</p><h1>{title}</h1><span>{subtitle}</span></div>
          <NotificationBell />
          <div className="driver-header-user">{user.fullName || "Driver"}</div>
        </header>
        <div className="driver-content">{children}</div>
      </main>
    </div>
  );
}
