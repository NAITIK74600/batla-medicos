import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { getOrderById, downloadReceipt, resendReceipt, shareLocation } from '../api/orders';
import { getGeoPosition, GEO_ERROR_MESSAGES } from '../utils/geo';
import OrderStatusBadge from '../components/OrderStatusBadge';
import toast from 'react-hot-toast';

const STATUS_STEPS = [
  { key: 'placed',     label: 'Order Placed',  icon: '🛒' },
  { key: 'confirmed',  label: 'Confirmed',     icon: '✅' },
  { key: 'dispatched', label: 'Dispatched',    icon: '🚚' },
  { key: 'delivered',  label: 'Delivered',     icon: '📦' },
];

function fmt(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function OrderDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const justPlaced = searchParams.get('placed') === '1';
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locSharing, setLocSharing] = useState(false);
  const [locShared, setLocShared] = useState(false);

  const handleShareLocation = async () => {
    setLocSharing(true);
    const { position, error } = await getGeoPosition({ timeout: 10000, maximumAge: 60000 });
    if (error) {
      setLocSharing(false);
      toast.error(GEO_ERROR_MESSAGES[error]);
      return;
    }
    try {
      const { latitude: lat, longitude: lng } = position.coords;
      let address = '';
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const d = await r.json();
        address = d.display_name || '';
      } catch { /* non-critical */ }
      await shareLocation(id, { lat, lng, address });
      setLocShared(true);
      toast.success('Location shared with delivery team! 📍');
    } catch {
      toast.error('Could not share location. Try again.');
    } finally {
      setLocSharing(false);
    }
  };

  const handleDownloadReceipt = async () => {
    try {
      const res = await downloadReceipt(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download receipt. Try again.');
    }
  };

  const [resending, setResending] = useState(false);
  const handleResendReceipt = async () => {
    setResending(true);
    try {
      await resendReceipt(id);
      toast.success('Receipt sent to your email!');
    } catch {
      toast.error('Could not resend receipt. Try again.');
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    getOrderById(id)
      .then(r => setOrder(r.data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="spinner" style={{ padding: '80px 0', textAlign: 'center' }}>Loading order…</div>;
  if (!order) return (
    <main className="container" style={{ padding: '60px 0', textAlign: 'center' }}>
      <p style={{ color: 'var(--gray-500)' }}>Order not found.</p>
      <Link to="/orders" className="btn btn--primary" style={{ marginTop: 16 }}>Back to Orders</Link>
    </main>
  );

  const invoiceNo = `BM-${order._id.slice(-8).toUpperCase()}`;
  const cancelled  = order.status === 'cancelled';
  const stepIdx    = cancelled ? -1 : STATUS_STEPS.findIndex(s => s.key === order.status);

  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <main className="order-detail-page container">
      {/* Back + actions bar */}
      <div className="no-print">
        <Link to="/orders" className="order-detail-page__back">
          ← Back to My Orders
        </Link>
        <div className="order-detail-page__actions">
          <button className="btn btn--primary" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
          <button className="btn btn--outline" onClick={handleDownloadReceipt}>⬇️ Download Receipt</button>
          <button className="btn btn--outline" onClick={handleResendReceipt} disabled={resending}>
            {resending ? 'Sending…' : '📧 Email Receipt'}
          </button>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {/* Order success banner */}
      {justPlaced && (
        <div className="order-success-banner no-print">
          <div className="order-success-banner__icon">🎉</div>
          <div>
            <h3>Order Placed Successfully!</h3>
            <p>We've received your order. Our team will confirm it shortly.</p>
            <div className="order-success-banner__actions">
              <Link to="/orders" className="btn btn--outline">View All Orders</Link>
              <Link to="/products" className="btn btn--primary">Continue Shopping →</Link>
            </div>
          </div>
        </div>
      )}

      {/* OTP Banner — shown when dispatched and not yet verified */}
      {order.status === 'dispatched' && !order.otpVerified && (
        <div className="delivery-otp-banner no-print">
          <div className="delivery-otp-banner__icon">🔑</div>
          <div className="delivery-otp-banner__body">
            <h3>Your Delivery OTP</h3>
            <p>Show this code to the delivery person when they arrive</p>
            {order.deliveryOtpPlain
              ? <div className="delivery-otp-banner__code">{order.deliveryOtpPlain}</div>
              : <div className="delivery-otp-banner__note">OTP was sent via notification. Check your notifications 🔔</div>
            }
            <div className="delivery-otp-banner__note">Do not share this OTP with anyone else</div>
          </div>
        </div>
      )}

      {/* Location Share Banner — shown when dispatched */}
      {order.status === 'dispatched' && !cancelled && (
        <div className="location-share-banner no-print">
          <div className="location-share-banner__text">
            <span>📍</span>
            <div>
              <strong>Help delivery reach faster</strong>
              <p>{locShared
                ? 'Location shared! Delivery team can see your location.'
                : 'Share your live location with the delivery person.'}</p>
            </div>
          </div>
          {!locShared && (
            <button
              className="btn btn--primary"
              onClick={handleShareLocation}
              disabled={locSharing}
            >
              {locSharing ? '📡 Getting Location…' : '📍 Share My Location'}
            </button>
          )}
          {locShared && <span className="location-share-banner__done">✅ Shared</span>}
        </div>
      )}

      {/* Delivery Agent Contact — shown when delivery boy is assigned */}
      {order.deliveryBoy && ['confirmed', 'dispatched'].includes(order.status) && !cancelled && (() => {
        const dbPhone = order.deliveryBoy.phone || order.deliveryBoy.user?.phone;
        const dbName = order.deliveryBoy.user?.name || 'Delivery Partner';
        return (
          <div className="delivery-contact-banner no-print">
            <div className="delivery-contact-banner__info">
              <span>🚚</span>
              <div>
                <strong>{dbName}</strong>
                <p>Your delivery partner</p>
              </div>
            </div>
            {dbPhone && (
              <div className="contact-btns">
                <a href={`tel:${dbPhone}`} className="contact-btn contact-btn--call">
                  📞 Call
                </a>
                <a href={`https://wa.me/91${dbPhone.replace(/\D/g, '')}`}
                  target="_blank" rel="noopener noreferrer" className="contact-btn contact-btn--wa">
                  💬 WhatsApp
                </a>
              </div>
            )}
          </div>
        );
      })()}

      {/* Status timeline */}
      {!cancelled && (
        <div className="order-timeline no-print">
          {STATUS_STEPS.map((step, i) => {
            const done   = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div
                key={step.key}
                className={`order-timeline__step${done ? ' done' : ''}${active ? ' active' : ''}`}
              >
                <div className="order-timeline__dot">{done ? '✓' : step.icon}</div>
                <div className="order-timeline__label">{step.label}</div>
              </div>
            );
          })}
        </div>
      )}
      {cancelled && (
        <div className="order-timeline no-print">
          <div className="order-timeline__step cancelled">
            <div className="order-timeline__dot">✕</div>
            <div className="order-timeline__label">Cancelled</div>
          </div>
        </div>
      )}

      {/* RECEIPT CARD */}
      <div className="receipt-card printable-receipt">

        {/* Company header */}
        <div className="receipt-card__header">
          <div className="receipt-card__brand">
            <div className="receipt-card__logo">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="11" y="2" width="6" height="24" rx="2" fill="white"/>
                <rect x="2" y="11" width="24" height="6" rx="2" fill="white"/>
              </svg>
            </div>
            <div className="receipt-card__company">
              <h2>Batla Medicos</h2>
              <p>F 41/2 Nafees Road, Batla House, Jamia Nagar, New Delhi-110025</p>
              <p>Ph: +91 99901 65925</p>
            </div>
          </div>
          <div className="receipt-card__invoice-meta">
            <div className="inv-number">Invoice #{invoiceNo}</div>
            <div className="inv-date">Date: {fmt(order.createdAt)}</div>
            <div className="inv-badge">
              {order.paymentStatus === 'cod' || (!order.razorpayOrderId && order.paymentStatus !== 'paid')
                ? 'Cash on Delivery'
                : order.paymentStatus === 'paytm'
                  ? 'Paytm Payment'
                  : 'Razorpay Payment'}
            </div>
          </div>
        </div>

        {/* Billing + Shipping info */}
        <div className="receipt-card__info-row">
          <div className="receipt-card__info-cell">
            <h4>Bill To</h4>
            <p><strong>{order.user?.name || 'Customer'}</strong></p>
            {order.user?.email && <p>{order.user.email}</p>}
            {order.user?.phone && <p>📞 {order.user.phone}</p>}
          </div>
          <div className="receipt-card__info-cell">
            <h4>Deliver To</h4>
            <p><strong>{order.address.label || 'Home'}</strong></p>
            <p>
              {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ''}
            </p>
            <p>{order.address.city} – {order.address.pincode}</p>
            <p>📞 {order.address.phone}</p>
          </div>
        </div>

        {/* Items table */}
        <div className="receipt-items">
          <table>
            <thead>
              <tr>
                <th style={{ width: '50%' }}>Item</th>
                <th>Qty</th>
                <th>Rate (₹)</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="receipt-item__img no-print"
                        />
                      )}
                      <div>
                        <div className="receipt-item__name">{item.name}</div>
                        {item.requiresPrescription && (
                          <div className="receipt-item__rx">Rx Required</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{item.qty}</td>
                  <td>{item.price.toFixed(2)}</td>
                  <td>{(item.qty * item.price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="receipt-totals">
          <div className="receipt-totals__table">
            <div className="receipt-totals__row">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="receipt-totals__row savings">
              <span>Delivery</span>
              <span>FREE</span>
            </div>
            <div className="receipt-totals__row">
              <span>Payment Status</span>
              <span style={{
                fontWeight: 700,
                color: order.paymentStatus === 'paid' ? 'var(--green)' : 'var(--primary)'
              }}>
                {(order.paymentStatus || 'pending').toUpperCase()}
              </span>
            </div>
            <div className="receipt-totals__row final">
              <span>Grand Total</span>
              <span>₹{order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Prescription link */}
        {order.prescriptionUrl && (
          <div className="no-print" style={{ padding: '0 28px 16px' }}>
            <a
              href={order.prescriptionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--outline"
              style={{ fontSize: '0.85rem' }}
            >
              📄 View Prescription
            </a>
          </div>
        )}

        {/* Thank you footer */}
        <div className="receipt-thankyou">
          Thank you for shopping with Batla Medicos 💊
        </div>
        <div className="receipt-card__footer">
          <p>
            <strong>Batla Medicos</strong> · F 41/2 Nafees Road, Batla House, Jamia Nagar, New Delhi-110025
          </p>
          <p>This is a computer-generated invoice and does not require a physical signature.</p>
        </div>

      </div>
    </main>
  );
}