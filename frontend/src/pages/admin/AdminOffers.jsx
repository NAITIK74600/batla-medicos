import { useEffect, useState } from 'react';
import { getAllOffers, createOffer, updateOffer, deleteOffer, duplicateOffer, getOfferStats, bulkToggleOffers } from '../../api/offers';
import { getCategories } from '../../api/categories';
import { uploadImage } from '../../api/upload';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ExternalLink, Copy, Eye, MousePointerClick, Tag, Truck, BarChart3, Clock, ArrowUp, ArrowDown, CheckSquare, Square, ToggleLeft, ToggleRight, Monitor, Store, Layers } from 'lucide-react';

const LINK_TYPES = [
  { value: 'products',      label: '🛒 All Products',         path: () => '/products' },
  { value: 'category',      label: '📂 Specific Category',    path: (cat) => `/products?category=${cat}` },
  { value: 'lab',           label: '🧪 Lab Tests',            path: () => '/lab' },
  { value: 'prescriptions', label: '📋 Upload Prescription',  path: () => '/prescriptions' },
  { value: 'custom',        label: '🔗 Custom URL',           path: (v) => v },
];

function parseLink(link) {
  if (!link || link === '/' || link === '/products') return { type: 'products', cat: '', custom: '' };
  if (link.startsWith('/products?category=')) return { type: 'category', cat: link.split('=')[1], custom: '' };
  if (link === '/lab') return { type: 'lab', cat: '', custom: '' };
  if (link === '/prescriptions') return { type: 'prescriptions', cat: '', custom: '' };
  return { type: 'custom', cat: '', custom: link };
}

function buildLink(type, cat, custom) {
  if (type === 'products')      return '/products';
  if (type === 'category')      return cat ? `/products?category=${cat}` : '/products';
  if (type === 'lab')           return '/lab';
  if (type === 'prescriptions') return '/prescriptions';
  return custom || '/products';
}

function isMongoId(v) {
  return /^[a-f\d]{24}$/i.test(String(v || ''));
}

const EMPTY = {
  title: '', description: '', imageUrl: '', startDate: '', endDate: '',
  isActive: true, freeDelivery: false, freeDeliveryMin: '',
  discountText: '', badgeColor: '#C0392B', priority: 0,
  isDealOfDay: false, displayOn: 'both',
};

const BADGE_COLORS = [
  { value: '#C0392B', label: 'Red' },
  { value: '#2563EB', label: 'Blue' },
  { value: '#059669', label: 'Green' },
  { value: '#D97706', label: 'Orange' },
  { value: '#7C3AED', label: 'Purple' },
  { value: '#DB2777', label: 'Pink' },
  { value: '#0891B2', label: 'Teal' },
  { value: '#111827', label: 'Black' },
];

