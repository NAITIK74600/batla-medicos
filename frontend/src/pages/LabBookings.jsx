import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyLabBookings, cancelLabBooking } from '../api/lab';
import toast from 'react-hot-toast';
import { FlaskConical, Calendar, Clock, Home, MapPin, FileText, ExternalLink, XCircle } from 'lucide-react';

const STATUS_COLOR = {
  pending:          { bg: '#FFF7ED', color: '#D97706' },
  confirmed:        { bg: '#EFF6FF', color: '#2563EB' },
  sample_collected: { bg: '#F0FBF4', color: '#1B8843' },
  processing:       { bg: '#FDF4FF', color: '#9333EA' },
  report_ready:     { bg: '#ECFDF5', color: '#059669' },
  completed:        { bg: '#F0FBF4', color: '#1B8843' },
  cancelled:        { bg: '#FEF2F2', color: '#C0392B' },
};

const STATUS_LABEL = {
  pending: 'Pending', confirmed: 'Confirmed', sample_collected: 'Sample Collected',
  processing: 'Processing', report_ready: 'Report Ready', completed: 'Completed', cancelled: 'Cancelled',
};

const STEPS = ['pending', 'confirmed', 'sample_collected', 'processing', 'report_ready', 'completed'];

export default function LabBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');
  const [cancelling, setCancelling] = useState(null);

  const load = () => {
    setLoading(true);
    getMyLabBookings({ limit: 50, ...(filter !== 'all' && { status: filter }) })
      .then(r => setBookings(r.data?.bookings || []))
      .catch(() => toast.error('Failed to load bookings.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]); // eslint-disable-line

  const handleCancel = async (id) => {
    if (!confirm('Cancel this booking?')) return;
    setCancelling(id);
    try {
      await cancelLabBooking(id);
      toast.success('Booking cancelled.');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Cancellation failed.');
    } finally { setCancelling(null); }
  };

  return (
    <div className="lab-page">
      <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FlaskConical size={22} color="var(--primary)" /> My Lab Bookings
            </h1>
            <p style={{ color: 'var(--gray-500)', fontSize: 14, marginTop: 2 }}>Track your test bookings and download reports</p>
          </div>
          <Link to="/lab" className="btn btn--primary" style={{ fontSize: 14 }}>+ Book New Test</Link>
        </div>

        {/* Filter tabs */}
        <div className="lab-cat-tabs" style={{ marginBottom: 20 }}>
          {['all', 'pending', 'confirmed', 'sample_collected', 'processing', 'report_ready', 'completed', 'cancelled'].map(s => (
            <button key={s} className={`lab-cat-tab ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--gray-500)' }}>Loading bookings…</div>
        ) : bookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <FlaskConical size={48} color="var(--gray-300)" strokeWidth={1} />
            <p style={{ color: 'var(--gray-500)', marginTop: 12 }}>No bookings found.</p>
            <Link to="/lab" className="btn btn--primary" style={{ marginTop: 16, display: 'inline-flex' }}>Book a Test</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {bookings.map(b => {
              const sc = STATUS_COLOR[b.status] || STATUS_COLOR.pending;
              const stepIdx = STEPS.indexOf(b.status);
              return (
                <div key={b._id} className="lab-booking-card">
                  <div className="lab-booking-card__header">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {b.testSnapshots?.map(t => t.name).join(' + ') || 'Lab Test'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={12} /> {new Date(b.bookingDate).toLocaleDateString('en-IN')}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} /> {b.slot}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {b.collectionType === 'home' ? <Home size={12} /> : <MapPin size={12} />}
                          {b.collectionType === 'home' ? 'Home Collection' : 'Walk In'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span className="lab-status-badge" style={{ background: sc.bg, color: sc.color }}>
                        {STATUS_LABEL[b.status]}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>₹{b.totalAmount}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {b.status !== 'cancelled' && (
                    <div className="lab-progress">
                      {STEPS.map((s, i) => (
                        <div key={s} className={`lab-progress__step ${i <= stepIdx ? 'done' : ''} ${i === stepIdx ? 'current' : ''}`}>
                          <div className="lab-progress__dot" />
                          <div className="lab-progress__label">{STATUS_LABEL[s]}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Report */}
                  {b.reportUrl && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: '#ECFDF5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: '#059669' }}>
                        <FileText size={14} /> Report Available
                        {b.reportNotes && <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}>— {b.reportNotes}</span>}
                      </span>
                      <a href={b.reportUrl} target="_blank" rel="noopener noreferrer" className="btn btn--sm btn--primary" style={{ background: '#059669', borderColor: '#059669' }}>
                        <ExternalLink size={13} /> View / Download
                      </a>
                    </div>
                  )}

                  {/* Cancel */}
                  {['pending', 'confirmed'].includes(b.status) && (
                    <div style={{ marginTop: 10, textAlign: 'right' }}>
                      <button className="btn btn--sm btn--outline" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                        disabled={cancelling === b._id}
                        onClick={() => handleCancel(b._id)}>
                        <XCircle size={13} /> {cancelling === b._id ? 'Cancelling…' : 'Cancel Booking'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
