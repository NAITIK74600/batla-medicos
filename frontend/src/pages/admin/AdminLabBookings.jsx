import { useEffect, useState } from 'react';
import { getAdminLabBookings, updateLabBookingStatus, uploadLabReport, exportLabBookings, clearLabBookings } from '../../api/lab';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { FlaskConical, Calendar, Clock, Home, MapPin, FileText, Upload, X, ChevronDown, Download, Trash2 } from 'lucide-react';

const STATUS_LIST = ['pending','confirmed','sample_collected','processing','report_ready','completed','cancelled'];
const STATUS_LABEL = {
  pending: 'Pending', confirmed: 'Confirmed', sample_collected: 'Sample Collected',
  processing: 'Processing', report_ready: 'Report Ready', completed: 'Completed', cancelled: 'Cancelled',
};
const STATUS_COLOR = {
  pending:          { bg: '#FFF7ED', color: '#D97706' },
  confirmed:        { bg: '#EFF6FF', color: '#2563EB' },
  sample_collected: { bg: '#F0FBF4', color: '#1B8843' },
  processing:       { bg: '#FDF4FF', color: '#9333EA' },
  report_ready:     { bg: '#ECFDF5', color: '#059669' },
  completed:        { bg: '#F0FBF4', color: '#1B8843' },
  cancelled:        { bg: '#FEF2F2', color: '#C0392B' },
};

