import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllOrders, updateOrderStatus, verifyDeliveryOtp, regenerateOtp, archiveOrders, exportOrders, resendReceipt } from '../../api/orders';
import { clearOrders } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';
import OrderStatusBadge from '../../components/OrderStatusBadge';
import toast from 'react-hot-toast';

const ALL_STATUSES = ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

// Only forward transitions are allowed — prevents accidental reversion
const VALID_NEXT = {
  placed:     ['placed', 'confirmed', 'cancelled'],
  confirmed:  ['confirmed', 'dispatched', 'cancelled'],
  dispatched: ['dispatched', 'delivered', 'cancelled'],
  delivered:  ['delivered'],
  cancelled:  ['cancelled'],
};

function fmt(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// OTP Verification Modal
function OtpModal({ order, onClose, onVerified }) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const handleVerify = async () => {
    if (otp.length !== 6) { toast.error('Enter a 6-digit OTP.'); return; }
    setBusy(true);
    try {
      await verifyDeliveryOtp(order._id, otp);
      toast.success('OTP verified! Order marked as delivered. ✅');
      onVerified();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      const { data } = await regenerateOtp(order._id);
      toast.success(`New OTP sent to customer: ${data.otp}`);
    } catch {
      toast.error('Failed to regenerate OTP.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <button className="modal-box__close" onClick={onClose}>✕</button>
        <h3 style={{ marginBottom: 6 }}>🔑 Verify Delivery OTP</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: 18 }}>
          Order <strong>BM-{order._id.slice(-8).toUpperCase()}</strong> — {order.user?.name || order.user?.email}
        </p>

        {/* Customer location if shared */}
        {order.customerLocation?.lat && (
          <div className="otp-modal__location">
            <span>📍</span>
            <div>
              <strong>Customer Location</strong>
              <p>{order.customerLocation.address || `${order.customerLocation.lat}, ${order.customerLocation.lng}`}</p>
              <a
                href={`https://www.google.com/maps?q=${order.customerLocation.lat},${order.customerLocation.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--outline"
                style={{ fontSize: '0.78rem', padding: '4px 12px', marginTop: 6, display: 'inline-block' }}
              >
                Open in Google Maps →
              </a>
            </div>
          </div>
        )}

        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>
          Enter 6-digit OTP from customer
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
          placeholder="______"
          style={{
            fontSize: '2rem', letterSpacing: '0.5em', textAlign: 'center',
            width: '100%', padding: '10px', border: '2px solid var(--gray-300)',
            borderRadius: 10, outline: 'none', marginBottom: 16,
          }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn--primary"
            style={{ flex: 1 }}
            onClick={handleVerify}
            disabled={busy || otp.length !== 6}
          >
            {busy ? 'Verifying…' : '✅ Verify & Deliver'}
          </button>
          <button
            className="btn btn--outline"
            onClick={handleRegenerate}
            disabled={busy}
            title="Send new OTP to customer"
          >
            🔄 New OTP
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const { isSuperAdmin } = useAuth();
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpOrder, setOtpOrder] = useState(null);
  const [archiveModal, setArchiveModal] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearModal, setClearModal] = useState(false);
  const [clearPass, setClearPass] = useState('');
  const [clearing, setClearing] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (showArchived)  params.archived = '1';
      const { data } = await getAllOrders(params);
      setOrders(data.orders || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [page, statusFilter, showArchived]);

  const handleStatusChange = async (orderId, status, currentStatus) => {
    if (status === currentStatus) return;
    try {
      const { data } = await updateOrderStatus(orderId, status);
      if (status === 'dispatched' && data.otp) {
        toast.success(`Order dispatched! OTP sent to customer: ${data.otp}`, { duration: 8000 });
      } else {
        toast.success('Order status updated.');
      }
      fetchOrders();
    } catch {
      toast.error('Failed to update status.');
    }
  };

  const handleArchive = async (period) => {
    setArchiving(true);
    try {
      const { data } = await archiveOrders(period);
      toast.success(`${data.archived} order${data.archived !== 1 ? 's' : ''} archived.`);
      setArchiveModal(false);
      fetchOrders();
    } catch {
      toast.error('Archive failed.');
    } finally {
      setArchiving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (showArchived)  params.archived = '1';
      const res = await exportOrders(params);
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `orders-backup-${new Date().toISOString().slice(0,10)}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handleResendReceipt = async (orderId) => {
    try {
      const { data } = await resendReceipt(orderId);
      toast.success(data.message);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to resend receipt.');
    }
  };

  const handleClearOrders = async () => {
    if (!clearPass) { toast.error('Enter your password.'); return; }
    setClearing(true);
    try {
      const { data } = await clearOrders(clearPass);
      toast.success(data.message);
      setOrders([]);
      setTotal(0);
      setPages(1);
      setPage(1);
      setClearModal(false);
      setClearPass('');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to clear orders.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="admin-page">
      {/* Clear All Orders Modal */}
      {clearModal && (
        <div className="modal-backdrop" onClick={() => { setClearModal(false); setClearPass(''); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <button className="modal-box__close" onClick={() => { setClearModal(false); setClearPass(''); }}>✕</button>
            <h3 style={{ marginBottom: 8 }}>⚠️ Clear All Orders</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginBottom: 16, lineHeight: 1.5 }}>
              This will <strong>permanently delete all orders</strong> from the database. This cannot be undone.
              Enter your superadmin password to confirm.
            </p>
            <input
              type="password"
              placeholder="Your password"
              value={clearPass}
              onChange={e => setClearPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClearOrders()}
              autoFocus
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', marginBottom: 14, fontSize: '0.9rem' }}
            />
            <button
              className="btn btn--primary"
              style={{ width: '100%', background: '#C0392B', borderColor: '#C0392B' }}
              onClick={handleClearOrders}
              disabled={clearing}
            >
              {clearing ? 'Clearing…' : '🗑️ Delete All Orders'}
            </button>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {archiveModal && (
        <div className="modal-backdrop" onClick={() => setArchiveModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="modal-box__close" onClick={() => setArchiveModal(false)}>✕</button>
            <h3 style={{ marginBottom: 8 }}>🗄️ Archive Old Orders</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginBottom: 20, lineHeight: 1.5 }}>
              Archives completed/cancelled orders — they remain saved in the database
              and can be viewed via the "Archived" toggle. Choose a retention period:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn--outline"
                disabled={archiving}
                onClick={() => handleArchive('7d')}
              >
                📦 Archive orders older than 7 days
              </button>
              <button
                className="btn btn--outline"
                disabled={archiving}
                onClick={() => handleArchive('30d')}
              >
                📦 Archive orders older than 30 days
              </button>
              <button
                className="btn btn--primary"
                style={{ background: '#C0392B', borderColor: '#C0392B' }}
                disabled={archiving}
                onClick={() => handleArchive('all')}
              >
                ⚠️ Archive ALL delivered &amp; cancelled orders
              </button>
            </div>
            {archiving && <p style={{ marginTop: 14, textAlign: 'center', fontSize: '0.85rem', color: 'var(--gray-400)' }}>Archiving…</p>}
          </div>
        </div>
      )}

      {otpOrder && (
        <OtpModal
          order={otpOrder}
          onClose={() => setOtpOrder(null)}
          onVerified={() => { setOtpOrder(null); fetchOrders(); }}
        />
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{showArchived ? '🗄️ Archived Orders' : 'Orders'}</h1>
          {!showArchived && total > 0 && <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--gray-400)' }}>{total} active order{total !== 1 ? 's' : ''}</p>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {/* Archived toggle */}
          <button
            className={`btn ${showArchived ? 'btn--primary' : 'btn--outline'}`}
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            onClick={() => { setShowArchived(v => !v); setPage(1); }}
          >
            {showArchived ? '📋 Active Orders' : '🗄️ Archived'}
          </button>

          {/* Export */}
          <button
            className="btn btn--outline"
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : '⬇️ Export Excel'}
          </button>

          {/* Archive */}
          {!showArchived && (
            <button
              className="btn btn--outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px', borderColor: 'var(--primary)', color: 'var(--primary)' }}
              onClick={() => setArchiveModal(true)}
            >
              🗄️ Archive Orders
            </button>
          )}

          {/* Clear All — superadmin only */}
          {isSuperAdmin && (
            <button
              className="btn btn--outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px', borderColor: '#C0392B', color: '#C0392B' }}
              onClick={() => setClearModal(true)}
            >
              🗑️ Clear All
            </button>
          )}

          {/* Status filter */}
          <div className="admin-toolbar" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginRight: 8 }}>Status:</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="spinner" style={{ padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <p>No orders found{statusFilter ? ` with status "${statusFilter}"` : ''}.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Date</th>
                <th>Update</th>
                <th>OTP / Deliver</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o._id}>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem' }}>
                      BM-{o._id.slice(-8).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{o.user?.name || '—'}</span>
                    {o.user?.phone && <><br /><small style={{ color: 'var(--gray-400)' }}>{o.user.phone}</small></>}
                    {o.user?.email && <><br /><small style={{ color: 'var(--gray-400)' }}>{o.user.email}</small></>}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.82rem', color: 'var(--gray-600)' }}>
                      {o.items.length} item{o.items.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>₹{o.total?.toFixed(2)}</td>
                  <td>
                    <span style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>
                      {o.payment?.method === 'cod' ? 'COD' : 'Online'}
                    </span>
                    <br />
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: o.payment?.status === 'paid' ? 'var(--green)' : 'var(--primary)',
                    }}>
                      {o.payment?.status?.toUpperCase()}
                    </span>
                  </td>
                  <td><OrderStatusBadge status={o.status} />
                    {o.deliveryType === 'takeaway' && (
                      <div style={{ fontSize: '0.7rem', marginTop: 4, background: '#EFF6FF', color: '#2563EB', borderRadius: 4, padding: '2px 7px', display: 'inline-block', fontWeight: 700 }}>
                        🏪 Pickup{o.takeawaySlot ? ` · ${o.takeawaySlot}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>
                    {fmt(o.createdAt)}
                  </td>
                  <td>
                    <select
                      value={o.status}
                      onChange={e => handleStatusChange(o._id, e.target.value, o.status)}
                      disabled={o.status === 'delivered' || o.status === 'cancelled'}
                      style={{ fontSize: '0.8rem' }}
                    >
                      {(VALID_NEXT[o.status] || ALL_STATUSES).map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {o.status === 'dispatched' && !o.otpVerified ? (
                      <button
                        className="btn btn--primary"
                        style={{ fontSize: '0.75rem', padding: '5px 12px', whiteSpace: 'nowrap' }}
                        onClick={() => setOtpOrder(o)}
                      >
                        🔑 Verify OTP
                      </button>
                    ) : o.otpVerified ? (
                      <span style={{ fontSize: '0.78rem', color: 'var(--green)', fontWeight: 700 }}>✅ Verified</span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--gray-300)' }}>—</span>
                    )}
                    {o.customerLocation?.lat && (
                      <a
                        href={`https://www.google.com/maps?q=${o.customerLocation.lat},${o.customerLocation.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', fontSize: '0.72rem', marginTop: 4, color: 'var(--primary)' }}
                      >
                        📍 Customer Location
                      </a>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn--outline"
                      style={{ fontSize: '0.73rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
                      onClick={() => handleResendReceipt(o._id)}
                      title="Re-send receipt email to customer"
                    >
                      📧 Resend
                    </button>
                    <br />
                    <Link
                      to={`/orders/${o._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--outline"
                      style={{ fontSize: '0.73rem', padding: '4px 10px', whiteSpace: 'nowrap', marginTop: 4, display: 'inline-block' }}
                    >
                      🧾 Receipt
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
