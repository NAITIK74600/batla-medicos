import { useEffect, useState, useRef } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/categories';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, X, FolderOpen, Package,
  ChevronUp, ChevronDown, Search, AlertTriangle, ExternalLink,
  Save, RefreshCw, ArrowLeftRight,
} from 'lucide-react';

/* ─── Quick-pick icons for medical/pharma categories ─── */
const ICON_OPTIONS = [
  '💊','🩺','🏥','🧪','💉','🩹','❤️','🧠','👁️','🦷','🦴','💪',
  '🌿','🍃','🧴','🧼','👶','👩','👨','🧔','🌸','🔬','⚕️','🫀',
  '🧬','🩻','🩸','💆','🏃','🧘','🛌','🥗','💧','🌡️','📦','🎯',
];

/* ─── Virtual lifestyle categories — matched by keyword search, not category_id ─── */
const LIFESTYLE_CATS = [
  { slug: 'hair-care',          label: 'Hair Care',            icon: '✂️' },
  { slug: 'skin-care',          label: 'Skin Care',            icon: '🧴' },
  { slug: 'baby-care',          label: 'Baby Care',            icon: '👶' },
  { slug: 'fitness-health',     label: 'Fitness & Health',     icon: '🏃' },
  { slug: 'vitamins-nutrition', label: 'Vitamins & Nutrition', icon: '💊' },
  { slug: 'diabetes-care',      label: 'Diabetes Care',        icon: '🌡️' },
  { slug: 'supports-braces',    label: 'Supports & Braces',    icon: '🦴' },
  { slug: 'immunity-boosters',  label: 'Immunity Boosters',    icon: '🌿' },
  { slug: 'sexual-wellness',    label: 'Sexual Wellness',      icon: '❤️' },
  { slug: 'oral-care',          label: 'Oral Care',            icon: '🦷' },
  { slug: 'women-care',         label: "Women's Care",         icon: '👩' },
  { slug: 'men-grooming',       label: 'Men Grooming',         icon: '🧔' },
  { slug: 'elderly-care',       label: 'Elderly Care',         icon: '🛌' },
];

const EMPTY = { name: '', icon: '', order: 0 };