export default function AdminLabBookings() {
  const [bookings,  setBookings]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [pages,     setPages]     = useState(1);
  const [trigger,   setTrigger]   = useState(0);
  const refresh = () => setTrigger(t => t + 1);

  const [statusF, setStatusF] = useState('all');
  const [search,  setSearch]  = useState('');
  const [dateF,   setDateF]   = useState('');

  // report modal
  const [reportModal, setReportModal] = useState({ open: false, id: null, url: '', notes: '' });
  const [exporting, setExporting] = useState(false);
  const [clearModal, setClearModal] = useState({ open: false, password: '' });
  const { isSuperAdmin } = useAuth();

  useEffect(() => {
    setLoading(true);
    getAdminLabBookings({
      page, limit: 20,
      status: statusF !== 'all' ? statusF : undefined,
      search: search || undefined,
      date: dateF || undefined,
    })
      .then(r => { setBookings(r.data.bookings || []); setTotal(r.data.total || 0); setPages(r.data.pages || 1); })
      .catch(() => toast.error('Failed to load.'))
      .finally(() => setLoading(false));
  }, [page, statusF, search, dateF, trigger]);

  const handleStatus = async (id, status) => {
    try {
      await updateLabBookingStatus(id, status);
      toast.success(`Status → ${STATUS_LABEL[status]}`);
      refresh();
    } catch (err) { toast.error(err?.response?.data?.message || 'Error.'); }
  };

  const handleReport = async () => {
    if (!reportModal.url.trim()) { toast.error('Report URL required.'); return; }
    try {
      await uploadLabReport(reportModal.id, { reportUrl: reportModal.url, reportNotes: reportModal.notes });
      toast.success('Report uploaded. Status → Report Ready.');
      setReportModal({ open: false, id: null, url: '', notes: '' });
      refresh();
    } catch (err) { toast.error(err?.response?.data?.message || 'Error.'); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await exportLabBookings({ status: statusF !== 'all' ? statusF : undefined, search: search || undefined, date: dateF || undefined });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `lab-bookings-${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
      toast.success('Lab bookings exported!');
    } catch { toast.error('Export failed.'); }
    finally { setExporting(false); }
  };

  const handleClear = async () => {
    if (!clearModal.password) { toast.error('Enter your password.'); return; }
    try {
      const { data } = await clearLabBookings(clearModal.password);
      toast.success(data.message);
      setClearModal({ open: false, password: '' });
      refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to clear.'); }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title"><FlaskConical size={20} /> Lab Bookings</h1>
          <p className="admin-page__sub">{total} total bookings</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn--outline" onClick={handleExport} disabled={exporting}>
            <Download size={15} /> {exporting ? 'Exporting…' : 'Export XLSX'}
          </button>
          {isSuperAdmin && (
            <button className="btn btn--outline" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => setClearModal({ open: true, password: '' })}>
              <Trash2 size={15} /> Clear All Bookings
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="admin-filter-bar" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="admin-filter-bar__search" placeholder="Search patient / phone…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select className="admin-filter-bar__select" value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }}>
          <option value="all">All Status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input type="date" className="admin-filter-bar__select" value={dateF} onChange={e => { setDateF(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
        {(statusF !== 'all' || search || dateF) && (
          <button className="btn btn--sm btn--outline" onClick={() => { setStatusF('all'); setSearch(''); setDateF(''); }}>× Clear</button>
        )}
      </div>

      {/* Table */}
      {loading ? <div className="admin-state-msg">Loading…</div> : bookings.length === 0 ? (
        <div className="admin-state-msg">No bookings found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bookings.map(b => {
            const sc = STATUS_COLOR[b.status] || STATUS_COLOR.pending;
            return (
              <div key={b._id} className="lab-booking-card">
                <div className="lab-booking-card__header">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{b.patientName}</span>
                      <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{b.phone}</span>
                      {b.user && <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>({b.user.name} · {b.user.email})</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 4 }}>
                      {b.testSnapshots?.map(t => t.name).join(' + ')}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} /> {new Date(b.bookingDate).toLocaleDateString('en-IN')}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> {b.slot}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {b.collectionType === 'home' ? <Home size={12} /> : <MapPin size={12} />}
                        {b.collectionType === 'home'
                          ? `Home — ${b.address?.line1 || ''}, ${b.address?.city || ''}`
                          : 'Walk In'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span className="lab-status-badge" style={{ background: sc.bg, color: sc.color }}>{STATUS_LABEL[b.status]}</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>₹{b.totalAmount}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {/* Status dropdown */}
                  <div style={{ position: 'relative' }}>
                    <select
                      className="admin-filter-bar__select"
                      style={{ fontSize: 12, padding: '5px 10px' }}
                      value={b.status}
                      onChange={e => handleStatus(b._id, e.target.value)}
                    >
                      {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </div>

                  {/* Upload report */}
                  <button className="btn btn--sm btn--outline" style={{ fontSize: 12 }}
                    onClick={() => setReportModal({ open: true, id: b._id, url: b.reportUrl || '', notes: b.reportNotes || '' })}>
                    <Upload size={13} /> {b.reportUrl ? 'Update Report' : 'Upload Report'}
                  </button>

                  {/* View existing report */}
                  {b.reportUrl && (
                    <a href={b.reportUrl} target="_blank" rel="noopener noreferrer" className="btn btn--sm btn--outline" style={{ fontSize: 12, color: '#059669', borderColor: '#059669' }}>
                      <FileText size={13} /> View Report
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && pages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&laquo; Prev</button>
          <span>Page {page} / {pages} · {total} bookings</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next &raquo;</button>
        </div>
      )}

      {/* Report Upload Modal */}
      {reportModal.open && (
        <div className="import-modal-overlay" onClick={() => setReportModal({ open: false, id: null, url: '', notes: '' })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <button className="import-modal__close" onClick={() => setReportModal({ open: false, id: null, url: '', notes: '' })}><X size={18} /></button>
            <h2 style={{ marginBottom: 20 }}>Upload Test Report</h2>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Report URL (Google Drive / Cloudinary / any public link) *</label>
              <input
                autoFocus
                type="url"
                value={reportModal.url}
                onChange={e => setReportModal(m => ({ ...m, url: e.target.value }))}
                placeholder="https://drive.google.com/…"
                style={{ width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Notes (optional)</label>
              <input
                value={reportModal.notes}
                onChange={e => setReportModal(m => ({ ...m, notes: e.target.value }))}
                placeholder="e.g. All values normal"
                style={{ width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>Saving will set status to "Report Ready" automatically.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" style={{ flex: 1 }} onClick={handleReport}><Upload size={14} /> Save Report</button>
              <button className="btn btn--outline" onClick={() => setReportModal({ open: false, id: null, url: '', notes: '' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Clear confirmation modal ── */}
      {clearModal.open && (
        <div className="import-modal-overlay" onClick={() => setClearModal({ open: false, password: '' })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="import-modal__close" onClick={() => setClearModal({ open: false, password: '' })}><X size={18} /></button>
            <h2 style={{ marginBottom: 10, color: '#ef4444' }}>⚠️ Clear All Lab Bookings</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: 18 }}>
              This will permanently delete <strong>all lab bookings</strong>. Enter your password to confirm.
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
    </div>
  );
}
