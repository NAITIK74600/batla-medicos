import { useEffect, useState } from 'react';
import { getAllCoupons, createCoupon, updateCoupon, deleteCoupon } from '../../api/coupons';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Ticket, Gift, Truck, Percent, Tag } from 'lucide-react';

const DISCOUNT_TYPES = [
  { value: 'percentage', label: 'Percentage Off', icon: '🏷️' },
  { value: 'flat', label: 'Flat Discount', icon: '💰' },
  { value: 'free_delivery', label: 'Free Delivery', icon: '🚚' },
];

const EMPTY = {
  code: '', description: '', discountType: 'percentage', discountValue: 10,
  maxDiscount: '', minOrderAmount: '', usageLimit: '', perUserLimit: 1,
  firstOrderOnly: false, startDate: '', endDate: '', isActive: true,
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await getAllCoupons();
      setCoupons(data.coupons || []);
    } catch (err) {
      console.error('Coupon load error:', err);
      toast.error(err.response?.data?.message || 'Failed to load coupons.');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : 0,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perUserLimit: Number(form.perUserLimit) || 1,
        discountValue: Number(form.discountValue) || 0,
      };
      if (editing) {
        await updateCoupon(editing, payload);
        toast.success('Coupon updated.');
      } else {
        await createCoupon(payload);
        toast.success('Coupon created!');
      }
      resetForm();
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this coupon?')) return;
    try {
      await deleteCoupon(id);
      toast.success('Coupon deleted.');
      fetch();
    } catch { toast.error('Delete failed.'); }
  };

  const resetForm = () => { setEditing(null); setForm(EMPTY); };

  const startEdit = (c) => {
    setEditing(c._id);
    setForm({
      code: c.code,
      description: c.description || '',
      discountType: c.discountType,
      discountValue: c.discountValue || 0,
      maxDiscount: c.maxDiscount || '',
      minOrderAmount: c.minOrderAmount || '',
      usageLimit: c.usageLimit || '',
      perUserLimit: c.perUserLimit || 1,
      firstOrderOnly: c.firstOrderOnly || false,
      startDate: c.startDate?.slice(0, 10) || '',
      endDate: c.endDate?.slice(0, 10) || '',
      isActive: c.isActive,
    });
  };

  const discountLabel = (c) => {
    if (c.discountType === 'percentage') return `${c.discountValue}% off${c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ''}`;
    if (c.discountType === 'flat') return `₹${c.discountValue} off`;
    return 'Free Delivery';
  };

  return (
    <div className="admin-page">
      <h1><Ticket size={22} style={{ marginRight: 8 }} />Coupons & Vouchers</h1>

      {/* ── Create / Edit Form ─────────────────────────────────────────────── */}
      <form className="admin-form" onSubmit={handleSubmit}>
        <h2>{editing ? 'Edit Coupon' : 'Create New Coupon'}</h2>

        <div className="form-row">
          <div className="form-group">
            <label>Coupon Code *</label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. WELCOME50" required maxLength={30} disabled={!!editing} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. 50% off on first order" maxLength={200} />
          </div>
        </div>

        <div className="form-group">
          <label>Discount Type *</label>
          <div className="discount-type-grid">
            {DISCOUNT_TYPES.map(t => (
              <label key={t.value} className={`discount-type-card${form.discountType === t.value ? ' active' : ''}`}>
                <input type="radio" name="discountType" value={t.value}
                  checked={form.discountType === t.value}
                  onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))}
                  style={{ display: 'none' }} />
                <span className="discount-type-card__icon">{t.icon}</span>
                <span className="discount-type-card__label">{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        {form.discountType !== 'free_delivery' && (
          <div className="form-row">
            <div className="form-group">
              <label>{form.discountType === 'percentage' ? 'Discount %' : 'Discount ₹'} *</label>
              <input type="number" min={0} value={form.discountValue}
                onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} required />
            </div>
            {form.discountType === 'percentage' && (
              <div className="form-group">
                <label>Max Discount (₹)</label>
                <input type="number" min={0} value={form.maxDiscount}
                  onChange={e => setForm(f => ({ ...f, maxDiscount: e.target.value }))}
                  placeholder="e.g. 200" />
              </div>
            )}
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Minimum Order (₹)</label>
            <input type="number" min={0} value={form.minOrderAmount}
              onChange={e => setForm(f => ({ ...f, minOrderAmount: e.target.value }))}
              placeholder="0 = no minimum" />
          </div>
          <div className="form-group">
            <label>Per User Limit</label>
            <input type="number" min={1} value={form.perUserLimit}
              onChange={e => setForm(f => ({ ...f, perUserLimit: e.target.value }))} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Total Usage Limit</label>
            <input type="number" min={1} value={form.usageLimit}
              onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value }))}
              placeholder="Unlimited" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Start Date *</label>
            <input type="date" value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>End Date *</label>
            <input type="date" value={form.endDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} required />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', margin: '10px 0' }}>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.firstOrderOnly}
              onChange={e => setForm(f => ({ ...f, firstOrderOnly: e.target.checked }))} />
            First Order Only
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
            Active
          </label>
        </div>

        {/* Preview */}
        {form.code && (
          <div className="coupon-preview">
            <div className="coupon-preview__code">
              <Ticket size={16} />
              <strong>{form.code}</strong>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
              {form.discountType === 'percentage' && `${form.discountValue}% off`}
              {form.discountType === 'flat' && `₹${form.discountValue} off`}
              {form.discountType === 'free_delivery' && 'Free Delivery'}
              {form.minOrderAmount > 0 && ` on orders above ₹${form.minOrderAmount}`}
              {form.firstOrderOnly && ' • First order only'}
            </p>
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn--primary" type="submit">
            {editing ? 'Update Coupon' : <><Plus size={16} /> Create Coupon</>}
          </button>
          {editing && <button type="button" className="btn btn--outline" onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      {/* ── Coupon List ────────────────────────────────────────────────────── */}
      <h2 style={{ marginTop: 30 }}>All Coupons</h2>
      {loading ? (
        <p style={{ textAlign: 'center', padding: '30px 0' }}>Loading…</p>
      ) : coupons.length === 0 ? (
        <div className="empty-state"><p>No coupons yet. Create one above.</p></div>
      ) : (
        <div className="coupon-grid">
          {coupons.map(c => (
            <div key={c._id} className={`coupon-card ${!c.isActive ? 'coupon-card--inactive' : ''}`}>
              <div className="coupon-card__header">
                <div className="coupon-card__code">
                  <Ticket size={16} /> {c.code}
                </div>
                <span className={`badge ${c.isActive ? 'badge--success' : 'badge--default'}`}>
                  {c.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="coupon-card__body">
                <p className="coupon-card__discount">
                  {c.discountType === 'free_delivery' && <><Truck size={15} /> Free Delivery</>}
                  {c.discountType === 'percentage' && <><Percent size={15} /> {c.discountValue}% off</>}
                  {c.discountType === 'flat' && <><Tag size={15} /> ₹{c.discountValue} off</>}
                </p>
                {c.description && <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{c.description}</p>}
                <div className="coupon-card__meta">
                  {c.minOrderAmount > 0 && <span>Min ₹{c.minOrderAmount}</span>}
                  {c.maxDiscount && <span>Max ₹{c.maxDiscount}</span>}
                  {c.firstOrderOnly && <span><Gift size={11} /> 1st order</span>}
                  <span>Used: {c.usedCount}{c.usageLimit ? `/${c.usageLimit}` : ''}</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                  {c.startDate?.slice(0, 10)} → {c.endDate?.slice(0, 10)}
                </p>
              </div>

              <div className="coupon-card__actions">
                <button className="btn btn--sm btn--outline" onClick={() => startEdit(c)}><Pencil size={14} /></button>
                <button className="btn btn--sm btn--danger" onClick={() => handleDelete(c._id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
