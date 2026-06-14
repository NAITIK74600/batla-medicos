import { useEffect, useState } from 'react';
import { getAvailabilityRequests, updateAvailabilityRequestStatus, deleteAvailabilityRequest } from '../../api/admin';
import toast from 'react-hot-toast';
import { Clock, CheckCircle, XCircle, Eye, Trash2, Filter } from 'lucide-react';

function fmt(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLORS = {
  pending: '#f59e0b',
  reviewed: '#3b82f6',
  fulfilled: '#10b981',
  rejected: '#ef4444',
};

const STATUS_ICONS = {
  pending: Clock,
  reviewed: Eye,
  fulfilled: CheckCircle,
  rejected: XCircle,
};

const STATUS_OPTS = ['', 'pending', 'reviewed', 'fulfilled', 'rejected'];

export default function AdminRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await getAvailabilityRequests(params);
      setRequests(data.requests || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch {
      toast.error('Failed to load requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, page]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateAvailabilityRequestStatus(id, newStatus);
      toast.success(`Status updated to ${newStatus}.`);
      load();
    } catch {
      toast.error('Failed to update status.');
    }
  };

  const handleDelete = async (req) => {
    if (!window.confirm(`Delete request for "${req.medicineName}"?`)) return;
    try {
      await deleteAvailabilityRequest(req._id);
      toast.success('Request deleted.');
      load();
    } catch {
      toast.error('Failed to delete.');
    }
  };

  return (
    <div className="admin-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          Medicine Requests
          {!loading && <span style={{ fontWeight: 400, fontSize: 14, color: '#888', marginLeft: 8 }}>({total})</span>}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={15} color="#888" />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}
          >
            <option value="">All</option>
            {STATUS_OPTS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          <Clock size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p>No requests found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {requests.map(req => {
            const Icon = STATUS_ICONS[req.status] || Clock;
            return (
              <div key={req._id} style={{
                background: '#fff', borderRadius: 10, padding: '16px 20px',
                border: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{req.medicineName}</h3>
                    {req.searchQuery && req.searchQuery !== req.medicineName && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>Search: "{req.searchQuery}"</p>
                    )}
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: `${STATUS_COLORS[req.status]}18`, color: STATUS_COLORS[req.status],
                    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  }}>
                    <Icon size={13} /> {req.status}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: '#555' }}>
                  {req.customerName && <span><strong>Name:</strong> {req.customerName}</span>}
                  {req.phone && <span><strong>Phone:</strong> {req.phone}</span>}
                  {req.email && <span><strong>Email:</strong> {req.email}</span>}
                  <span><strong>Date:</strong> {fmt(req.createdAt)}</span>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {req.status === 'pending' && (
                    <>
                      <button onClick={() => handleStatusChange(req._id, 'reviewed')} style={btnStyle('#3b82f6')}>Mark Reviewed</button>
                      <button onClick={() => handleStatusChange(req._id, 'fulfilled')} style={btnStyle('#10b981')}>Fulfilled</button>
                      <button onClick={() => handleStatusChange(req._id, 'rejected')} style={btnStyle('#ef4444')}>Reject</button>
                    </>
                  )}
                  {req.status === 'reviewed' && (
                    <>
                      <button onClick={() => handleStatusChange(req._id, 'fulfilled')} style={btnStyle('#10b981')}>Fulfilled</button>
                      <button onClick={() => handleStatusChange(req._id, 'rejected')} style={btnStyle('#ef4444')}>Reject</button>
                    </>
                  )}
                  {(req.status === 'fulfilled' || req.status === 'rejected') && (
                    <button onClick={() => handleStatusChange(req._id, 'pending')} style={btnStyle('#f59e0b')}>Reopen</button>
                  )}
                  <button onClick={() => handleDelete(req)} style={{ ...btnStyle('#888'), marginLeft: 'auto' }}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pageBtnStyle}>← Prev</button>
          <span style={{ padding: '6px 12px', fontSize: 13 }}>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={pageBtnStyle}>Next →</button>
        </div>
      )}
    </div>
  );
}

const btnStyle = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '5px 12px', borderRadius: 6, border: `1px solid ${color}`,
  background: 'transparent', color, fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
});

const pageBtnStyle = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd',
  background: '#fff', cursor: 'pointer', fontSize: 13,
};
