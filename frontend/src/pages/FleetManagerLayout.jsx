import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Activity, Car, LayoutDashboard, LogOut, Menu, Users, X, ClipboardList } from "lucide-react";
import { API_URL, authFetch } from "../services/api";
import "./FleetManager.css";

export default function FleetManagerLayout({ title, subtitle, children }) {
  const navigate = useNavigate(); const [open, setOpen] = useState(false);
  let user = {}; try { user = JSON.parse(sessionStorage.getItem("fleetUser") || "{}"); } catch {}
  const logout = async () => { try { await authFetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch {} sessionStorage.removeItem("fleetUser"); sessionStorage.removeItem("fleetToken"); navigate("/login", { replace: true }); };
  const nav = [["/fleet-manager", "Overview", LayoutDashboard], ["/fleet-manager/vehicles", "Vehicles", Car], ["/fleet-manager/drivers", "Drivers", Users], ["/fleet-manager/assignments", "Assignments", ClipboardList], ["/fleet-manager/trips", "Trips", Activity]];
  return <div className="fm-shell">
    <aside className={`fm-sidebar ${open ? "open" : ""}`}>
      <div className="fm-brand"><div className="fm-brand-icon"><Car size={22}/></div><span>Fleet<span>Flow</span></span></div>
      <div className="fm-user"><div className="fm-avatar">{(user.fullName || "F").charAt(0).toUpperCase()}</div><div><strong>{user.fullName || "Fleet Manager"}</strong><span>Fleet Manager</span></div></div>
      <nav className="fm-nav">{nav.map(([to,label,Icon]) => <NavLink key={to} to={to} end={to === "/fleet-manager"} onClick={() => setOpen(false)} className={({isActive}) => `fm-nav-item ${isActive ? "active" : ""}`}><Icon size={18}/><span>{label}</span></NavLink>)}</nav>
      <button className="fm-logout" onClick={logout}><LogOut size={18}/> Logout</button>
    </aside>
    {open && <button className="fm-overlay" onClick={() => setOpen(false)} aria-label="Close menu"/>}
    <main className="fm-main"><header className="fm-header"><button className="fm-menu" onClick={() => setOpen(true)}><Menu size={21}/></button><div><p>FLEET MANAGER</p><h1>{title}</h1><span>{subtitle}</span></div><div className="fm-header-user">{user.fullName || "Fleet Manager"}</div></header><div className="fm-content">{children}</div></main>
  </div>;
}
