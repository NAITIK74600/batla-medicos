import { useEffect, useRef, useState } from 'react';
import {
  getAdminLabTests, createLabTest, updateLabTest, deleteLabTest,
} from '../../api/lab';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, FlaskConical, ToggleLeft, ToggleRight } from 'lucide-react';

const CATS = ['blood','urine','stool','imaging','cardiac','hormones','vitamins','other'];
const EMPTY = {
  name: '', category: 'blood', price: '', mrp: '', sampleType: 'Blood',
  turnaroundTime: '24 hours', description: '', parameters: '',
  homeCollection: true, isActive: true,
};

export default function AdminLabTests() {
  const [tests,   setTests]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [search,  setSearch]  = useState('');
  const [catF,    setCatF]    = useState('all');
  const [trigger, setTrigger] = useState(0);
  const refresh = () => setTrigger(t => t + 1);

  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(EMPTY);
  const [editing,  setEditing]  = useState(null);

  useEffect(() => {
    setLoading(true);
    getAdminLabTests({ page, limit: 20, search: search || undefined, category: catF !== 'all' ? catF : undefined })
      .then(r => { setTests(r.data.tests || []); setTotal(r.data.total || 0); setPages(r.data.pages || 1); })
      .catch(() => toast.error('Failed to load.'))
      .finally(() => setLoading(false));
  }, [page, search, catF, trigger]);

  const startEdit = (t) => {
    setEditing(t._id);
    setForm({ ...t, parameters: (t.parameters || []).join(', '), mrp: t.mrp || '' });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: parseFloat(form.price),
      mrp:   form.mrp ? parseFloat(form.mrp) : undefined,
      parameters: form.parameters ? form.parameters.split(',').map(p => p.trim()).filter(Boolean) : [],
    };
    try {
      if (editing) {
        await updateLabTest(editing, payload);
        toast.success('Test updated.');
      } else {
        await createLabTest(payload);
        toast.success('Test created.');
      }
      setShowForm(false); setEditing(null); setForm(EMPTY); refresh();
    } catch (err) { toast.error(err?.response?.data?.message || 'Error saving test.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this test?')) return;
    try { await deleteLabTest(id); toast.success('Deleted.'); refresh(); }
    catch (err) { toast.error(err?.response?.data?.message || 'Error.'); }
  };

  const handleToggleActive = async (t) => {
    try { await updateLabTest(t._id, { isActive: !t.isActive }); refresh(); }
    catch { toast.error('Failed.'); }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title"><FlaskConical size={20} /> Lab Tests</h1>
          <p className="admin-page__sub">{total} tests configured</p>
        </div>
        <button className="btn btn--primary" onClick={() => { setEditing(null); setForm(EMPTY); setShowForm(true); }}>
          <Plus size={16} /> Add Test
        </button>
      </div>

      {/* Filters */}
      <div className="admin-filter-bar" style={{ marginBottom: 16 }}>
        <input className="admin-filter-bar__search" placeholder="Search by name…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select className="admin-filter-bar__select" value={catF} onChange={e => { setCatF(e.target.value); setPage(1); }}>
          <option value="all">All Categories</option>
          {CATS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {loading ? <div className="admin-state-msg">Loading…</div> : tests.length === 0 ? <div className="admin-state-msg">No tests found.</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Sample</th>
                <th>MRP</th>
                <th>Price</th>
                <th>TAT</th>
                <th>Home</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(t => (
                <tr key={t._id} style={{ opacity: t.isActive ? 1 : 0.6 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    {t.parameters?.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                        {t.parameters.slice(0, 3).join(', ')}{t.parameters.length > 3 ? ' …' : ''}
                      </div>
                    )}
                  </td>
                  <td><span style={{ textTransform: 'capitalize' }}>{t.category}</span></td>
                  <td>{t.sampleType}</td>
                  <td style={{ textDecoration: 'line-through', color: 'var(--gray-400)', fontSize: 13 }}>
                    {t.mrp ? `₹${t.mrp}` : '—'}
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>₹{t.price}</td>
                  <td style={{ fontSize: 13 }}>{t.turnaroundTime}</td>
                  <td>{t.homeCollection ? <span style={{ color: '#1B8843', fontWeight: 600, fontSize: 12 }}>Yes</span> : '—'}</td>
                  <td>
                    <button onClick={() => handleToggleActive(t)} title={t.isActive ? 'Deactivate' : 'Activate'}>
                      {t.isActive ? <ToggleRight size={20} color="#1B8843" /> : <ToggleLeft size={20} color="var(--gray-400)" />}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn--sm btn--outline" onClick={() => startEdit(t)}><Pencil size={13} /></button>
                      <button className="btn btn--sm btn--danger" onClick={() => handleDelete(t._id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && pages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&laquo; Prev</button>
          <span>Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next &raquo;</button>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {showForm && (
        <div className="import-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <button className="import-modal__close" onClick={() => setShowForm(false)}><X size={18} /></button>
            <h2 style={{ marginBottom: 20 }}>{editing ? 'Edit Lab Test' : 'Add Lab Test'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Name *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Complete Blood Count (CBC)" />
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>MRP (₹)</label>
                  <input type="number" min="0" step="0.01" value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} placeholder="Optional" />
                </div>
                <div className="form-group">
                  <label>Price (₹) *</label>
                  <input type="number" min="0" step="0.01" required value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="Selling price" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Sample Type</label>
                  <input value={form.sampleType} onChange={e => setForm(f => ({ ...f, sampleType: e.target.value }))} placeholder="Blood / Urine / Stool…" />
                </div>
                <div className="form-group">
                  <label>Turnaround Time</label>
                  <input value={form.turnaroundTime} onChange={e => setForm(f => ({ ...f, turnaroundTime: e.target.value }))} placeholder="e.g. 24 hours, Same day" />
                </div>
              </div>
              <div className="form-group">
                <label>Parameters (comma separated)</label>
                <input value={form.parameters} onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))} placeholder="Haemoglobin, WBC, RBC, Platelets, …" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description for patients" style={{ width: '100%', padding: 10, border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={form.homeCollection} onChange={e => setForm(f => ({ ...f, homeCollection: e.target.checked }))} />
                  Home Collection Available
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                  Active (visible to users)
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn--primary" style={{ flex: 1 }}>{editing ? 'Update Test' : 'Create Test'}</button>
                <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
