import { useEffect, useRef, useState } from 'react';
import { getAdminProducts, bulkDiscountProducts, updateProduct } from '../../api/products';
import { getCategories } from '../../api/categories';
import toast from 'react-hot-toast';
import { Search, Percent, RotateCcw, X, Tag, Check } from 'lucide-react';

const DISC_OPTS = [
  { value: 'all',  label: 'All Products' },
  { value: 'none', label: 'No Discount' },
  { value: 'low',  label: '1% - 20% Off' },
  { value: 'mid',  label: '21% - 50% Off' },
  { value: 'high', label: '> 50% Off' },
];

function DiscBadge({ mrp, price }) {
  if (!mrp || price >= mrp) return <span style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>No discount</span>;
  const pct = Math.round(((mrp - price) / mrp) * 100);
  const color = pct >= 50 ? '#7c3aed' : pct >= 20 ? '#1E8449' : '#C0392B';
  return <span className="disc-badge" style={{ background: color + '15', color }}>{pct}% off</span>;
}

export default function AdminDiscounts() {
  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [page,  setPage]  = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchInput,    setSearchInput]    = useState('');
  const [search,         setSearch]         = useState('');
  const [catFilter,      setCatFilter]      = useState('');
  const [discountFilter, setDiscountFilter] = useState('all');
  const searchTimer = useRef(null);

  // Selection
  const [selectedIds,       setSelectedIds]       = useState(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  // Bulk discount modal
  const [modal, setModal] = useState({ open: false, pct: '' });

  // Per-row price override
  const [priceEdit, setPriceEdit] = useState({});

  const [trigger, setTrigger] = useState(0);
  const refresh = () => setTrigger(t => t + 1);

  /* ── Fetch ── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [pRes, cRes] = await Promise.all([
          getAdminProducts({ page, limit: 20, search, category: catFilter || undefined, discountFilter, sort: 'name_asc' }),
          categories.length === 0 ? getCategories() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setProducts(pRes.data.products || []);
        setPages(pRes.data.pages || 1);
        setTotal(pRes.data.total || 0);
        if (cRes) setCategories(cRes.data.categories || []);
        setSelectedIds(new Set());
      } catch {/* swallow */}
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, catFilter, discountFilter, trigger]);

  /* ── Search debounce ── */
  const handleSearchInput = (val) => {
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1); setSelectAllMatching(false); }, 400);
  };

  /* ── Selection ── */
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) { setSelectedIds(new Set()); setSelectAllMatching(false); }
    else { setSelectedIds(new Set(products.map(p => p._id))); }
  };
  const allSelected  = products.length > 0 && selectedIds.size === products.length;
  const someSelected = selectedIds.size > 0;
  const bulkCount = selectAllMatching ? total : selectedIds.size;

  const bulkPayload = (extra) =>
    selectAllMatching
      ? { applyToAll: true, filterParams: { search, category: catFilter || undefined, discountFilter }, ...extra }
      : { ids: [...selectedIds], ...extra };

  /* ── Apply bulk discount ── */
  const handleApplyDiscount = async () => {
    const pct = parseFloat(modal.pct);
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Enter a valid discount % (0-100).'); return; }
    if (!confirm(`Apply ${pct}% discount to ${bulkCount} products?`)) return;
    try {
      const { data } = await bulkDiscountProducts(bulkPayload({ discountPct: pct }));
      toast.success(`${pct}% discount applied to ${data.modified} products.`);
      setModal({ open: false, pct: '' });
      setSelectedIds(new Set()); setSelectAllMatching(false);
      refresh();
    } catch { toast.error('Discount apply failed.'); }
  };

  /* ── Reset to MRP (0% discount → price = mrp) ── */
  const handleResetToMRP = async () => {
    if (!bulkCount) return;
    if (!confirm(`Reset price to MRP for ${bulkCount} products? Discounts will be removed.`)) return;
    try {
      const { data } = await bulkDiscountProducts(bulkPayload({ discountPct: 0 }));
      toast.success(`Price reset to MRP for ${data.modified} products.`);
      setSelectedIds(new Set()); setSelectAllMatching(false);
      refresh();
    } catch { toast.error('Reset failed.'); }
  };

  /* ── Quick presets ── */
  const applyPreset = async (pct) => {
    if (!confirm(`Apply ${pct}% discount to ALL currently filtered products?`)) return;
    try {
      const fp = { search, category: catFilter || undefined, discountFilter };
      const { data } = await bulkDiscountProducts({ applyToAll: true, filterParams: fp, discountPct: pct });
      toast.success(`${pct}% discount applied to ${data.modified} products.`);
      refresh();
    } catch { toast.error('Failed to apply discount.'); }
  };

  /* ── Per-row price save ── */
  const savePrice = async (p) => {
    const raw = priceEdit[p._id];
    if (raw === undefined) return;
    const newPrice = parseFloat(raw);
    if (isNaN(newPrice) || newPrice < 0) { toast.error('Invalid price.'); return; }
    try {
      const fd = new FormData();
      fd.append('price', newPrice);
      await updateProduct(p._id, fd);
      setProducts(prev => prev.map(q => q._id === p._id ? { ...q, price: newPrice } : q));
      setPriceEdit(s => { const n = { ...s }; delete n[p._id]; return n; });
      toast.success('Price updated.');
    } catch { toast.error('Failed to save price.'); }
  };

  return (
    <div className="admin-page">

      {/* ── Page Header ── */}
      <div className="admin-page__header">
        <h1>
          Discount Manager{' '}
          {total > 0 && <span className="admin-page__count">{total.toLocaleString()}</span>}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)', alignSelf: 'center' }}>Quick preset:</span>
          {[5, 10, 20, 30, 50].map(pct => (
            <button key={pct} className="btn btn--sm btn--outline" onClick={() => applyPreset(pct)}>
              {pct}% Off
            </button>
          ))}
        </div>
      </div>

      {/* ── Discount Modal ── */}
      {modal.open && (
        <div className="import-modal-overlay" onClick={() => setModal({ open: false, pct: '' })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="import-modal__close" onClick={() => setModal({ open: false, pct: '' })}><X size={18} /></button>
            <h2 style={{ marginBottom: '0.5rem' }}>Apply Discount</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
              Sets <strong>Sale Price = MRP &times; (1 &minus; %/100)</strong> for{' '}
              <strong>{selectAllMatching ? `all ${total.toLocaleString()} matching` : `${selectedIds.size} selected`}</strong> products.
            </p>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 6 }}>Discount %</label>
              <input
                type="number" min="0" max="100" step="0.5" autoFocus
                value={modal.pct}
                onChange={e => setModal(m => ({ ...m, pct: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleApplyDiscount()}
                placeholder="e.g. 20"
                style={{ width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
              {modal.pct > 0 && modal.pct <= 100 && (
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--green)' }}>
                  Example: MRP &#8377;100 &rarr; Sale &#8377;{(100 * (1 - modal.pct / 100)).toFixed(2)}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" style={{ flex: 1 }} onClick={handleApplyDiscount}>
                <Percent size={15} /> Apply Discount
              </button>
              <button className="btn btn--outline" onClick={() => setModal({ open: false, pct: '' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="admin-filter-bar">
        <div className="admin-filter-bar__search">
          <Search size={15} className="admin-filter-bar__search-icon" />
          <input
            type="text" placeholder="Search products..."
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
          />
          {searchInput && (
            <button className="admin-filter-bar__clear" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}>
              <X size={13} />
            </button>
          )}
        </div>

        <select className="admin-filter-bar__select" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>

        <select className="admin-filter-bar__select" value={discountFilter} onChange={e => { setDiscountFilter(e.target.value); setPage(1); }}>
          {DISC_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Bulk Actions Bar ── */}
      {someSelected && (
        <div className="bulk-actions-bar">
          <span className="bulk-actions-bar__count">
            {selectAllMatching ? `All ${total.toLocaleString()} matching` : `${selectedIds.size} selected`}
          </span>
          <div className="bulk-actions-bar__btns">
            <button className="btn btn--sm btn--primary" onClick={() => setModal({ open: true, pct: '' })}>
              <Percent size={14} /> Apply Discount %
            </button>
            <button className="btn btn--sm btn--outline" onClick={handleResetToMRP}>
              <RotateCcw size={14} /> Reset to MRP
            </button>
            <button className="btn btn--sm btn--outline" onClick={() => { setSelectedIds(new Set()); setSelectAllMatching(false); }}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Select-All Banner ── */}
      {someSelected && !selectAllMatching && total > products.length && (
        <div className="select-all-banner">
          <span>Only <strong>{products.length}</strong> of <strong>{total.toLocaleString()}</strong> products shown.</span>
          <button className="btn btn--sm btn--link" onClick={() => setSelectAllMatching(true)}>
            Select all {total.toLocaleString()} matching products
          </button>
        </div>
      )}
      {selectAllMatching && (
        <div className="select-all-banner select-all-banner--active">
          <span>All <strong>{total.toLocaleString()}</strong> matching products are selected.</span>
          <button className="btn btn--sm btn--link" onClick={() => { setSelectAllMatching(false); setSelectedIds(new Set()); }}>
            Cancel selection
          </button>
        </div>
      )}

      {/* ── Product Table ── */}
      <div style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="admin-state-msg">Loading...</div>
        ) : products.length === 0 ? (
          <div className="admin-state-msg">No products found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
                <th>Name / Brand / Category</th>
                <th>MRP</th>
                <th>Sale Price</th>
                <th>Discount</th>
                <th>Set Price / Discount</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const discPct = p.mrp > 0 ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
                return (
                  <tr key={p._id} className={selectedIds.has(p._id) ? 'row--selected' : ''}>
                    <td><input type="checkbox" checked={selectedIds.has(p._id)} onChange={() => toggleSelect(p._id)} /></td>
                    <td>
                      <div className="product-name-cell">
                        <span className="product-name-cell__name">{p.name}</span>
                        {p.brand && <span className="product-name-cell__brand">{p.brand}</span>}
                        <span className="product-name-cell__cat">{p.category?.name || '-'}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--gray-500)', textDecoration: 'line-through', fontSize: '0.85rem' }}>&#8377;{p.mrp}</td>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>&#8377;{p.price}</td>
                    <td><DiscBadge mrp={p.mrp} price={p.price} /></td>
                    <td>
                      <div className="disc-edit-row">
                        <span style={{ fontSize: 12, color: 'var(--gray-500)', minWidth: 28 }}>&#8377;</span>
                        <input
                          type="number" min="0" step="0.5"
                          className="quick-stock-input"
                          style={{ width: 90 }}
                          value={priceEdit[p._id] !== undefined ? priceEdit[p._id] : p.price}
                          onChange={e => setPriceEdit(s => ({ ...s, [p._id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && savePrice(p)}
                          title="Edit price, then press Enter or click Save"
                        />
                        {priceEdit[p._id] !== undefined && (
                          <button className="btn btn--sm btn--primary" onClick={() => savePrice(p)} title="Save">
                            <Check size={13} />
                          </button>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--gray-400)', minWidth: 40 }}>
                          {priceEdit[p._id] !== undefined && p.mrp > 0
                            ? `${Math.round(((p.mrp - parseFloat(priceEdit[p._id])) / p.mrp) * 100)}%`
                            : `${discPct}%`}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {!loading && pages > 0 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&laquo; Prev</button>
          <span>Page {page} / {pages} &nbsp;&middot;&nbsp; {total.toLocaleString()} products</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next &raquo;</button>
        </div>
      )}
    </div>
  );
}
