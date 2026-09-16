import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { apiRequest } from "../services/api";
import { getSocket } from "../services/socket";
import "./NotificationBell.css";

export default function NotificationBell({ className = "" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/api/notifications?limit=30");
      setItems(data.notifications || []);
      setUnread(Number(data.unreadCount || 0));
    } catch {  }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const socket = getSocket();
    const onNew = (notification) => {
      setItems((current) => [notification, ...current.filter((x) => x._id !== notification._id)].slice(0, 30));
      setUnread((count) => count + 1);
    };
    socket.on("notification:new", onNew);
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => { socket.off("notification:new", onNew); document.removeEventListener("mousedown", close); };
  }, []);

  const markRead = async (id) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" });
      setItems((current) => current.map((n) => n._id === id ? { ...n, isRead: true } : n));
      setUnread((count) => Math.max(0, count - 1));
    } catch {}
  };

  const markAll = async () => {
    try {
      await apiRequest("/api/notifications/read-all", { method: "PATCH" });
      setItems((current) => current.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch {}
  };

  const openNotification = async (notification) => {
    if (!notification.isRead) await markRead(notification._id);
    if (notification.link) window.location.href = notification.link;
    setOpen(false);
  };

  return (
    <div className={`notification-wrap ${className}`} ref={ref}>
      <button className="notification-button" onClick={() => { setOpen((v) => !v); if (!open) load(); }} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell size={19} />
        {unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <div className="notification-panel">
        <div className="notification-panel-head"><div><strong>Notifications</strong><small>{unread ? `${unread} unread` : "All caught up"}</small></div><button onClick={markAll} disabled={!unread} title="Mark all as read"><CheckCheck size={17} /></button></div>
        <div className="notification-list">
          {loading ? <div className="notification-empty">Loading notifications…</div> : items.length ? items.map((n) => (
            <button key={n._id} className={`notification-item ${n.isRead ? "read" : "unread"}`} onClick={() => openNotification(n)}>
              <span className={`notification-dot ${String(n.priority || "NORMAL").toLowerCase()}`} />
              <span className="notification-copy"><strong>{n.title}</strong><span>{n.message}</span><time>{new Date(n.createdAt).toLocaleString()}</time></span>
            </button>
          )) : <div className="notification-empty"><Bell size={24} />No notifications yet.</div>}
        </div>
      </div>}
    </div>
  );
}
