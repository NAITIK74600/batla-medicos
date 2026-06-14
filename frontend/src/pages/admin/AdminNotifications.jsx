import { useState, useEffect } from 'react';
import { Bell, X, CheckCheck, Package, Truck, AlertTriangle, Check } from 'lucide-react';
import { getAdminNotifications, markNotifRead, markAllNotifsRead, deleteNotif } from '../../api/notifications';
import toast from 'react-hot-toast';

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
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminNotifications() {
  const [notifs, setNotifs]   = useState([]);
  const [unread, setUnread]   = useState(0);
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);

  const fetch = async (p = 1) => {
    try {
      setLoading(true);
      const { data } = await getAdminNotifications({ page: p, limit: 30 });
      setNotifs(p === 1 ? (data.notifications || []) : prev => [...prev, ...(data.notifications || [])]);
      setUnread(data.unread || 0);
      setPage(data.page || 1);
      setPages(data.pages || 1);
    } catch {
      toast.error('Could not load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(1); }, []);

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
      toast.success('All marked as read.');
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
    <div className="admin-page">
      <div className="admin-page__header">
        <h1><Bell size={20} /> Shop Notifications {unread > 0 && <span className="notif-page__badge">{unread} new</span>}</h1>
        {unread > 0 && (
          <button className="btn btn--outline" onClick={handleMarkAll}>
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>

      {loading && notifs.length === 0 && <p>Loading…</p>}
      {!loading && notifs.length === 0 && (
        <div className="empty-state">
          <Bell size={48} style={{ opacity: 0.2 }} />
          <p>No notifications yet. New orders will appear here automatically.</p>
        </div>
      )}

      <div className="notif-list">
        {notifs.map(n => {
          const Icon = TYPE_ICONS[n.type] || Bell;
          return (
            <div
              key={n._id}
              className={`notif-card${n.isRead ? '' : ' notif-card--unread'}`}
              onClick={() => !n.isRead && handleMarkRead(n._id)}
            >
              <div className={`notif-card__icon notif-card__icon--${n.type}`}><Icon size={20} /></div>
              <div className="notif-card__body">
                <p className="notif-card__title">{n.title}</p>
                <p className="notif-card__msg">{n.message}</p>
                <span className="notif-card__time">{timeAgo(n.createdAt)}</span>
              </div>
              <button className="notif-card__del" onClick={(e) => { e.stopPropagation(); handleDelete(n._id); }} title="Dismiss">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {page < pages && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="btn btn--outline" onClick={() => fetch(page + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
