import { useEffect, useState } from 'react';
import { createOrderFromPrescription, getAllPrescriptions, updatePrescriptionStatus, exportPrescriptions, clearPrescriptions, deletePrescription } from '../../api/prescriptions';
import { getAdminProducts } from '../../api/products';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, Clock, Eye, Filter, X, Plus, Trash2, Download, FileSpreadsheet } from 'lucide-react';

function fmt(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_OPTS = ['', 'pending', 'approved', 'rejected'];

export default function AdminPrescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage]  = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [preview, setPreview] = useState(null);       // prescription to preview
  const [reviewing, setReviewing] = useState(null);   // prescription being reviewed
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Create order modal
  const [orderRx, setOrderRx] = useState(null);
  const [orderItems, setOrderItems] = useState([]); // [{ _id, name, price, qty }]
  const [addr, setAddr] = useState({ phone: '', line1: '', line2: '', city: '', pincode: '' });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearModal, setClearModal] = useState({ open: false, password: '' });
  const { isSuperAdmin } = useAuth();

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await exportPrescriptions({ status: statusFilter || undefined });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `prescriptions-${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
      toast.success('Prescriptions exported!');
    } catch { toast.error('Export failed.'); }
    finally { setExporting(false); }
  };

  const handleClear = async () => {
    if (!clearModal.password) { toast.error('Enter your password.'); return; }
    try {
      const { data } = await clearPrescriptions(clearModal.password);
      toast.success(data.message);
      setClearModal({ open: false, password: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to clear.'); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 12 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await getAllPrescriptions(params);
      setPrescriptions(data.prescriptions || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch {
      toast.error('Failed to load prescriptions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, page]);

  const startReview = (rx) => { setReviewing(rx); setAdminNote(''); };

  const submitReview = async (status) => {
    if (!reviewing) return;
    setSaving(true);
    try {
      await updatePrescriptionStatus(reviewing._id, { status, adminNote });
      toast.success(`Prescription ${status}.`);
      setReviewing(null);
      load();
    } catch {
      toast.error('Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rx) => {
    if (!window.confirm(`Delete prescription #${rx._id} for ${rx.user?.name || 'user'}? This cannot be undone.`)) return;
    try {
      await deletePrescription(rx._id);
      toast.success('Prescription deleted.');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed.'); }
  };

  const openCreateOrder = (rx) => {
    setOrderRx(rx);
    setOrderItems([]);
    setResults([]);
    setSearch('');
    // Prefill from prescription address if available, else user profile
    const pAddr = rx.address || {};
    setAddr({
      phone:   pAddr.phone || rx.user?.phone || '',
      line1:   pAddr.line1 || '',
      line2:   pAddr.line2 || '',
      city:    pAddr.city  || 'New Delhi',
      pincode: pAddr.pincode || '',
    });
  };

  const closeCreateOrder = () => {
    setOrderRx(null);
    setOrderItems([]);
    setResults([]);
    setSearch('');
    setAddr({ phone: '', line1: '', line2: '', city: '', pincode: '' });
  };

  const runSearch = async () => {
    const q = search.trim();
    if (q.length < 2) { toast.error('Type at least 2 letters to search.'); return; }
    setSearching(true);
    try {
      const { data } = await getAdminProducts({ page: 1, limit: 10, search: q });
      setResults(Array.isArray(data?.products) ? data.products : []);
    } catch {
      toast.error('Product search failed.');
    } finally {
      setSearching(false);
    }
  };

  const addItem = (p) => {
    if (!p?._id) return;
    setOrderItems((prev) => {
      const idx = prev.findIndex((x) => x._id === p._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(99, Number(next[idx].qty || 1) + 1) };
        return next;
      }
      return [...prev, { _id: p._id, name: p.name, price: Number(p.price || 0), qty: 1 }];
    });
  };

  const removeItem = (id) => setOrderItems((prev) => prev.filter((x) => x._id !== id));

  const updateQty = (id, qty) => {
    const n = Number(qty);
    if (!Number.isFinite(n)) return;
    setOrderItems((prev) => prev.map((x) => x._id === id ? { ...x, qty: Math.max(1, Math.min(99, n)) } : x));
  };

  const placeOrder = async () => {
    if (!orderRx) return;
    if (!orderItems.length) { toast.error('Add at least one product.'); return; }
    if (!/^\d{10}$/.test(String(addr.phone || '').trim())) { toast.error('10-digit phone required.'); return; }
    if (String(addr.line1 || '').trim().length < 5) { toast.error('Address line1 required.'); return; }
    if (String(addr.city || '').trim().length < 2) { toast.error('City required.'); return; }
    if (!/^\d{6}$/.test(String(addr.pincode || '').trim())) { toast.error('6-digit pincode required.'); return; }

    setPlacing(true);
    try {
      const payload = {
        items: orderItems.map((i) => ({ productId: i._id, qty: Number(i.qty || 1) })),
        address: {
          phone: String(addr.phone || '').trim(),
          line1: String(addr.line1 || '').trim(),
          line2: String(addr.line2 || '').trim(),
          city: String(addr.city || '').trim(),
          pincode: String(addr.pincode || '').trim(),
        },
      };
      const { data } = await createOrderFromPrescription(orderRx._id, payload);
      toast.success(`Order created (#${data?.orderId || ''}).`);
      closeCreateOrder();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create order.');
    } finally {
      setPlacing(false);
    }
  };

  const BADGE = {
    pending:  <span className="admin-rx-badge admin-rx-badge--pending"><Clock size={12}/> Pending</span>,
    approved: <span className="admin-rx-badge admin-rx-badge--approved"><CheckCircle size={12}/> Approved</span>,
    rejected: <span className="admin-rx-badge admin-rx-badge--rejected"><XCircle size={12}/> Rejected</span>,
  };

  return (
    <section className="admin-rx">
      <div className="admin-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2>Prescriptions</h2>
          <span className="admin-count">{total} total</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn--outline btn--sm" onClick={handleExport} disabled={exporting}>
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export XLSX'}
          </button>
          {isSuperAdmin && (
            <button className="btn btn--outline btn--sm" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => setClearModal({ open: true, password: '' })}>
              <Trash2 size={14} /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="admin-rx__filters">
        <Filter size={15} />
        {STATUS_OPTS.map(s => (
          <button key={s || 'all'} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`btn btn--sm ${statusFilter === s ? 'btn--primary' : 'btn--outline'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner" style={{ padding: 60, textAlign: 'center' }}>Loading…</div>
      ) : prescriptions.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--clr-muted)' }}>
          No {statusFilter || ''} prescriptions found.
        </div>
      ) : (
        <div className="admin-rx__grid">
          {prescriptions.map(rx => {
            const isPdf = rx.imageUrl?.toLowerCase().includes('.pdf') || rx.imageUrl?.includes('/raw/');
            return (
              <div key={rx._id} className="admin-rx-card">
                <div className="admin-rx-card__thumb" onClick={() => setPreview(rx)}>
                  {isPdf ? (
                    <div className="admin-rx-card__pdf">PDF</div>
                  ) : (
                    <img src={rx.imageUrl} alt="Rx" />
                  )}
                  <div className="admin-rx-card__overlay"><Eye size={16} /> View</div>
                </div>
                <div className="admin-rx-card__body">
                  {BADGE[rx.status]}
                  <p className="admin-rx-card__user">{rx.user?.name || 'Unknown'}<br/>
                    <small>{rx.user?.email}</small></p>
                  {rx.patientName && <p><strong>Patient:</strong> {rx.patientName}</p>}
                  {rx.doctorName  && <p><strong>Doctor:</strong> {rx.doctorName}</p>}
                  {rx.address && (
                    <p style={{ fontSize: '0.85em', marginTop: 4, color: 'var(--clr-muted)' }}>
                      <strong>Address:</strong><br/>
                      {rx.address.line1}, {rx.address.city} {rx.address.pincode}
                    </p>
                  )}
                  {rx.notes && <p className="admin-rx-card__notes">{rx.notes}</p>}
                  {rx.adminNote && <p className="admin-rx-card__admin-note"><strong>Note:</strong> {rx.adminNote}</p>}
                  <p className="admin-rx-card__date">{fmt(rx.createdAt)}</p>
                </div>
                {rx.status === 'pending' && (
                  <button className="btn btn--primary btn--sm admin-rx-card__review-btn" onClick={() => startReview(rx)}>
                    Review
                  </button>
                )}

                {rx.status === 'approved' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn--outline btn--sm admin-rx-card__review-btn"
                      style={{ flex: 1 }}
                      onClick={() => openCreateOrder(rx)}
                    >
                      Create Order
                    </button>
                    {(!rx.usedInOrders || rx.usedInOrders.length === 0) && (
                      <button
                        className="btn btn--outline btn--sm"
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}
                        title="Delete this approved prescription (no order linked)"
                        onClick={() => handleDelete(rx)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="admin-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn btn--outline btn--sm">← Prev</button>
          <span>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn btn--outline btn--sm">Next →</button>
        </div>
      )}

      {/* Review Modal */}
      {reviewing && (
        <div className="modal-overlay" onClick={() => setReviewing(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Review Prescription</h3>
              <button className="icon-btn" onClick={() => setReviewing(null)}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <p><strong>From:</strong> {reviewing.user?.name} ({reviewing.user?.email})</p>
              {reviewing.patientName && <p><strong>Patient:</strong> {reviewing.patientName}</p>}
              {reviewing.doctorName  && <p><strong>Doctor:</strong> {reviewing.doctorName}</p>}
              {reviewing.notes && <p><strong>Customer notes:</strong> {reviewing.notes}</p>}
            </div>
            <div className="form-group">
              <label>Pharmacist Note (shown to customer)</label>
              <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)}
                placeholder="Reason for rejection, or instructions…" rows={3} maxLength={500} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn--primary" style={{ flex: 1 }} disabled={saving} onClick={() => submitReview('approved')}>
                <CheckCircle size={15} /> Approve
              </button>
              <button className="btn btn--danger" style={{ flex: 1 }} disabled={saving} onClick={() => submitReview('rejected')}>
                <XCircle size={15} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full image preview */}
      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <button className="rx-modal__close" style={{ position: 'fixed', top: 16, right: 16 }} onClick={() => setPreview(null)}>✕</button>
            {(preview.imageUrl?.includes('.pdf') || preview.imageUrl?.includes('/raw/')) ? (
              <iframe src={preview.imageUrl} title="Prescription" style={{ width: '80vw', height: '85vh', border: 'none' }} />
            ) : (
              <img src={preview.imageUrl} alt="Prescription" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12 }} />
            )}
          </div>
        </div>
      )}

      {/* Create Order Modal */}
      {orderRx && (
        <div className="modal-overlay" onClick={closeCreateOrder}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Create Order from Prescription</h3>
              <button className="icon-btn" onClick={closeCreateOrder}><X size={18} /></button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <p style={{ margin: 0 }}><strong>Customer:</strong> {orderRx.user?.name} ({orderRx.user?.email})</p>
              <p style={{ margin: 0, color: 'var(--clr-muted)' }}>
                Prescription ID: {orderRx._id}
              </p>
            </div>

            <div className="form-group" style={{ display: 'flex', gap: 10 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products (name/brand/salt)…"
                style={{ flex: 1 }}
              />
              <button className="btn btn--outline" type="button" disabled={searching} onClick={runSearch}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {results.length > 0 && (
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                {results.map((p) => (
                  <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px dashed var(--clr-border)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--clr-muted)' }}>₹{Number(p.price || 0)}</div>
                    </div>
                    <button className="btn btn--primary btn--sm" type="button" onClick={() => addItem(p)}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )}

            <h4 style={{ margin: '6px 0 10px' }}>Selected items</h4>
            {orderItems.length === 0 ? (
              <div style={{ padding: '10px 0', color: 'var(--clr-muted)' }}>No items selected yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {orderItems.map((i) => (
                  <div key={i._id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{i.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--clr-muted)' }}>₹{Number(i.price || 0)}</div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={i.qty}
                      onChange={(e) => updateQty(i._id, e.target.value)}
                      style={{ width: 80 }}
                    />
                    <button className="btn btn--danger btn--sm" type="button" onClick={() => removeItem(i._id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <h4 style={{ margin: '6px 0 10px' }}>Delivery address</h4>
            <div className="family-form__grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div className="form-group">
                <label>Phone *</label>
                <input value={addr.phone} onChange={(e) => setAddr((a) => ({ ...a, phone: e.target.value }))} placeholder="10-digit phone" maxLength={10} />
              </div>
              <div className="form-group">
                <label>Pincode *</label>
                <input value={addr.pincode} onChange={(e) => setAddr((a) => ({ ...a, pincode: e.target.value }))} placeholder="110025" maxLength={6} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Address line 1 *</label>
                <input value={addr.line1} onChange={(e) => setAddr((a) => ({ ...a, line1: e.target.value }))} placeholder="House no, street, area" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Address line 2</label>
                <input value={addr.line2} onChange={(e) => setAddr((a) => ({ ...a, line2: e.target.value }))} placeholder="Landmark, etc." />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>City *</label>
                <input value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} placeholder="New Delhi" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn--outline" type="button" onClick={closeCreateOrder}>Cancel</button>
              <button className="btn btn--primary" type="button" disabled={placing} onClick={placeOrder}>
                {placing ? 'Creating…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear prescriptions modal ── */}
      {clearModal.open && (
        <div className="import-modal-overlay" onClick={() => setClearModal({ open: false, password: '' })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="import-modal__close" onClick={() => setClearModal({ open: false, password: '' })}><X size={18} /></button>
            <h2 style={{ marginBottom: 10, color: '#ef4444' }}>⚠️ Clear All Prescriptions</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: 18 }}>
              This will permanently delete <strong>all prescriptions</strong>. Enter your password to confirm.
            </p>
            <input
              type="password"
              autoFocus
              placeholder="Your admin password"
              value={clearModal.password}
              onChange={e => setClearModal(m => ({ ...m, password: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleClear()}
              style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #ef4444', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" style={{ background: '#ef4444', borderColor: '#ef4444', flex: 1 }} onClick={handleClear}>Delete All</button>
              <button className="btn btn--outline" onClick={() => setClearModal({ open: false, password: '' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
