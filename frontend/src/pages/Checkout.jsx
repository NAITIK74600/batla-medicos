import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Upload, Loader, MapPin, Clock, House, Store, Share2, Navigation, Ticket, X, Truck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { createOrder, verifyPayment } from '../api/orders';
import { getGeoPosition, GEO_ERROR_MESSAGES } from '../utils/geo';
import { validateCoupon } from '../api/coupons';
import api from '../api/axios';
import { uploadPrescription } from '../api/upload';
import { trackPurchase } from '../utils/analytics';

/* 🎵 Cheerful 3-note order-placed jingle (Web Audio API — no file needed) */
function playOrderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [
      { freq: 523.25, start: 0,    dur: 0.15 },  // C5
      { freq: 659.25, start: 0.14, dur: 0.15 },  // E5
      { freq: 783.99, start: 0.28, dur: 0.28 },  // G5
    ];
    notes.forEach(({ freq, start, dur }) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch { /* silent fail if blocked */ }
}

const DELIVERY_CHARGE = 29;
const FREE_DELIVERY_THRESHOLD = 499;

const SLOTS = [
  '9:00 AM - 11:00 AM',
  '11:00 AM - 1:00 PM',
  '2:00 PM - 4:00 PM',
  '4:00 PM - 6:00 PM',
  '6:00 PM - 9:00 PM',
  '9:00 PM - 11:45 PM',
];

const checkoutSchema = z.object({
  deliveryType: z.enum(['delivery', 'takeaway']),
  line1:        z.string().optional(),
  line2:        z.string().optional(),
  city:         z.string().optional(),
  pincode:      z.string().optional(),
  phone:        z.string().regex(/^\d{10}$/, '10-digit phone required'),
  takeawaySlot: z.string().optional(),
  method:       z.enum(['razorpay', 'paytm', 'cod']),
});