export default function AdminOffers() {
  const [offers,      setOffers]      = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [form,        setForm]        = useState(EMPTY);
  const [linkType,    setLinkType]    = useState('products');
  const [linkCat,     setLinkCat]     = useState('');
  const [customLink,  setCustomLink]  = useState('');
  const [editing,     setEditing]     = useState(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [stats,       setStats]       = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filter,      setFilter]      = useState('all'); // all | active | expired | scheduled

  const loadOffers = () => {
    getAllOffers().then(r => setOffers(r.data.offers || [])).catch(() => {});
  };

  useEffect(() => {
    loadOffers();
    getCategories().then(r => setCategories(r.data.categories || r.data)).catch(() => {});
    getOfferStats().then(r => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (linkType !== 'category' || !linkCat || categories.length === 0 || isMongoId(linkCat)) return;
    const match = categories.find(c => c.slug === linkCat);
    if (match?._id) setLinkCat(match._id);
  }, [linkType, linkCat, categories]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImgUploading(true);
    try {
      const { data } = await uploadImage(file);
      setForm(f => ({ ...f, imageUrl: data.url }));
    } catch { toast.error('Image upload failed.'); }
    finally { setImgUploading(false); }
  };

  const computedLink = buildLink(linkType, linkCat, customLink);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        link: computedLink,
        freeDeliveryMin: form.freeDeliveryMin ? Number(form.freeDeliveryMin) : 0,
        ord: Number(form.priority) || 0,
        badge: form.isDealOfDay ? 'deal_of_day' : '',
        displayOn: form.displayOn || 'both',
      };
      if (editing) {
        await updateOffer(editing, payload);
        toast.success('Offer updated.');
      } else {
        await createOffer(payload);
        toast.success('Offer created.');
      }
      resetForm();
      loadOffers();
      getOfferStats().then(r => setStats(r.data)).catch(() => {});
    } catch (err) { toast.error(err.response?.data?.message || 'Failed.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this offer?')) return;
    try {
      await deleteOffer(id);
      toast.success('Offer deleted.');
      loadOffers();
      getOfferStats().then(r => setStats(r.data)).catch(() => {});
    } catch { toast.error('Delete failed.'); }
  };

  const handleDuplicate = async (id) => {
    try {
      await duplicateOffer(id);
      toast.success('Offer duplicated (inactive).');
      loadOffers();
    } catch { toast.error('Duplicate failed.'); }
  };

  const handleBulkToggle = async (active) => {
    if (!selectedIds.length) return;
    try {
      await bulkToggleOffers(selectedIds, active);
      toast.success(`${selectedIds.length} offers ${active ? 'activated' : 'deactivated'}.`);
      setSelectedIds([]);
      loadOffers();
      getOfferStats().then(r => setStats(r.data)).catch(() => {});
    } catch { toast.error('Bulk toggle failed.'); }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedIds.length === filteredOffers.length) setSelectedIds([]);
    else setSelectedIds(filteredOffers.map(o => o._id));
  };

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY);
    setLinkType('products');
    setLinkCat('');
    setCustomLink('');
  };

  const startEdit = (offer) => {
    setEditing(offer._id);
    const parsed = parseLink(offer.link);
    setForm({
      title: offer.title,
      description: offer.description || '',
      imageUrl: offer.imageUrl,
      startDate: offer.startDate?.slice(0, 10),
      endDate: offer.endDate?.slice(0, 10),
      isActive: offer.isActive,
      freeDelivery: offer.freeDelivery || false,
      freeDeliveryMin: offer.freeDeliveryMin || '',
      discountText: offer.discountText || '',
      badgeColor: offer.badgeColor || '#C0392B',
      priority: offer.priority || 0,
      isDealOfDay: offer.badge === 'deal_of_day',
      displayOn: offer.displayOn || 'both',
    });
    setLinkType(parsed.type);
    setLinkCat(parsed.cat);
    setCustomLink(parsed.custom);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const linkPreview = (link) => {
    const found = LINK_TYPES.find(t => {
      if (t.value === 'products') return link === '/products' || link === '/';
      if (t.value === 'category') return link.startsWith('/products?category=');
      if (t.value === 'lab') return link === '/lab';
      if (t.value === 'prescriptions') return link === '/prescriptions';
      return false;
    });
    if (found) return `${found.label.split(' ').slice(1).join(' ')} (${link})`;
    return link;
  };

  const now = new Date();
  const getOfferStatus = (o) => {
    if (!o.isActive) return 'inactive';
    if (new Date(o.endDate) < now) return 'expired';
    if (new Date(o.startDate) > now) return 'scheduled';
    return 'active';
  };

  const filteredOffers = offers.filter(o => {
    if (filter === 'all') return true;
    return getOfferStatus(o) === filter;
  });

  const getTimeLeft = (endDate) => {
    const diff = new Date(endDate) - now;
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hrs}h left`;
    return `${hrs}h left`;
  };

  return (
    <div className="admin-page">
      <h1>Offers &amp; Banners</h1>

      {/* ── Analytics Cards ── */}
      {stats && (
        <div className="offer-stats-grid">
          <div className="offer-stat-card">
            <div className="offer-stat-card__icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Tag size={20} /></div>
            <div><p className="offer-stat-card__value">{stats.total}</p><p className="offer-stat-card__label">Total Offers</p></div>
          </div>
          <div className="offer-stat-card">
            <div className="offer-stat-card__icon" style={{ background: '#dcfce7', color: '#166534' }}><ToggleRight size={20} /></div>
            <div><p className="offer-stat-card__value">{stats.active}</p><p className="offer-stat-card__label">Active Now</p></div>
          </div>
          <div className="offer-stat-card">
            <div className="offer-stat-card__icon" style={{ background: '#fef3c7', color: '#92400e' }}><Clock size={20} /></div>
            <div><p className="offer-stat-card__value">{stats.scheduled}</p><p className="offer-stat-card__label">Scheduled</p></div>
          </div>
          <div className="offer-stat-card">
            <div className="offer-stat-card__icon" style={{ background: '#f3e8ff', color: '#7c3aed' }}><Eye size={20} /></div>
            <div><p className="offer-stat-card__value">{(stats.totalViews || 0).toLocaleString()}</p><p className="offer-stat-card__label">Total Views</p></div>
          </div>
          <div className="offer-stat-card">
            <div className="offer-stat-card__icon" style={{ background: '#fce7f3', color: '#db2777' }}><MousePointerClick size={20} /></div>
            <div><p className="offer-stat-card__value">{(stats.totalClicks || 0).toLocaleString()}</p><p className="offer-stat-card__label">Total Clicks</p></div>
          </div>
          <div className="offer-stat-card">
            <div className="offer-stat-card__icon" style={{ background: '#fef2f2', color: '#991b1b' }}><BarChart3 size={20} /></div>
            <div>
              <p className="offer-stat-card__value">
                {stats.totalViews ? ((stats.totalClicks / stats.totalViews) * 100).toFixed(1) + '%' : '0%'}
              </p>
              <p className="offer-stat-card__label">CTR</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Form ── */}
      <form className="admin-form" onSubmit={handleSubmit}>
        <h2>{editing ? 'Edit Offer' : 'New Offer'}</h2>

        <div className="form-group">
          <label>Title *</label>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Eid Offers 25% off"
            required
          />
        </div>

        <div className="form-group">
          <label>Description <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(shown on banner)</span></label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="e.g. Get flat 25% off on all medicines this Eid. Limited time offer!"
            maxLength={500}
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="form-group">
          <label>Banner Image *</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} />
          {imgUploading && <span style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>Uploading…</span>}
          {form.imageUrl && (
            <img src={form.imageUrl} alt="preview" className="preview-img" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8 }} />
          )}
        </div>

        {/* ── Discount Badge ── */}
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Discount Badge Text</label>
            <input
              value={form.discountText}
              onChange={e => setForm(f => ({ ...f, discountText: e.target.value }))}
              placeholder="e.g. 25% OFF, Buy 1 Get 1, FLAT ₹100 OFF"
              maxLength={50}
            />
            {form.discountText && (
              <div style={{ marginTop: 6 }}>
                <span className="offer-discount-badge-preview" style={{ background: form.badgeColor }}>
                  {form.discountText}
                </span>
              </div>
            )}
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Badge Color</label>
            <div className="badge-color-grid">
              {BADGE_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  className={`badge-color-btn ${form.badgeColor === c.value ? 'active' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setForm(f => ({ ...f, badgeColor: c.value }))}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Smart "Shop Now" link picker ── */}
        <div className="form-group">
          <label>"Shop Now" button goes to</label>
          <select
            className="admin-filter-bar__select"
            style={{ width: '100%', marginBottom: 8 }}
            value={linkType}
            onChange={e => { setLinkType(e.target.value); setLinkCat(''); setCustomLink(''); }}
          >
            {LINK_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {linkType === 'category' && (
            <select
              className="admin-filter-bar__select"
              style={{ width: '100%', marginBottom: 8 }}
              value={linkCat}
              onChange={e => setLinkCat(e.target.value)}
              required
            >
              <option value="">— Select a Category —</option>
              {categories.map(c => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          )}

          {linkType === 'custom' && (
            <input
              value={customLink}
              onChange={e => setCustomLink(e.target.value)}
              placeholder="/products?search=paracetamol"
              style={{ width: '100%' }}
            />
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 6, padding: '6px 10px', fontSize: '0.8rem', color: '#166534',
          }}>
            <ExternalLink size={13} />
            <span>Shop Now will open: <strong>{computedLink || '—'}</strong></span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Start Date *</label>
            <input
              type="date"
              value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>End Date *</label>
            <input
              type="date"
              value={form.endDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <input
              type="number"
              min="0"
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              placeholder="0"
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>Higher = shown first</span>
          </div>
        </div>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
          />
          Active (show on site)
        </label>

        {/* ── Display On ── */}
        <div className="form-group">
          <label>Display On</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { value: 'both', label: 'Both Pages', icon: <Layers size={14} /> },
              { value: 'home', label: 'Home Page Only', icon: <Monitor size={14} /> },
              { value: 'products', label: 'Products Page Only', icon: <Store size={14} /> },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`btn btn--sm ${form.displayOn === opt.value ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => setForm(f => ({ ...f, displayOn: opt.value }))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="checkbox-label" style={{ background: '#fef9c3', border: '1.5px solid #fde047', borderRadius: 8, padding: '8px 12px', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.isDealOfDay}
            onChange={e => setForm(f => ({ ...f, isDealOfDay: e.target.checked }))}
          />
          <span>⭐ Feature as <strong>"Deal of the Day"</strong> on homepage</span>
          <span style={{ fontSize: '0.7rem', color: '#92400e', marginLeft: 4 }}>(Title &amp; description show in the red deal card. Set End Date = deal expiry for the countdown timer.)</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.freeDelivery}
            onChange={e => setForm(f => ({ ...f, freeDelivery: e.target.checked }))}
          />
          🚚 Free Delivery offer
        </label>

        {form.freeDelivery && (
          <div className="form-group">
            <label>Minimum order for free delivery (₹)</label>
            <input
              type="number"
              min="0"
              value={form.freeDeliveryMin}
              onChange={e => setForm(f => ({ ...f, freeDeliveryMin: e.target.value }))}
              placeholder="e.g. 299 (0 = no minimum)"
            />
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn--primary" type="submit">
            {editing ? 'Update Offer' : <><Plus size={16} /> Create Offer</>}
          </button>
          {editing && (
            <button type="button" className="btn btn--outline" onClick={resetForm}>Cancel</button>
          )}
        </div>
      </form>

      {/* ── Filter & Bulk Actions ── */}
      <div className="offer-toolbar">
        <h2 style={{ margin: 0 }}>Current Offers ({filteredOffers.length})</h2>
        <div className="offer-toolbar__actions">
          <select
            className="admin-filter-bar__select"
            value={filter}
            onChange={e => { setFilter(e.target.value); setSelectedIds([]); }}
          >
            <option value="all">All</option>
            <option value="active">🟢 Active</option>
            <option value="scheduled">🟡 Scheduled</option>
            <option value="expired">🔴 Expired</option>
            <option value="inactive">⚫ Inactive</option>
          </select>
          {selectedIds.length > 0 && (
            <>
              <button className="btn btn--sm btn--outline" onClick={() => handleBulkToggle(true)}>
                <ToggleRight size={14} /> Activate ({selectedIds.length})
              </button>
              <button className="btn btn--sm btn--outline" onClick={() => handleBulkToggle(false)}>
                <ToggleLeft size={14} /> Deactivate ({selectedIds.length})
              </button>
            </>
          )}
        </div>
      </div>

      {filteredOffers.length === 0 && (
        <p style={{ color: 'var(--gray-400)', marginTop: 12, textAlign: 'center', padding: '32px 0' }}>
          {filter === 'all' ? 'No offers yet. Create one above.' : `No ${filter} offers.`}
        </p>
      )}

      {filteredOffers.length > 0 && (
        <div style={{ marginBottom: 8, paddingLeft: 4 }}>
          <label className="checkbox-label" style={{ fontSize: '0.8rem' }}>
            <input type="checkbox" checked={selectedIds.length === filteredOffers.length && filteredOffers.length > 0} onChange={selectAll} />
            Select All
          </label>
        </div>
      )}

      <div className="offers-grid">
        {filteredOffers.map(o => {
          const status = getOfferStatus(o);
          const timeLeft = getTimeLeft(o.endDate);
          const ctr = o.viewCount ? ((o.clickCount / o.viewCount) * 100).toFixed(1) : '0.0';
          return (
            <div key={o._id} className={`offer-tile offer-tile--${status}`}>
              {/* Select checkbox */}
              <div className="offer-tile__select" onClick={() => toggleSelect(o._id)}>
                {selectedIds.includes(o._id) ? <CheckSquare size={16} color="var(--primary)" /> : <Square size={16} color="var(--gray-400)" />}
              </div>

              {/* Discount badge */}
              {o.discountText && (
                <div className="offer-tile__discount-badge" style={{ background: o.badgeColor || '#C0392B' }}>
                  {o.discountText}
                </div>
              )}

              {/* Status indicator */}
              <div className={`offer-tile__status-dot offer-tile__status-dot--${status}`} title={status} />

              {o.imageUrl && <img src={o.imageUrl} alt={o.title} />}
              <div className="offer-tile__info">
                <p className="offer-tile__title">{o.title}</p>
                {o.description && <p className="offer-tile__desc">{o.description}</p>}

                <div className="offer-tile__meta">
                  <span>{o.startDate?.slice(0, 10)} → {o.endDate?.slice(0, 10)}</span>
                  {timeLeft && <span className="offer-tile__countdown">⏱ {timeLeft}</span>}
                </div>

                <div className="offer-tile__badges">
                  <span className={`offer-tile__status-badge offer-tile__status-badge--${status}`}>
                    {status === 'active' ? '🟢 Active' : status === 'expired' ? '🔴 Expired' : status === 'scheduled' ? '🟡 Scheduled' : '⚫ Inactive'}
                  </span>
                  {o.freeDelivery && (
                    <span className="offer-tile__free-delivery">
                      🚚 Free Delivery {o.freeDeliveryMin > 0 ? `above ₹${o.freeDeliveryMin}` : ''}
                    </span>
                  )}
                  {o.displayOn && o.displayOn !== 'both' && (
                    <span style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: 4 }}>
                      {o.displayOn === 'home' ? '🏠 Home Only' : '🛒 Products Only'}
                    </span>
                  )}
                  {o.displayOn === 'both' && (
                    <span style={{ fontSize: '0.7rem', background: '#f0fdf4', color: '#166534', padding: '2px 6px', borderRadius: 4 }}>
                      🌐 Both Pages
                    </span>
                  )}
                  {o.priority > 0 && (
                    <span className="offer-tile__priority">⭐ P{o.priority}</span>
                  )}
                </div>

                {/* Analytics row */}
                <div className="offer-tile__analytics">
                  <span title="Views"><Eye size={12} /> {(o.viewCount || 0).toLocaleString()}</span>
                  <span title="Clicks"><MousePointerClick size={12} /> {(o.clickCount || 0).toLocaleString()}</span>
                  <span title="Click-through rate"><BarChart3 size={12} /> {ctr}%</span>
                </div>

                <p style={{
                  fontSize: '0.75rem', color: '#2563eb',
                  background: '#eff6ff', borderRadius: 4, padding: '2px 6px', marginTop: 4,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <ExternalLink size={11} /> {linkPreview(o.link || '/')}
                </p>
              </div>
              <div className="offer-tile__actions">
                <button className="btn btn--sm btn--outline" onClick={() => startEdit(o)} title="Edit"><Pencil size={14} /></button>
                <button className="btn btn--sm btn--outline" onClick={() => handleDuplicate(o._id)} title="Duplicate"><Copy size={14} /></button>
                <button className="btn btn--sm btn--danger" onClick={() => handleDelete(o._id)} title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

