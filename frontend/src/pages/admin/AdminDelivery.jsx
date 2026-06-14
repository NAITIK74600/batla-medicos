import { useEffect, useState } from 'react';
import { getAllDeliveryBoys, updateDeliveryBoyStatus, getAvailableDeliveryBoys, assignOrderToDelivery } from '../../api/delivery';
import { getAllOrders } from '../../api/orders';
import toast from 'react-hot-toast';
import { Truck, UserCheck, UserX, Clock, CheckCircle, XCircle, MapPin, Package } from 'lucide-react';

const STATUS_LABELS = {
  pending: { label: 'Pending', color: '#e67e22', icon: Clock },
  approved: { label: 'Approved', color: '#27ae60', icon: UserCheck },
  rejected: { label: 'Rejected', color: '#C0392B', icon: UserX },
  suspended: { label: 'Suspended', color: '#7f8c8d', icon: XCircle },
};

function AssignModal({ onClose, onAssigned }) {
  const [orders, setOrders] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedDB, setSelectedDB] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    Promise.all([
      getAllOrders({ status: 'placed', limit: 50 }).then(r => {
        const placedOrders = r.data.orders || [];
        return getAllOrders({ status: 'confirmed', limit: 50 }).then(r2 => [...placedOrders, ...(r2.data.orders || [])]);
      }),
      getAvailableDeliveryBoys().then(r => r.data.deliveryBoys),
    ])
      .then(([o, db]) => { setOrders(o); setDeliveryBoys(db); })
      .catch(() => toast.error('Failed to load data.'))
      .finally(() => setLoading(false));
  }, []);

  const handleAssign = async () => {
    if (!selectedOrder || !selectedDB) { toast.error('Select both order and delivery partner.'); return; }
    setAssigning(true);
    try {
      await assignOrderToDelivery(selectedOrder, selectedDB);
      toast.success('Order assigned!');
      onAssigned();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Assignment failed.');
    } finally { setAssigning(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <button className="modal-box__close" onClick={onClose}>✕</button>
        <h3 style={{ marginBottom: 16 }}>📦 Assign Order to Delivery Partner</h3>

        {loading ? <p>Loading…</p> : (
          <>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Select Order</label>
              <select value={selectedOrder} onChange={e => setSelectedOrder(e.target.value)} style={{ width: '100%' }}>
                <option value="">— Choose an order —</option>
                {orders.map(o => (
                  <option key={o._id} value={o._id}>
                    BM-{o._id.slice(-8).toUpperCase()} — {o.user?.name || 'Customer'} — ₹{o.total?.toFixed(0)} ({o.status})
                  </option>
                ))}
              </select>
              {orders.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 4 }}>No pending/confirmed orders.</p>}
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Select Delivery Partner</label>
              <select value={selectedDB} onChange={e => setSelectedDB(e.target.value)} style={{ width: '100%' }}>
                <option value="">— Choose a partner —</option>
                {deliveryBoys.map(db => (
                  <option key={db._id} value={db._id}>
                    {db.user?.name} — {db.phone} — {db.totalDeliveries} deliveries
                  </option>
                ))}
              </select>
              {deliveryBoys.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 4 }}>No available delivery partners online.</p>}
            </div>

            <button className="btn btn--primary btn--full" onClick={handleAssign} disabled={assigning || !selectedOrder || !selectedDB}>
              {assigning ? 'Assigning…' : '✅ Assign Order'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminDelivery() {
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showAssign, setShowAssign] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await getAllDeliveryBoys(statusFilter);
      setDeliveryBoys(data.deliveryBoys || []);
    } catch (err) {
      console.error('Delivery load error:', err);
      toast.error(err.response?.data?.message || 'Failed to load delivery partners.');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const handleStatusChange = async (id, status) => {
    try {
      await updateDeliveryBoyStatus(id, status);
      toast.success(`Partner ${status}.`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed.');
    }
  };

  return (
    <div className="admin-page">
      {showAssign && <AssignModal onClose={() => setShowAssign(false)} onAssigned={() => { setShowAssign(false); fetchData(); }} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}><Truck size={22} style={{ marginRight: 8 }} />Delivery Partners</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn--primary" style={{ fontSize: '0.82rem' }} onClick={() => setShowAssign(true)}>
            <Package size={14} /> Assign Order
          </button>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ fontSize: '0.82rem' }}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="spinner" style={{ padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : deliveryBoys.length === 0 ? (
        <div className="empty-state">
          <Truck size={40} style={{ opacity: 0.3 }} />
          <p>No delivery partner applications{statusFilter ? ` with status "${statusFilter}"` : ''}.</p>
        </div>
      ) : (
        <div className="delivery-admin-grid">
          {deliveryBoys.map(db => {
            const s = STATUS_LABELS[db.status] || { label: db.status || 'Unknown', color: '#999', icon: Clock };
            return (
              <div key={db._id} className="delivery-admin-card">
                <div className="delivery-admin-card__header">
                  <div>
                    <h3 style={{ margin: 0 }}>{db.user?.name || '—'}</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', margin: '2px 0' }}>{db.user?.email}</p>
                  </div>
                  <span className="delivery-status-badge" style={{ background: s.color + '18', color: s.color, border: `1px solid ${s.color}40` }}>
                    {s.label}
                  </span>
                </div>

                <div className="delivery-admin-card__details">
                  <div><strong>Phone:</strong> {db.phone}</div>
                  <div><strong>Vehicle:</strong> {db.vehicleType} {db.vehicleNo ? `(${db.vehicleNo})` : ''}</div>
                  {db.aadharNo && <div><strong>Aadhar:</strong> {db.aadharNo}</div>}
                  <div><strong>Deliveries:</strong> {db.totalDeliveries}</div>
                  <div><strong>Active Orders:</strong> {db.activeOrders?.length || 0}</div>
                  <div>
                    <strong>Available:</strong>{' '}
                    <span style={{ color: db.isAvailable ? '#27ae60' : '#C0392B', fontWeight: 700 }}>
                      {db.isAvailable ? '🟢 Online' : '🔴 Offline'}
                    </span>
                  </div>
                  {db.lastLocation?.lat && (
                    <div>
                      <a href={`https://www.google.com/maps?q=${db.lastLocation.lat},${db.lastLocation.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                        <MapPin size={12} /> View Location
                      </a>
                    </div>
                  )}
                </div>

                <div className="delivery-admin-card__actions">
                  {db.status === 'pending' && (
                    <>
                      <button className="btn btn--primary btn--sm" onClick={() => handleStatusChange(db._id, 'approved')}>
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button className="btn btn--danger btn--sm" onClick={() => handleStatusChange(db._id, 'rejected')}>
                        <XCircle size={14} /> Reject
                      </button>
                    </>
                  )}
                  {db.status === 'approved' && (
                    <button className="btn btn--outline btn--sm" style={{ borderColor: '#e67e22', color: '#e67e22' }}
                      onClick={() => handleStatusChange(db._id, 'suspended')}>
                      Suspend
                    </button>
                  )}
                  {(db.status === 'suspended' || db.status === 'rejected') && (
                    <button className="btn btn--primary btn--sm" onClick={() => handleStatusChange(db._id, 'approved')}>
                      <CheckCircle size={14} /> Approve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
