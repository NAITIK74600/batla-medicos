import { useEffect, useState } from 'react';
import { getAuditLog, clearAuditLog } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function AdminAuditLog() {
  const { isSuperAdmin } = useAuth();
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [clearModal, setClearModal] = useState(false);
  const [clearPass, setClearPass] = useState('');
  const [clearing, setClearing] = useState(false);

  const fetchLogs = () => {
    getAuditLog({ page, limit: 50 }).then(r => {
      setLogs(r.data.logs || []);
      setPages(r.data.pages || 1);
    }).catch(() => {});
  };

  useEffect(() => { fetchLogs(); }, [page]);

  const handleClear = async () => {
    if (!clearPass) { toast.error('Enter your password.'); return; }
    setClearing(true);
    try {
      const { data } = await clearAuditLog(clearPass);
      toast.success(data.message);
      setLogs([]);
      setPages(1);
      setPage(1);
      setClearModal(false);
      setClearPass('');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to clear logs.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="admin-page">
      {/* Clear Modal */}
      {clearModal && (
        <div className="modal-backdrop" onClick={() => { setClearModal(false); setClearPass(''); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <button className="modal-box__close" onClick={() => { setClearModal(false); setClearPass(''); }}>✕</button>
            <h3 style={{ marginBottom: 8 }}>⚠️ Clear All Audit Logs</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginBottom: 16, lineHeight: 1.5 }}>
              This will permanently delete <strong>all audit log entries</strong>. This action cannot be undone.
              Enter your superadmin password to confirm.
            </p>
            <input
              type="password"
              placeholder="Your password"
              value={clearPass}
              onChange={e => setClearPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClear()}
              autoFocus
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', marginBottom: 14, fontSize: '0.9rem' }}
            />
            <button
              className="btn btn--primary"
              style={{ width: '100%', background: '#C0392B', borderColor: '#C0392B' }}
              onClick={handleClear}
              disabled={clearing}
            >
              {clearing ? 'Clearing…' : '🗑️ Clear All Logs'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Audit Log</h1>
        {isSuperAdmin && (
          <button
            className="btn btn--outline"
            style={{ fontSize: '0.8rem', padding: '6px 14px', borderColor: '#C0392B', color: '#C0392B' }}
            onClick={() => setClearModal(true)}
          >
            🗑️ Clear All Logs
          </button>
        )}
      </div>
      {/* Mobile cards */}
      <div className="audit-cards">
        {logs.map(log => (
          <div key={log._id} className="audit-card">
            <div className="audit-card__top">
              <span className="audit-action">{log.action}</span>
              <span className="audit-card__time">
                {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="audit-card__row">
              <span className="audit-card__label">Actor</span>
              <span>{log.actorId?.name || log.actorEmail || '—'}</span>
            </div>
            <div className="audit-card__row">
              <span className="audit-card__label">Model</span>
              <span>{log.targetModel || '—'}</span>
            </div>
            <div className="audit-card__row">
              <span className="audit-card__label">IP</span>
              <span className="mono" style={{ fontSize: '0.78rem' }}>{log.ip || '—'}</span>
            </div>
          </div>
        ))}
        {logs.length === 0 && <p style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '40px 0' }}>No logs found.</p>}
      </div>

      {/* Desktop table */}
      <div className="audit-table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Time</th><th>Actor</th><th>Action</th><th>Model</th><th>IP</th></tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log._id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{new Date(log.createdAt).toLocaleString('en-IN')}</td>
                <td>{log.actorId?.name || log.actorEmail}</td>
                <td><span className="audit-action">{log.action}</span></td>
                <td>{log.targetModel}</td>
                <td className="mono" style={{ fontSize: '0.8rem' }}>{log.ip}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>No logs found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    </div>
  );
}
