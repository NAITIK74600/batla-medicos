import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  registerDeliveryBoy, getDeliveryProfile, toggleAvailability,
  updateLocation, getDeliveryOrders, getDeliveryHistory,
  pickupOrder, deliveryVerifyOtp
} from '../api/delivery';
import toast from 'react-hot-toast';
import { getGeoPosition, GEO_ERROR_MESSAGES } from '../utils/geo';
import {
  Truck, MapPin, Package, CheckCircle, Clock, AlertCircle,
  Power, PowerOff, Navigation, History, ChevronRight, Shield,
  Phone, MessageCircle
} from 'lucide-react';
import SEO from '../components/SEO';

// ── Registration Form ─────────────────────────────────────────────────────────
function RegisterForm({ onRegistered }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ phone: '', vehicleType: 'bike', vehicleNo: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await registerDeliveryBoy(form);
      toast.success('Application submitted! Admin will review.');
      onRegistered();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="delivery-register">
      <div className="delivery-register__hero">
        <Truck size={48} strokeWidth={1.5} />
        <h2>Become a Delivery Partner</h2>
        <p>Join Batla Medicos and deliver medicines to customers in your area</p>
      </div>

      <form className="delivery-register__form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Name</label>
          <input type="text" value={user?.name || ''} disabled style={{ opacity: 0.7 }} />
        </div>

        <div className="form-group">
          <label>Phone Number</label>
          <input type="tel" maxLength={10} placeholder="10-digit mobile"
            value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} />
        </div>

        <div className="form-group">
          <label>Vehicle Type</label>
          <div className="vehicle-type-grid">
            {['bike', 'scooter', 'bicycle', 'walking'].map(v => (
              <label key={v} className={`vehicle-card${form.vehicleType === v ? ' active' : ''}`}>
                <input type="radio" name="vehicleType" value={v}
                  checked={form.vehicleType === v}
                  onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))}
                  style={{ display: 'none' }} />
                <span className="vehicle-card__icon">
                  {v === 'bike' ? '🏍️' : v === 'scooter' ? '🛵' : v === 'bicycle' ? '🚲' : '🚶'}
                </span>
                <span className="vehicle-card__label">{v.charAt(0).toUpperCase() + v.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Vehicle Number</label>
          <input type="text" placeholder="e.g. DL-01-AB-1234" maxLength={20}
            value={form.vehicleNo} onChange={e => setForm(f => ({ ...f, vehicleNo: e.target.value }))} />
        </div>

        <button className="btn btn--primary btn--full" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Apply as Delivery Partner'}
        </button>
      </form>
    </div>
  );
}

// ── OTP Verification Modal ────────────────────────────────────────────────────
function DeliveryOtpModal({ order, onClose, onVerified }) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const handleVerify = async () => {
    if (otp.length !== 6) { toast.error('Enter 6-digit OTP'); return; }
    setBusy(true);
    try {
      await deliveryVerifyOtp(order._id, otp);
      toast.success('Delivered successfully! ✅');
      onVerified();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Verification failed.');
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <button className="modal-box__close" onClick={onClose}>✕</button>
        <h3>🔑 Verify Delivery OTP</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', margin: '8px 0 16px' }}>
          Order <strong>BM-{order._id.slice(-8).toUpperCase()}</strong> — {order.user?.name}
        </p>

        {order.customerLocation?.lat && (
          <a href={`https://www.google.com/maps?q=${order.customerLocation.lat},${order.customerLocation.lng}`}
            target="_blank" rel="noopener noreferrer"
            className="delivery-location-link">
            <MapPin size={14} /> Open Customer Location
          </a>
        )}

        <input type="text" inputMode="numeric" maxLength={6} value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
          placeholder="Enter OTP" autoFocus
          style={{ fontSize: '1.8rem', letterSpacing: '0.5em', textAlign: 'center', width: '100%',
            padding: '10px', border: '2px solid var(--gray-300)', borderRadius: 10, marginBottom: 16 }} />
        <button className="btn btn--primary btn--full" onClick={handleVerify} disabled={busy || otp.length !== 6}>
          {busy ? 'Verifying…' : '✅ Confirm Delivery'}
        </button>
      </div>
    </div>
  );
}