export default function Checkout() {
  const { items, hasRxItems, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rxFile, setRxFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState(null); // { discount, freeDelivery, code, message }
  const [couponLoading, setCouponLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, setError, formState: { errors } } = useForm({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { deliveryType: 'delivery', method: 'cod' },
  });

  const deliveryType  = watch('deliveryType');
  const selectedSlot  = watch('takeawaySlot');
  const isRazorpayEnabled = Boolean(import.meta.env.VITE_RAZORPAY_KEY_ID && import.meta.env.VITE_RAZORPAY_KEY_ID !== 'your_key_id');
  const isPaytmEnabled = import.meta.env.VITE_ENABLE_PAYTM === 'true';

  // Delivery charge calculation
  const isFreeDelivery = deliveryType === 'takeaway' || totalPrice >= FREE_DELIVERY_THRESHOLD || couponResult?.freeDelivery;
  const deliveryCharge = isFreeDelivery ? 0 : DELIVERY_CHARGE;
  const couponDiscount = couponResult?.discount || 0;
  const finalTotal = totalPrice - couponDiscount + deliveryCharge;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const { data } = await validateCoupon(couponCode.trim(), totalPrice);
      setCouponResult(data);
      toast.success(data.message);
    } catch (err) {
      setCouponResult(null);
      toast.error(err.response?.data?.message || 'Invalid coupon.');
    } finally { setCouponLoading(false); }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setCouponResult(null);
  };

  const handleAutoFillLocation = async () => {
    setLocLoading(true);
    const { position, error } = await getGeoPosition();
    if (error) {
      setLocLoading(false);
      toast.error(GEO_ERROR_MESSAGES[error]);
      return;
    }
    const { latitude: lat, longitude: lng } = position.coords;
    try {
      const { data } = await api.get('/geocode/reverse', { params: { lat, lng } });
      const { line1, line2, city, pincode } = data;
      if (!line1 && !city) throw new Error('Empty address returned');
      if (line1)                              setValue('line1',   line1,   { shouldValidate: true });
      if (line2)                              setValue('line2',   line2);
      if (city)                               setValue('city',    city,    { shouldValidate: true });
      if (pincode && /^\d{6}$/.test(pincode)) setValue('pincode', pincode, { shouldValidate: true });
      toast.success('✅ Address auto-filled from your location!');
    } catch (e) {
      console.error('Reverse geocode failed', e);
      toast.error(e.response?.data?.message || 'Could not fetch address. Please fill in your address manually.');
    } finally { setLocLoading(false); }
  };

  const handleShareLiveLocation = async () => {
    const { position, error } = await getGeoPosition({ timeout: 10000 });
    if (error) { toast.error(GEO_ERROR_MESSAGES[error]); return; }
    const { latitude: lat, longitude: lng } = position.coords;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const waMsg   = encodeURIComponent(`📍 My current location for delivery:\n${mapsUrl}`);
    const waUrl   = `https://wa.me/919990165925?text=${waMsg}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    toast.success('Opening WhatsApp to share your location with us!');
  };

  if (items.length === 0) {
    return <div className="container empty-state"><p>Your cart is empty.</p></div>;
  }

  const handlePlaceOrder = async (formData) => {
    // Conditional validation
    if (formData.deliveryType === 'delivery') {
      if (!formData.line1 || formData.line1.trim().length < 5) {
        setError('line1', { type: 'manual', message: 'Address required (min 5 chars)' }); return;
      }
      if (!formData.city || formData.city.trim().length < 2) {
        setError('city', { type: 'manual', message: 'City required' }); return;
      }
      if (!formData.pincode || !/^\d{6}$/.test(formData.pincode)) {
        setError('pincode', { type: 'manual', message: '6-digit pincode required' }); return;
      }
    }
    if (formData.deliveryType === 'takeaway' && !formData.takeawaySlot) {
      setError('takeawaySlot', { type: 'manual', message: 'Please select a pickup slot' }); return;
    }
    if (hasRxItems && !rxFile) {
      toast.error('Please upload a prescription for Rx items.'); return;
    }

    setPlacing(true);
    try {
      let prescriptionUrl = null;
      if (hasRxItems && rxFile) {
        setUploading(true);
        const up = await uploadPrescription(rxFile);
        prescriptionUrl = up.data.url;
        setUploading(false);
      }

      const orderPayload = {
        items: items.map(i => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty, image: i.image || '' })),
        deliveryType: formData.deliveryType,
        address: formData.deliveryType === 'delivery'
          ? { line1: formData.line1, line2: formData.line2 || '', city: formData.city, pincode: formData.pincode, phone: formData.phone }
          : { phone: formData.phone, line1: 'Store Pickup - Batla Medicos', city: 'New Delhi', pincode: '110025' },
        ...(formData.deliveryType === 'takeaway' ? { takeawaySlot: formData.takeawaySlot } : {}),
        paymentMethod: formData.method === 'razorpay' ? 'online' : formData.method,
        discount: couponDiscount,
        deliveryCharge: deliveryCharge,
        ...(prescriptionUrl ? { prescriptionUrl } : {}),
        ...(couponResult?.code ? { couponCode: couponResult.code } : {}),
      };

      const { data } = await createOrder(orderPayload);

      if (formData.method === 'razorpay') {
        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: Math.round(finalTotal * 100),
          currency: 'INR',
          name: 'Batla Medicos',
          description: 'Medicine Order',
          order_id: data.razorpayOrderId,
          prefill: { name: user?.name, email: user?.email, contact: formData.phone },
          theme: { color: '#D32F2F' },
          handler: async (response) => {
            try {
              await verifyPayment({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                orderId:             data.order._id,
              });
              trackPurchase({ _id: data.order._id, items, totalPrice: finalTotal, method: 'razorpay' });
              playOrderSound();
              clearCart();
              navigate(`/orders/${data.order._id}?placed=1`);
            } catch { toast.error('Payment verification failed. Contact support.'); }
          },
          modal: { ondismiss: () => toast('Payment cancelled.') },
        };
        new window.Razorpay(options).open();
      } else if (formData.method === 'paytm') {
        toast('Paytm checkout wiring will be enabled once merchant API credentials are added.');
      } else {
        trackPurchase({ _id: data.order._id, items, totalPrice: finalTotal, method: formData.method });
        playOrderSound();
        clearCart();
        navigate(`/orders/${data.order._id}?placed=1`);
      }
    } catch (err) {
      const d = err.response?.data;
      if (Array.isArray(d?.errors) && d.errors.length) {
        // Express-validator returns { errors: [{ msg, path }] }
        d.errors.slice(0, 3).forEach(e => toast.error(e.msg || e.message || 'Validation error'));
      } else {
        toast.error(d?.message || 'Could not place order. Please check your details and try again.');
      }
    } finally {
      setPlacing(false);
      setUploading(false);
    }
  };

  return (
    <main className="checkout container">
      <h1>Checkout</h1>
      <div className="checkout__layout">

        <div className="checkout__summary">
          <h2>Order Summary</h2>
          {items.map(item => (
            <div key={item.productId} className="checkout__item">
              <span>{item.name} x {item.qty}</span>
              <span>Rs { (item.price * item.qty).toFixed(2) }</span>
            </div>
          ))}

          <div className="checkout__subtotal">
            <span>Subtotal</span>
            <span>₹{totalPrice.toFixed(2)}</span>
          </div>

          {/* Delivery Charge */}
          <div className="checkout__charge-row">
            <span><Truck size={14} /> Delivery</span>
            {isFreeDelivery ? (
              <span className="checkout__free-badge">FREE</span>
            ) : (
              <span>₹{deliveryCharge}</span>
            )}
          </div>
          {!isFreeDelivery && totalPrice < FREE_DELIVERY_THRESHOLD && (
            <p className="checkout__free-hint">
              Add ₹{(FREE_DELIVERY_THRESHOLD - totalPrice).toFixed(0)} more for free delivery!
            </p>
          )}

          {/* Coupon Discount */}
          {couponDiscount > 0 && (
            <div className="checkout__charge-row checkout__charge-row--green">
              <span><Ticket size={14} /> Coupon ({couponResult.code})</span>
              <span>-₹{couponDiscount}</span>
            </div>
          )}

          <div className="checkout__total">
            <strong>Total</strong>
            <strong>₹{finalTotal.toFixed(2)}</strong>
          </div>

          {/* Coupon Input */}
          <div className="coupon-input-section">
            <h3><Ticket size={16} /> Have a coupon?</h3>
            {couponResult ? (
              <div className="coupon-applied">
                <span className="coupon-applied__code"><Ticket size={14} /> {couponResult.code}</span>
                <span className="coupon-applied__msg">{couponResult.message}</span>
                <button className="coupon-applied__remove" onClick={handleRemoveCoupon}><X size={14} /></button>
              </div>
            ) : (
              <div className="coupon-input-row">
                <input type="text" placeholder="Enter coupon code" value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())} maxLength={30} />
                <button className="btn btn--outline" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()}>
                  {couponLoading ? 'Checking…' : 'Apply'}
                </button>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(handlePlaceOrder)} noValidate className="checkout__form">

          {/* Delivery Type */}
          <h2>Delivery Type</h2>
          <div className="delivery-type-group">
            <label className={`delivery-type-card${deliveryType === 'delivery' ? ' active' : ''}`}>
              <input {...register('deliveryType')} type="radio" value="delivery" style={{ display: 'none' }} />
              <span className="delivery-type-card__icon"><House size={28} /></span>
              <span className="delivery-type-card__label">Home Delivery</span>
              <span className="delivery-type-card__sub">Delivered to your door</span>
            </label>
            <label className={`delivery-type-card${deliveryType === 'takeaway' ? ' active' : ''}`}>
              <input {...register('deliveryType')} type="radio" value="takeaway" style={{ display: 'none' }} />
              <span className="delivery-type-card__icon"><Store size={28} /></span>
              <span className="delivery-type-card__label">Store Pickup</span>
              <span className="delivery-type-card__sub">Pick up from Batla House</span>
            </label>
          </div>

          {/* Slot picker for store pickup */}
          {deliveryType === 'takeaway' && (
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Select Pickup Slot *</label>
              <div className="slot-grid">
                {SLOTS.map(slot => (
                  <label key={slot} className={`slot-card${selectedSlot === slot ? ' active' : ''}`}>
                    <input {...register('takeawaySlot')} type="radio" value={slot} style={{ display: 'none' }} />
                    <Clock size={13} /> {slot}
                  </label>
                ))}
              </div>
              {errors.takeawaySlot && <span className="form-error">{errors.takeawaySlot.message}</span>}
              <div className="slot-store-info">
                <MapPin size={14} /> <strong>Batla Medicos</strong> - F 41/2 Nafees Road, Batla House, Jamia Nagar, New Delhi-110025
              </div>
            </div>
          )}

          {/* Address - home delivery only */}
          {deliveryType === 'delivery' && (
            <>
              <div className="checkout__form-heading">
                <h2>Delivery Address</h2>
                <div className="location-btn-group">
                  <button type="button" className="btn-use-location" onClick={handleAutoFillLocation} disabled={locLoading}>
                    {locLoading
                      ? <><Loader size={14} className="spin" /> Detecting&hellip;</>
                      : <><Navigation size={14} /> Auto-fill Address</>
                    }
                  </button>
                  <button type="button" className="btn-share-location" onClick={handleShareLiveLocation}>
                    <Share2 size={14} /> Share on WhatsApp
                  </button>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Address Line 1 *</label>
                  <input {...register('line1')} type="text" placeholder="House no., Street, Road" />
                  {errors.line1 && <span className="form-error">{errors.line1.message}</span>}
                </div>
                <div className="form-group">
                  <label>Address Line 2</label>
                  <input {...register('line2')} type="text" placeholder="Colony, Area (optional)" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>City *</label>
                  <input {...register('city')} type="text" />
                  {errors.city && <span className="form-error">{errors.city.message}</span>}
                </div>
                <div className="form-group">
                  <label>Pincode *</label>
                  <input {...register('pincode')} type="text" maxLength={6} />
                  {errors.pincode && <span className="form-error">{errors.pincode.message}</span>}
                </div>
              </div>
            </>
          )}

          {/* Phone always shown */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Phone *</label>
            <input {...register('phone')} type="tel" maxLength={10} placeholder="10-digit mobile number" />
            {errors.phone && <span className="form-error">{errors.phone.message}</span>}
          </div>

          {/* Prescription Upload */}
          {hasRxItems && (
            <div className="form-group rx-upload">
              <label><Upload size={16} /> Prescription * (Required for Rx items)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                     onChange={e => setRxFile(e.target.files[0])} />
              {rxFile && <span className="rx-upload__filename">{rxFile.name}</span>}
              <small>Accepted: JPEG, PNG, WebP, PDF. Max 5 MB.</small>
            </div>
          )}

          <h2>Payment Method</h2>
          <div className="form-group">
            {isRazorpayEnabled && (
              <label className="radio-label">
                <input {...register('method')} type="radio" value="razorpay" />
                Online Payment (UPI / Card / NetBanking)
              </label>
            )}
            <label className="radio-label" style={{ opacity: isPaytmEnabled ? 1 : 0.65 }}>
              <input {...register('method')} type="radio" value="paytm" disabled={!isPaytmEnabled} />
              Paytm {isPaytmEnabled ? '(Wallet / UPI / Cards)' : '(Coming soon)'}
            </label>
            <label className="radio-label">
              <input {...register('method')} type="radio" value="cod" />
              Cash on Delivery
            </label>
          </div>

          <button className="btn btn--primary btn--full" type="submit" disabled={placing || uploading}>
            {uploading ? <><Loader size={16} className="spin" /> Uploading...</> :
             placing   ? <><Loader size={16} className="spin" /> Placing Order...</> :
             'Place Order'}
          </button>
        </form>
      </div>
    </main>
  );
}
