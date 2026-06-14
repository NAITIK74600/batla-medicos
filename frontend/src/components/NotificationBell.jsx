import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, BellRing, X, Check, CheckCheck, Package, Truck, ShoppingBag, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMyNotifications, getAdminNotifications, markNotifRead, markAllNotifsRead, deleteNotif } from '../api/notifications';

const TYPE_ICONS = {
  order_placed:     Package,
  order_confirmed:  Package,
  order_dispatched: Truck,
  order_delivered:  CheckCheck,
  order_cancelled:  X,
  low_stock:        AlertTriangle,
  new_review:       Check,
  general:          Bell,
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell({ adminMode = false }) {
  const [open, setOpen]     = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notifPerm, setNotifPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const dropRef = useRef(null);
  const prevUnreadRef = useRef(0);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  }, []);

  const fetchNotifs = async () => {
    try {
      setLoading(true);
      const { data } = adminMode
        ? await getAdminNotifications({ limit: 20 })
        : await getMyNotifications({ limit: 20 });
      const incoming = data.notifications || [];
      const newUnread = data.unread || 0;
      setNotifs(incoming);
      setUnread(newUnread);

      // Show browser notification for any newly arrived unread items
      if (newUnread > prevUnreadRef.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        // Find the first unread notification to show
        const first = incoming.find(n => !n.is_read && !n.isRead);
        if (first) {
          new Notification(first.title || 'Batla Medicos', { body: first.message || '', icon: '/favicon.ico' });
        }
      }
      prevUnreadRef.current = newUnread;
    } catch {
      // silent — bell is non-critical
    } finally {
      setLoading(false);
    }
  };

  // Sync permission state if changed externally
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifPerm(Notification.permission);
    }
  }, [open]);

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30000); // poll every 30s
    return () => clearInterval(id);
  }, [adminMode]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkRead = async (id) => {
    try {
      await markNotifRead(id);
      setNotifs(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnread(u => Math.max(0, u - 1));
    } catch {}
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotifsRead();
      setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
    } catch {}
  };

  const handleDelete = async (id) => {
    try {
      await deleteNotif(id);
      const n = notifs.find(n => n._id === id);
      setNotifs(prev => prev.filter(n => n._id !== id));
      if (n && !n.isRead) setUnread(u => Math.max(0, u - 1));
    } catch {}
  };

  return (
    <div className="notif-bell" ref={dropRef}>
      <button
        className="notif-bell__trigger"
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifs(); }}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && <span className="notif-bell__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown__header">
            <span>Notifications {unread > 0 && <em>({unread} new)</em>}</span>
            {unread > 0 && (
              <button className="notif-dropdown__mark-all" onClick={handleMarkAll} title="Mark all read">
                <CheckCheck size={14} /> All read
              </button>
            )}
          </div>

          {notifPerm !== 'granted' && (
            <button
              className="notif-perm-btn"
              onClick={requestPermission}
            >
              <BellRing size={15} />
              {notifPerm === 'denied'
                ? 'Notifications blocked — allow in browser settings'
                : 'Enable browser notifications'}
            </button>
          )}

          <div className="notif-dropdown__list">
            {loading && notifs.length === 0 && <p className="notif-dropdown__empty">Loading…</p>}
            {!loading && notifs.length === 0 && <p className="notif-dropdown__empty">No notifications yet.</p>}
            {notifs.map(n => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              return (
                <div
                  key={n._id}
                  className={`notif-item${n.isRead ? '' : ' notif-item--unread'}`}
                  onClick={() => !n.isRead && handleMarkRead(n._id)}
                >
                  <div className="notif-item__icon"><Icon size={16} /></div>
                  <div className="notif-item__body">
                    <p className="notif-item__title">{n.title}</p>
                    <p className="notif-item__msg">{n.message}</p>
                    <span className="notif-item__time">{timeAgo(n.createdAt)}</span>
                  </div>
                  <button className="notif-item__del" onClick={(e) => { e.stopPropagation(); handleDelete(n._id); }} title="Dismiss">
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {!adminMode && (
            <div className="notif-dropdown__footer">
              <Link to="/notifications" onClick={() => setOpen(false)}>View all notifications</Link>
            </div>
          )}
          {adminMode && (
            <div className="notif-dropdown__footer">
              <Link to="/admin/notifications" onClick={() => setOpen(false)}>View all</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