// ── Main Delivery Panel ───────────────────────────────────────────────────────
export default function DeliveryPanel() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [histPage, setHistPage] = useState(1);
  const [histPages, setHistPages] = useState(1);
  const [tab, setTab] = useState('active'); // 'active' | 'history'
  const [otpOrder, setOtpOrder] = useState(null);
  const [toggling, setToggling] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await getDeliveryProfile();
      setProfile(data.deliveryBoy);
    } catch {
      setProfile(null);
    } finally { setLoading(false); }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await getDeliveryOrders();
      setOrders(data.orders);
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await getDeliveryHistory(histPage);
      setHistory(data.orders);
      setHistPages(data.pages);
    } catch {}
  }, [histPage]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { if (profile?.status === 'approved') fetchOrders(); }, [profile, fetchOrders]);
  useEffect(() => { if (tab === 'history' && profile?.status === 'approved') fetchHistory(); }, [tab, fetchHistory, profile]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const { data } = await toggleAvailability(!profile.isAvailable);
      setProfile(data.deliveryBoy);
      toast.success(data.message);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed.');
    } finally { setToggling(false); }
  };

  const handleShareLocation = async () => {
    const { position, error } = await getGeoPosition({ timeout: 15000 });
    if (error) { toast.error(GEO_ERROR_MESSAGES[error]); return; }
    try {
      const { latitude: lat, longitude: lng } = position.coords;
      await updateLocation(lat, lng);
      toast.success('Location updated!');
    } catch { toast.error('Failed to update location.'); }
  };

  const handlePickup = async (orderId) => {
    try {
      const { data } = await pickupOrder(orderId);
      toast.success(`Order picked up! OTP: ${data.otp}`, { duration: 8000 });
      fetchOrders();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Pickup failed.');
    }
  };

  if (loading) return <div className="container" style={{ padding: '60px 0', textAlign: 'center' }}>Loading…</div>;

  // Not registered yet — show registration form
  if (!profile) {
    return (
      <main className="container" style={{ maxWidth: 600, padding: '30px 16px' }}>
        <RegisterForm onRegistered={fetchProfile} />
      </main>
    );
  }

  // Pending / Rejected / Suspended
  if (profile.status !== 'approved') {
    return (
      <main className="container" style={{ maxWidth: 500, padding: '60px 16px', textAlign: 'center' }}>
        <div className="delivery-status-card">
          {profile.status === 'pending' && (
            <>
              <Clock size={48} style={{ color: '#e67e22' }} />
              <h2>Application Under Review</h2>
              <p>Your delivery partner application is being reviewed by the admin. You'll be notified once approved.</p>
            </>
          )}
          {profile.status === 'rejected' && (
            <>
              <AlertCircle size={48} style={{ color: '#C0392B' }} />
              <h2>Application Rejected</h2>
              <p>Your application was not approved. Please contact support for more information.</p>
            </>
          )}
          {profile.status === 'suspended' && (
            <>
              <Shield size={48} style={{ color: '#C0392B' }} />
              <h2>Account Suspended</h2>
              <p>Your delivery partner account has been suspended. Please contact admin.</p>
            </>
          )}
        </div>
      </main>
    );
  }

  // ── Approved — Show full dashboard ──────────────────────────────────────────
  return (
    <main className="delivery-panel container">
      <SEO title="Delivery Dashboard" description="Batla Medicos delivery partner dashboard." path="/delivery" noIndex />
      {otpOrder && (
        <DeliveryOtpModal order={otpOrder} onClose={() => setOtpOrder(null)}
          onVerified={() => { setOtpOrder(null); fetchOrders(); }} />
      )}

      {/* Header */}
      <div className="delivery-panel__header">
        <div>
          <h1>Delivery Dashboard</h1>
          <p className="delivery-panel__greeting">Hi, {user?.name || 'Partner'} 👋</p>
        </div>
        <div className="delivery-panel__controls">
          <button className="btn-share-loc" onClick={handleShareLocation}>
            <Navigation size={14} /> Share Location
          </button>
          <button
            className={`delivery-toggle ${profile.isAvailable ? 'delivery-toggle--online' : 'delivery-toggle--offline'}`}
            onClick={handleToggle} disabled={toggling}
          >
            {profile.isAvailable ? <><Power size={16} /> Online</> : <><PowerOff size={16} /> Offline</>}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="delivery-stats">
        <div className="delivery-stat-card">
          <Package size={20} />
          <div>
            <span className="delivery-stat-card__value">{orders.length}</span>
            <span className="delivery-stat-card__label">Active Orders</span>
          </div>
        </div>
        <div className="delivery-stat-card">
          <CheckCircle size={20} />
          <div>
            <span className="delivery-stat-card__value">{profile.totalDeliveries}</span>
            <span className="delivery-stat-card__label">Completed</span>
          </div>
        </div>
        <div className="delivery-stat-card">
          <div className={`delivery-status-dot ${profile.isAvailable ? 'online' : 'offline'}`} />
          <div>
            <span className="delivery-stat-card__value">{profile.isAvailable ? 'Online' : 'Offline'}</span>
            <span className="delivery-stat-card__label">Status</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="delivery-tabs">
        <button className={`delivery-tab${tab === 'active' ? ' active' : ''}`} onClick={() => setTab('active')}>
          <Package size={15} /> Active Orders
        </button>
        <button className={`delivery-tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
          <History size={15} /> Delivery History
        </button>
      </div>

      {/* Active Orders */}
      {tab === 'active' && (
        <div className="delivery-orders">
          {orders.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <Truck size={40} style={{ opacity: 0.3 }} />
              <p>No active deliveries right now.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)' }}>Stay online to receive new assignments.</p>
            </div>
          ) : orders.map(order => (
            <div key={order._id} className="delivery-order-card">
              <div className="delivery-order-card__header">
                <span className="delivery-order-card__id">
                  BM-{order._id.slice(-8).toUpperCase()}
                </span>
                <span className={`badge badge--${order.status === 'confirmed' ? 'info' : order.status === 'dispatched' ? 'warning' : 'default'}`}>
                  {order.status.toUpperCase()}
                </span>
              </div>

              <div className="delivery-order-card__body">
                <div className="delivery-order-card__customer">
                  <strong>{order.user?.name || 'Customer'}</strong>
                  {order.user?.phone && <span>{order.user.phone}</span>}
                  {(order.user?.phone || order.address?.phone) && (
                    <div className="contact-btns">
                      <a href={`tel:${order.user?.phone || order.address?.phone}`} className="contact-btn contact-btn--call">
                        <Phone size={14} /> Call
                      </a>
                      <a href={`https://wa.me/91${(order.user?.phone || order.address?.phone).replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer" className="contact-btn contact-btn--wa">
                        <MessageCircle size={14} /> WhatsApp
                      </a>
                    </div>
                  )}
                </div>

                <div className="delivery-order-card__address">
                  <MapPin size={14} />
                  <span>
                    {order.address?.line1}{order.address?.line2 ? `, ${order.address.line2}` : ''}, {order.address?.city} - {order.address?.pincode}
                  </span>
                </div>

                <div className="delivery-order-card__items">
                  {order.items?.map((item, i) => (
                    <span key={i}>{item.name} x{item.qty}</span>
                  ))}
                </div>

                <div className="delivery-order-card__total">
                  Total: <strong>₹{order.total?.toFixed(2)}</strong>
                  <span className="payment-badge">{order.payment?.method === 'cod' ? 'COD' : 'PAID'}</span>
                </div>
              </div>

              <div className="delivery-order-card__actions">
                {order.status === 'confirmed' && (
                  <button className="btn btn--primary" onClick={() => handlePickup(order._id)}>
                    <Truck size={15} /> Pick Up Order
                  </button>
                )}
                {order.status === 'dispatched' && (
                  <button className="btn btn--primary" onClick={() => setOtpOrder(order)}>
                    🔑 Verify OTP & Deliver
                  </button>
                )}
                {order.customerLocation?.lat && (
                  <a href={`https://www.google.com/maps?q=${order.customerLocation.lat},${order.customerLocation.lng}`}
                    target="_blank" rel="noopener noreferrer" className="btn btn--outline">
                    <Navigation size={14} /> Navigate <ChevronRight size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delivery History */}
      {tab === 'history' && (
        <div className="delivery-orders">
          {history.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <History size={40} style={{ opacity: 0.3 }} />
              <p>No delivery history yet.</p>
            </div>
          ) : history.map(order => (
            <div key={order._id} className="delivery-order-card delivery-order-card--completed">
              <div className="delivery-order-card__header">
                <span className="delivery-order-card__id">BM-{order._id.slice(-8).toUpperCase()}</span>
                <span className="badge badge--success">DELIVERED</span>
              </div>
              <div className="delivery-order-card__body">
                <strong>{order.user?.name}</strong> — ₹{order.total?.toFixed(2)}
                <span style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginLeft: 8 }}>
                  {new Date(order.updatedAt).toLocaleDateString('en-IN')}
                </span>
              </div>
            </div>
          ))}
          {histPages > 1 && (
            <div className="pagination">
              <button disabled={histPage <= 1} onClick={() => setHistPage(p => p - 1)}>← Prev</button>
              <span>Page {histPage} of {histPages}</span>
              <button disabled={histPage >= histPages} onClick={() => setHistPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
