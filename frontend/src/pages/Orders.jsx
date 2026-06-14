import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMyOrders, reorder } from '../api/orders';
import OrderStatusBadge from '../components/OrderStatusBadge';
import { useCart } from '../context/CartContext';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import SEO from '../components/SEO';

const STATUS_FILTERS = [
  { value: '', label: 'All Orders' },
  { value: 'placed', label: 'Placed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

function fmt(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');
  const [reordering, setReordering] = useState(null);
  const { addItem } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    getMyOrders()
      .then(r => setOrders(r.data.orders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter ? orders.filter(o => o.status === filter) : orders;

  const handleReorder = async (e, orderId) => {
    e.preventDefault();
    setReordering(orderId);
    try {
      const { data } = await reorder(orderId);
      const available = data.items.filter(i => i.available);
      const unavailable = data.items.filter(i => !i.available);
      if (available.length === 0) { toast.error('All items from this order are out of stock.'); return; }
      available.forEach(item => addItem({ _id: item.productId, name: item.name, price: item.price, images: item.image ? [item.image] : [], slug: item.slug, requiresPrescription: item.requiresPrescription, stock: item.stock }, item.qty));
      if (unavailable.length > 0) toast(`${available.length} item(s) added. ${unavailable.length} out of stock.`, { icon: '⚠️' });
      else toast.success(`${available.length} item(s) added to cart!`);
      navigate('/checkout');
    } catch { toast.error('Failed to reorder.'); }
    finally { setReordering(null); }
  };

  if (loading) return (
    <div className="spinner" style={{ padding: '80px 0', textAlign: 'center' }}>
      Loading orders…
    </div>
  );

  return (
    <main className="orders-page container">
      <SEO title="My Orders" description="Track and manage your Batla Medicos orders." path="/orders" noIndex />
      <div className="orders-page__header">
        <h1>My Orders</h1>
        {orders.length > 0 && (
          <span className="orders-page__count">
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {orders.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={filter === f.value ? 'btn btn--primary' : 'btn btn--outline'}
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>
            {orders.length === 0 ? '🛒' : '🔍'}
          </div>
          <h3 style={{ color: 'var(--gray-700)', marginBottom: 8 }}>
            {orders.length === 0 ? 'No orders yet' : 'No orders match this filter'}
          </h3>
          <p style={{ color: 'var(--gray-400)', marginBottom: 20 }}>
            {orders.length === 0
              ? 'Your order history will appear here once you place an order.'
              : 'Try selecting a different status filter.'}
          </p>
          {orders.length === 0 && (
            <Link to="/products" className="btn btn--primary">Browse Products</Link>
          )}
        </div>
      ) : (
        <div className="order-history-list">
          {filtered.map(order => {
            const invoiceNo = `BM-${order._id.slice(-8).toUpperCase()}`;
            const itemNames = order.items.slice(0, 3).map(i => i.name);
            const extras    = order.items.length - 3;
            return (
              <Link key={order._id} to={`/orders/${order._id}`} className="order-history-card">
                <div className="order-history-card__top">
                  <span className="order-history-card__id">{invoiceNo}</span>
                  <span className="order-history-card__date">{fmt(order.createdAt)}</span>
                  <span className="order-history-card__total">₹{order.total.toFixed(2)}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="order-history-card__body">
                  <div className="order-history-card__items">
                    {itemNames.map((name, i) => (
                      <span key={i} className="order-history-card__item-chip">{name}</span>
                    ))}
                    {extras > 0 && (
                      <span className="order-history-card__item-chip">+{extras} more</span>
                    )}
                  </div>
                  <div className="order-history-card__footer">
                    <span className="order-history-card__payment">
                      {(!order.razorpayOrderId && order.paymentStatus !== 'paid') || order.paymentStatus === 'cod'
                        ? 'Cash on Delivery'
                        : order.paymentStatus === 'paytm'
                          ? 'Paytm'
                          : 'Razorpay'} · {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        className="btn btn--outline btn--sm"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        disabled={reordering === order._id}
                        onClick={(e) => handleReorder(e, order._id)}>
                        <RefreshCw size={12} /> {reordering === order._id ? 'Adding…' : 'Reorder'}
                      </button>
                      <span className="order-history-card__cta">View Receipt →</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