export default function AdminCategories() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');

  /* slide-over panel */
  const [panel, setPanel]   = useState(null); // null | 'add' | 'edit'
  const [form, setForm]     = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  /* delete confirmation */
  const [deleteTarget, setDeleteTarget]     = useState(null);
  const [reassignTo, setReassignTo]         = useState('');
  const [deleteLoading, setDeleteLoading]   = useState(false);

  /* ── Product Management Panel ── */
  const [prodPanel, setProdPanel]           = useState(null); // null | category obj
  const [catProducts, setCatProducts]       = useState([]);
  const [catProdLoading, setCatProdLoading] = useState(false);
  const [prodTab, setProdTab]               = useState('in'); // 'in' | 'add'
  const [addSearch, setAddSearch]           = useState('');
  const [addResults, setAddResults]         = useState([]);
  const [addSearching, setAddSearching]     = useState(false);
  const [reassigningId, setReassigningId]   = useState(null); // product._id being moved
  const addSearchTimer = useRef(null);

  const nameRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getCategories();
      setCategories(r.data.categories || []);
    } catch { toast.error('Failed to load categories.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  /* focus name field when panel opens */
  useEffect(() => {
    if (panel) setTimeout(() => nameRef.current?.focus(), 80);
  }, [panel]);

  const totalProducts = categories.reduce((s, c) => s + (c.productCount || 0), 0);

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm(EMPTY);
    setEditId(null);
    setPanel('add');
  };

  const openEdit = (c) => {
    setForm({ name: c.name, icon: c.icon || '', order: c.order || 0 });
    setEditId(c._id);
    setPanel('edit');
  };

  const closePanel = () => { setPanel(null); setEditId(null); setForm(EMPTY); };

  /* ── product management panel ── */
  const loadCatProducts = async (catId) => {
    setCatProdLoading(true);
    try {
      const r = await api.get('/products/admin/list', { params: { category: catId, limit: 100, page: 1 } });
      setCatProducts(r.data.products || []);
    } catch { toast.error('Failed to load products.'); }
    finally { setCatProdLoading(false); }
  };

  const openProdPanel = async (cat) => {
    setProdPanel(cat); setProdTab('in'); setAddSearch(''); setAddResults([]); setReassigningId(null);
    await loadCatProducts(cat._id);
  };

  const closeProdPanel = () => {
    setProdPanel(null); setCatProducts([]); setAddSearch(''); setAddResults([]);
    clearTimeout(addSearchTimer.current);
  };

  const handleAddSearch = (q) => {
    setAddSearch(q);
    clearTimeout(addSearchTimer.current);
    if (!q.trim()) { setAddResults([]); return; }
    setAddSearching(true);
    addSearchTimer.current = setTimeout(async () => {
      try {
        const r = await api.get('/products/admin/list', { params: { search: q.trim(), limit: 20, page: 1 } });
        setAddResults((r.data.products || []).filter(p => p.category?._id !== prodPanel?._id));
      } catch {}
      finally { setAddSearching(false); }
    }, 400);
  };

  const doAddProduct = async (product) => {
    try {
      await api.put(`/products/${product._id}`, { category: prodPanel._id });
      toast.success(`"${product.name}" added to ${prodPanel.name}.`);
      setAddResults(rs => rs.filter(p => p._id !== product._id));
      await loadCatProducts(prodPanel._id);
      load();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed.'); }
  };

  const doReassignProduct = async (product, targetCatId) => {
    try {
      await api.put(`/products/${product._id}`, { category: targetCatId });
      const tc = categories.find(c => c._id === targetCatId);
      toast.success(`"${product.name}" moved to ${tc?.name || 'category'}.`);
      setReassigningId(null);
      await loadCatProducts(prodPanel._id);
      load();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed.'); }
  };

  /* ── order +/- inline ── */
  const shiftOrder = async (cat, dir) => {
    try {
      await updateCategory(cat._id, { order: (cat.order || 0) + dir });
      load();
    } catch { toast.error('Could not update order.'); }
  };

  /* â”€â”€ save (add / edit) â”€â”€ */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Category name is required.');
    setSaving(true);
    try {
      if (panel === 'add') {
        await createCategory({ name: form.name.trim(), icon: form.icon, order: Number(form.order || 0) });
        toast.success('Category created!');
      } else {
        await updateCategory(editId, { name: form.name.trim(), icon: form.icon, order: Number(form.order || 0) });
        toast.success('Category updated!');
      }
      closePanel();
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save category.');
    } finally { setSaving(false); }
  };

  /* â”€â”€ delete with optional reassign â”€â”€ */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const hasProducts = deleteTarget.productCount > 0;
    if (hasProducts && !reassignTo) {
      toast.error('Select a category to reassign products first.');
      return;
    }
    setDeleteLoading(true);
    try {
      if (hasProducts && reassignTo) {
        /* reassign products to target category first */
        await api.put(`/categories/${deleteTarget._id}/reassign`, { targetId: reassignTo });
      }
      await deleteCategory(deleteTarget._id);
      toast.success(`"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      setReassignTo('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Delete failed.');
    } finally { setDeleteLoading(false); }
  };

  /* â”€â”€ live preview card â”€â”€ */
  const Preview = () => (
    <div style={{
      background: 'linear-gradient(135deg,#fff8f8,#f0fdf4)',
      border: '1px dashed #d1d5db',
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      marginBottom: 4,
    }}>
      <span style={{ fontSize: 28, lineHeight: 1 }}>{form.icon || '📂'}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111' }}>{form.name || 'Category Name'}</div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          slug: {form.name ? form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'category-slug'}
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-page" style={{ position: 'relative' }}>

      {/* â”€â”€ Header â”€â”€ */}
      <div className="admin-page__header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpen size={22} /> Categories
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 4 }}>
            {categories.length} categories · {totalProducts.toLocaleString()} total products
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--outline" onClick={load} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button className="btn btn--primary" onClick={openAdd}>
            <Plus size={16} /> Add Category
          </button>
        </div>
      </div>

      {/* â”€â”€ Search bar â”€â”€ */}
      <div style={{ position: 'relative', maxWidth: 320, marginBottom: 16 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input
          className="form-input"
          style={{ paddingLeft: 32, margin: 0 }}
          placeholder="Search categories…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* â”€â”€ Table â”€â”€ */}
      {loading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          {search ? 'No categories match your search.' : 'No categories yet.'}
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Name</th>
                <th>Slug</th>
                <th style={{ width: 110 }}>Products</th>
                <th style={{ width: 110 }}>Order</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c._id} style={{ transition: 'background 0.15s' }}>
                  <td style={{ color: '#9ca3af', fontSize: '0.82rem' }}>{i + 1}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
                      {c.icon && <span style={{ fontSize: 20 }}>{c.icon}</span>}
                      {c.name}
                    </span>
                  </td>
                  <td>
                    <code style={{ color: '#6b7280', fontSize: '0.8rem', background: '#f3f4f6', padding: '2px 7px', borderRadius: 4 }}>
                      {c.slug}
                    </code>
                  </td>
                  <td>
                    {c.productCount > 0 ? (
                      <button
                        onClick={() => openProdPanel(c)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                          borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="View products in this category"
                      >
                        <Package size={12} /> {c.productCount.toLocaleString()}
                        <ExternalLink size={10} style={{ marginLeft: 2 }} />
                      </button>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>0</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{c.order}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: '#6b7280', lineHeight: 1 }}
                          onClick={() => shiftOrder(c, -1)} title="Move up"
                        ><ChevronUp size={13} /></button>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: '#6b7280', lineHeight: 1 }}
                          onClick={() => shiftOrder(c, 1)} title="Move down"
                        ><ChevronDown size={13} /></button>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn--sm btn--primary"
                        title="Edit category"
                        onClick={() => openEdit(c)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        className="btn btn--sm btn--outline"
                        title="Manage products in this category"
                        onClick={() => openProdPanel(c)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#3451D1', borderColor: '#93C5FD' }}
                      >
                        <Package size={13} /> Products
                      </button>
                      <button
                        className="btn btn--sm btn--outline"
                        title={c.productCount > 0 ? 'Has products — will ask for reassign' : 'Delete'}
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                        onClick={() => { setDeleteTarget(c); setReassignTo(''); }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          SLIDE-OVER PANEL — Add / Edit
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {panel && (
        <>
          {/* backdrop */}
          <div
            onClick={closePanel}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              zIndex: 200, backdropFilter: 'blur(2px)'
            }}
          />
          {/* panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
            background: '#fff', boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
            zIndex: 201, display: 'flex', flexDirection: 'column',
            animation: 'slideInRight 0.22s ease',
          }}>
            {/* panel header */}
            <div style={{
              padding: '18px 22px', borderBottom: '1px solid #e5e7eb',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: panel === 'add' ? 'linear-gradient(135deg,#C0392B,#e74c3c)' : 'linear-gradient(135deg,#1E8449,#27ae60)',
            }}>
              <div>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 700 }}>
                  {panel === 'add' ? '➕ New Category' : '✏️ Edit Category'}
                </h2>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                  {panel === 'add' ? 'Create a new product category' : `Editing: ${categories.find(c => c._id === editId)?.name || ''}`}
                </p>
              </div>
              <button onClick={closePanel} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, cursor: 'pointer', padding: 6, color: '#fff', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
              <form id="cat-form" onSubmit={handleSubmit}>

                {/* Live preview */}
                <div style={{ marginBottom: 18 }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Preview</p>
                  <Preview />
                </div>

                {/* Name */}
                <div style={{ marginBottom: 14 }}>
                  <label className="form-label">Category Name *</label>
                  <input
                    ref={nameRef}
                    className="form-input"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Skin Care"
                    style={{ marginBottom: 0 }}
                  />
                </div>

                {/* Icon quick-pick */}
                <div style={{ marginBottom: 14 }}>
                  <label className="form-label">Icon</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {ICON_OPTIONS.map(ic => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, icon: ic }))}
                        style={{
                          width: 38, height: 38, borderRadius: 8, fontSize: 20,
                          border: form.icon === ic ? '2px solid #C0392B' : '1.5px solid #e5e7eb',
                          background: form.icon === ic ? '#fff5f5' : '#fff',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.12s',
                        }}
                        title={ic}
                      >{ic}</button>
                    ))}
                  </div>
                  <input
                    className="form-input"
                    value={form.icon}
                    onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                    placeholder="Or type custom emoji / text"
                    style={{ marginBottom: 0 }}
                  />
                </div>

                {/* Sort order */}
                <div style={{ marginBottom: 14 }}>
                  <label className="form-label">Sort Order</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" className="btn btn--outline btn--sm"
                      onClick={() => setForm(f => ({ ...f, order: Math.max(0, Number(f.order) - 1) }))}>−</button>
                    <input
                      className="form-input"
                      type="number" min={0}
                      value={form.order}
                      onChange={e => setForm(f => ({ ...f, order: e.target.value }))}
                      style={{ width: 70, textAlign: 'center', margin: 0 }}
                    />
                    <button type="button" className="btn btn--outline btn--sm"
                      onClick={() => setForm(f => ({ ...f, order: Number(f.order) + 1 }))}>+</button>
                    <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>lower = appears first</span>
                  </div>
                </div>

              </form>
            </div>

            {/* panel footer */}
            <div style={{
              padding: '14px 22px', borderTop: '1px solid #e5e7eb',
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              background: '#f9fafb',
            }}>
              <button type="button" className="btn btn--outline" onClick={closePanel}>Cancel</button>
              <button
                type="submit"
                form="cat-form"
                className="btn btn--primary"
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Save size={15} />
                {saving ? 'Saving…' : panel === 'add' ? 'Create Category' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          DELETE CONFIRMATION MODAL with reassign
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => { setDeleteTarget(null); setReassignTo(''); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-card__header" style={{ background: '#fff5f5' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626' }}>
                <AlertTriangle size={20} /> Delete "{deleteTarget.name}"
              </h2>
              <button className="modal-card__close" onClick={() => { setDeleteTarget(null); setReassignTo(''); }}><X size={18} /></button>
            </div>

            <div style={{ padding: '16px 0' }}>
              {deleteTarget.productCount > 0 ? (
                <>
                  <p style={{ color: '#374151', marginBottom: 14 }}>
                    This category has <strong style={{ color: '#dc2626' }}>{deleteTarget.productCount.toLocaleString()} products</strong>.
                    You must reassign them before deleting.
                  </p>
                  <label className="form-label">Reassign products to</label>
                  <select
                    className="form-input"
                    value={reassignTo}
                    onChange={e => setReassignTo(e.target.value)}
                    style={{ marginBottom: 0 }}
                  >
                    <option value="">— Select target category —</option>
                    {categories
                      .filter(c => c._id !== deleteTarget._id)
                      .map(c => (
                        <option key={c._id} value={c._id}>
                          {c.icon} {c.name} ({c.productCount} products)
                        </option>
                      ))}
                  </select>
                </>
              ) : (
                <p style={{ color: '#374151' }}>
                  Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>? This cannot be undone.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
              <button className="btn btn--outline" onClick={() => { setDeleteTarget(null); setReassignTo(''); }}>Cancel</button>
              <button
                className="btn btn--primary"
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
                onClick={handleDelete}
                disabled={deleteLoading || (deleteTarget.productCount > 0 && !reassignTo)}
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* ═════════════════════════════════════════════════════
          PRODUCT MANAGEMENT PANEL
      ═════════════════════════════════════════════════════ */}
      {prodPanel && (
        <>
          {/* backdrop */}
          <div
            onClick={closeProdPanel}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, backdropFilter: 'blur(3px)' }}
          />
          {/* panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(580px, 100vw)',
            background: '#fff', boxShadow: '-4px 0 40px rgba(0,0,0,0.22)',
            zIndex: 301, display: 'flex', flexDirection: 'column',
            animation: 'slideInRight 0.22s ease',
          }}>
            {/* header */}
            <div style={{
              padding: '18px 22px', borderBottom: '1px solid #e5e7eb',
              background: 'linear-gradient(135deg,#1E40AF,#3451D1)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Package size={18} /> {prodPanel.icon} {prodPanel.name}
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                  {catProdLoading ? 'Loading…' : `${catProducts.length} product${catProducts.length !== 1 ? 's' : ''} in this category`}
                </p>
              </div>
              <button onClick={closeProdPanel} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, cursor: 'pointer', padding: 6, color: '#fff', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
              {[['in', '📋 In Category', catProducts.length], ['add', '➕ Find & Add', null]].map(([key, label, count]) => (
                <button key={key}
                  onClick={() => { setProdTab(key); if (key === 'add') { setAddSearch(''); setAddResults([]); } }}
                  style={{
                    flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                    color: prodTab === key ? '#3451D1' : '#6b7280',
                    background: prodTab === key ? '#fff' : 'transparent',
                    borderBottom: prodTab === key ? '2px solid #3451D1' : '2px solid transparent',
                  }}
                >
                  {label}
                  {count != null && count > 0 && (
                    <span style={{ marginLeft: 6, background: '#dbeafe', color: '#1d4ed8', borderRadius: 10, padding: '1px 7px', fontSize: '0.73rem' }}>{count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

              {/* ── IN CATEGORY TAB ── */}
              {prodTab === 'in' && (
                catProdLoading
                  ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Loading products…</p>
                  : catProducts.length === 0
                  ? (
                    <div style={{ textAlign: 'center', padding: 50, color: '#9ca3af' }}>
                      <Package size={42} style={{ opacity: 0.25, marginBottom: 10 }} />
                      <p style={{ margin: 0 }}>No products in this category yet.</p>
                      <button className="btn btn--outline btn--sm" onClick={() => setProdTab('add')} style={{ marginTop: 12 }}>
                        Find &amp; Add Products →
                      </button>
                    </div>
                  )
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4 }}>
                        Click <strong>Move out</strong> to reassign a product to a different category.
                      </p>
                      {catProducts.map(p => (
                        <div key={p._id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', padding: '9px 13px',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.87rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2, display: 'flex', gap: 8 }}>
                              {p.brand && <span>{p.brand}</span>}
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>₹{p.price}</span>
                              <span style={{ color: p.stock > 10 ? '#6b7280' : p.stock > 0 ? '#d97706' : '#dc2626' }}>Stock: {p.stock}</span>
                            </div>
                          </div>
                          {reassigningId === p._id ? (
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                              <select
                                className="form-input"
                                style={{ padding: '4px 6px', fontSize: '0.78rem', width: 150, margin: 0 }}
                                defaultValue=""
                                onChange={async e => { if (e.target.value) await doReassignProduct(p, e.target.value); }}
                              >
                                <option value="">Move to…</option>
                                {categories.filter(c => c._id !== prodPanel._id).map(c => (
                                  <option key={c._id} value={c._id}>{c.icon} {c.name}</option>
                                ))}
                              </select>
                              <button onClick={() => setReassigningId(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, display: 'flex' }}>
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setReassigningId(p._id)}
                              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 7, cursor: 'pointer', padding: '4px 9px', fontSize: '0.75rem', fontWeight: 600 }}
                            >
                              <ArrowLeftRight size={12} /> Move out
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )
              )}

              {/* ── FIND & ADD TAB ── */}
              {prodTab === 'add' && (
                <div>
                  <div style={{ position: 'relative', marginBottom: 14 }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                    <input
                      className="form-input"
                      style={{ paddingLeft: 32, margin: 0 }}
                      placeholder="Search product name or brand…"
                      value={addSearch}
                      onChange={e => handleAddSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {!addSearch && (
                    <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem', padding: 24 }}>Type a product name or brand to search across all products.</p>
                  )}
                  {addSearching && <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>Searching…</p>}
                  {!addSearching && addSearch && addResults.length === 0 && (
                    <p style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No matching products found.</p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {addResults.map(p => (
                      <div key={p._id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', padding: '9px 13px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.87rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2, display: 'flex', gap: 8 }}>
                            {p.brand && <span>{p.brand}</span>}
                            <span style={{ background: '#f3f4f6', borderRadius: 4, padding: '1px 5px', color: '#6b7280' }}>{p.category?.name || '—'}</span>
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>₹{p.price}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => doAddProduct(p)}
                          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#3451D1', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', padding: '5px 11px', fontSize: '0.78rem', fontWeight: 600 }}
                        >
                          <Plus size={12} /> Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* footer */}
            <div style={{ padding: '12px 22px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                {catProducts.length} product{catProducts.length !== 1 ? 's' : ''} in <strong>{prodPanel.name}</strong>
              </span>
              <button className="btn btn--outline btn--sm" onClick={closeProdPanel}>Close</button>
            </div>
          </div>
        </>
      )}

      {/* ─── Virtual / Lifestyle categories (keyword-matched, not in DB) ─── */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#374151', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          🛍️ Lifestyle Categories <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '2px 8px' }}>virtual — keyword search, read-only</span>
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: 12 }}>
          These categories are not stored in the database. Products are matched by keyword search on their name/company fields.
          To change which products appear under a lifestyle category, update the product names or the backend <code>LIFESTYLE_SLUGS</code> config.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LIFESTYLE_CATS.map(cat => (
            <div key={cat.slug} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10,
              padding: '6px 12px', fontSize: '0.85rem', color: '#374151',
            }}>
              <span style={{ fontSize: 18 }}>{cat.icon}</span>
              <span style={{ fontWeight: 600 }}>{cat.label}</span>
              <code style={{ fontSize: '0.7rem', color: '#9ca3af', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px' }}>{cat.slug}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
