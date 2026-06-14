import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uploadPrescription, getMyPrescriptions, deletePrescription } from '../api/prescriptions';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Upload, Trash2, Eye, FileText, CheckCircle, XCircle, Clock, MapPin, User, Sparkles, AlignLeft, LocateFixed } from 'lucide-react';
import api from '../api/axios';
import { getGeoPosition, GEO_ERROR_MESSAGES } from '../utils/geo';

function statusBadge(status) {
  const map = {
    pending:  { label: 'Under Review', cls: 'rx-badge rx-badge--pending',  icon: <Clock size={12} /> },
    approved: { label: 'Approved',     cls: 'rx-badge rx-badge--approved', icon: <CheckCircle size={12} /> },
    rejected: { label: 'Rejected',     cls: 'rx-badge rx-badge--rejected', icon: <XCircle size={12} /> },
  };
  return map[status] || map.pending;
}

function fmt(d) {
  try {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]   = useState(null); // {url, isPdf}
  const [form, setForm]         = useState({ notes: '', doctorName: '', patientName: '' });
  const [file, setFile]         = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [lastUploadedId, setLastUploadedId] = useState(null);
  const [addr, setAddr] = useState({ line1: '', line2: '', city: 'New Delhi', pincode: '', phone: '' });
  const [useProfileAddr, setUseProfileAddr] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const { user } = useAuth();
  const fileRef = useRef(null);

  // Auto-fill address when user data loads
  useEffect(() => {
    if (user) {
      const firstAddr = user.addresses?.[0];
      if (firstAddr) {
        setAddr({
          line1: firstAddr.line1 || '',
          line2: firstAddr.line2 || '',
          city: firstAddr.city || 'New Delhi',
          pincode: firstAddr.pincode || '',
          phone: user.phone || '',
        });
        setUseProfileAddr(true);
      } else if (user.phone) {
        setAddr(a => ({ ...a, phone: user.phone }));
      }
    }
  }, [user]);

  const handleAutoFillLocation = async () => {
    setLocLoading(true);
    const { position, error } = await getGeoPosition();
    if (error) {
      setLocLoading(false);
      toast.error(GEO_ERROR_MESSAGES[error]);
      return;
    }
    const { latitude: lat, longitude: lng } = position.coords;
    try {
      const { data } = await api.get('/geocode/reverse', { params: { lat, lng } });
      const { line1, line2, city, pincode } = data;
      if (!line1 && !city) throw new Error('Empty address returned');
      setAddr(a => ({
        ...a,
        line1: line1 || a.line1,
        line2: line2 || a.line2,
        city:  city  || a.city,
        pincode: (pincode && /^\d{6}$/.test(pincode)) ? pincode : a.pincode,
      }));
      toast.success('✅ Address auto-filled from your location!');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not fetch address. Please fill manually.');
    } finally { setLocLoading(false); }
  };

  const toggleProfileAddr = () => {
    if (!useProfileAddr) {
      if (user?.addresses?.length > 0) {
        const a = user.addresses[0];
        setAddr({
          line1: a.line1 || '',
          line2: a.line2 || '',
          city: a.city || 'New Delhi',
          pincode: a.pincode || '',
          phone: user.phone || '',
        });
        setUseProfileAddr(true);
      } else {
        toast('No saved address found in profile.');
      }
    } else {
      setUseProfileAddr(false);
    }
  };

  const load = () => {
    setLoading(true);
    getMyPrescriptions()
      .then(r => {
        const data = r.data;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.prescriptions)
            ? data.prescriptions
            : [];
        setPrescriptions(list.filter(Boolean));
      })
      .catch(() => toast.error('Failed to load prescriptions.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleFile = (f) => {
    if (!f) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(f.type)) { toast.error('Only JPG, PNG, WebP, or PDF allowed.'); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error('File must be under 5 MB.'); return; }
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) { toast.error('Please select a file first.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('notes',       form.notes);
      fd.append('doctorName',  form.doctorName);
      fd.append('patientName', form.patientName);
      
      // Validate address if provided partially
      if (addr.line1 || addr.pincode) {
           if (addr.line1.length < 5) { toast.error('Address line 1 is too short'); setUploading(false); return; }
           if (!/^\d{6}$/.test(addr.pincode)) { toast.error('Invalid pincode'); setUploading(false); return; }
           fd.append('address', JSON.stringify(addr));
      }

      const res = await uploadPrescription(fd);
      toast.success('Prescription uploaded! Under review.');
      setFile(null);
      setForm({ notes: '', doctorName: '', patientName: '' });
      setLastUploadedId(res?.data?._id || null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this prescription?')) return;
    try {
      await deletePrescription(id);
      toast.success('Deleted.');
      setPrescriptions(prev => prev.filter(p => p._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed.');
    }
  };

  return (
    <main className="rx-page container">

      {/* ── Hero Header ── */}
      <div className="rx-hero">
        <div className="rx-hero__left">
          <div className="rx-hero__icon-wrap"><FileText size={26} /></div>
          <div>
            <h1 className="rx-hero__title">My Prescriptions</h1>
            <p className="rx-hero__sub">Upload your prescription — our pharmacist reviews it within a few hours and contacts you.</p>
          </div>
        </div>
        <nav className="rx-hero__crumb">
          <Link to="/">Home</Link> <span>/</span> <span>Prescriptions</span>
        </nav>
      </div>

      {/* ── Upload Card ── */}
      <section className="rx-upload-card">
        <form onSubmit={handleUpload} className="rx-upload-form">

          {/* Step 1 — File */}
          <div className="rx-step">
            <div className="rx-step__head">
              <span className="rx-step__num">1</span>
              <span className="rx-step__title"><Upload size={15} /> Upload File</span>
            </div>
            <div
              className={`rx-dropzone${dragOver ? ' rx-dropzone--over' : ''}${file ? ' rx-dropzone--has-file' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])} />
              {file ? (
                <div className="rx-dropzone__file">
                  <FileText size={38} />
                  <span>{file.name}</span>
                  <span className="rx-dropzone__size">{(file.size / 1024).toFixed(0)} KB</span>
                  <button type="button" className="rx-dropzone__change"
                    onClick={e => { e.stopPropagation(); setFile(null); }}>Change file</button>
                </div>
              ) : (
                <div className="rx-dropzone__prompt">
                  <div className="rx-dropzone__icon-circle"><Upload size={26} /></div>
                  <span>Drag &amp; drop or <strong>click to browse</strong></span>
                  <small>JPG · PNG · WebP · PDF &nbsp;·&nbsp; Max 5 MB</small>
                </div>
              )}
            </div>
          </div>

          {/* Step 2 — Patient Details */}
          <div className="rx-step">
            <div className="rx-step__head">
              <span className="rx-step__num">2</span>
              <span className="rx-step__title"><User size={15} /> Patient Details</span>
              <span className="rx-step__optional">Optional</span>
            </div>
            <div className="rx-upload-fields">
              <div className="form-group">
                <label>Patient Name</label>
                <input value={form.patientName}
                  onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
                  placeholder="Full name on prescription" maxLength={100} />
              </div>
              <div className="form-group">
                <label>Doctor / Hospital</label>
                <input value={form.doctorName}
                  onChange={e => setForm(f => ({ ...f, doctorName: e.target.value }))}
                  placeholder="Dr. name or clinic name" maxLength={100} />
              </div>
            </div>
          </div>

          {/* Step 3 — Delivery Address */}
          <div className="rx-step">
            <div className="rx-step__head">
              <span className="rx-step__num">3</span>
              <span className="rx-step__title"><MapPin size={15} /> Delivery Address</span>
              {user?.addresses?.length > 0 && (
                <button
                  type="button"
                  className={`rx-autofill-btn${useProfileAddr ? ' rx-autofill-btn--active' : ''}`}
                  onClick={toggleProfileAddr}
                >
                  {useProfileAddr
                    ? <><CheckCircle size={13} /> Saved address applied</>  
                    : <><Sparkles size={13} /> Use saved address</>}
                </button>
              )}
              <button
                type="button"
                className="rx-autofill-btn"
                onClick={handleAutoFillLocation}
                disabled={locLoading}
                title="Fill address from your current GPS location"
              >
                {locLoading
                  ? 'Locating…'
                  : <><LocateFixed size={13} /> Use my location</>}
              </button>
            </div>
            <div className="rx-upload-fields">
              <div className="form-group">
                <label>Phone Number</label>
                <input value={addr.phone}
                  onChange={e => setAddr(a => ({ ...a, phone: e.target.value }))}
                  placeholder="10-digit mobile number" maxLength={10} />
              </div>
              <div className="form-group">
                <label>Pincode</label>
                <input value={addr.pincode}
                  onChange={e => setAddr(a => ({ ...a, pincode: e.target.value }))}
                  placeholder="6-digit pincode" maxLength={6} />
              </div>
              <div className="form-group rx-full-col">
                <label>Address Line 1</label>
                <input value={addr.line1}
                  onChange={e => setAddr(a => ({ ...a, line1: e.target.value }))}
                  placeholder="House no., building, street name" />
              </div>
              <div className="form-group">
                <label>City</label>
                <input value={addr.city}
                  onChange={e => setAddr(a => ({ ...a, city: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Address Line 2 <small>(optional)</small></label>
                <input value={addr.line2}
                  onChange={e => setAddr(a => ({ ...a, line2: e.target.value }))}
                  placeholder="Apartment, area, landmark" />
              </div>
            </div>
            <p className="rx-step__hint"><MapPin size={13} /> Adding an address helps us confirm stock and deliver faster.</p>
          </div>

          {/* Step 4 — Notes + Submit */}
          <div className="rx-step rx-step--last">
            <div className="rx-step__head">
              <span className="rx-step__num">4</span>
              <span className="rx-step__title"><AlignLeft size={15} /> Additional Notes</span>
              <span className="rx-step__optional">Optional</span>
            </div>
            <div className="form-group">
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any special instructions for the pharmacist… e.g. 'need urgently' or 'generic substitute ok'"
                rows={3} maxLength={500} />
            </div>
            <button type="submit" className="btn btn--primary rx-submit-btn" disabled={uploading || !file}>
              {uploading ? 'Uploading…' : <><Upload size={17} /> Upload Prescription</>}
            </button>
            {lastUploadedId && !uploading && (
              <div className="rx-after-upload">
                <CheckCircle size={18} />
                <span>Uploaded successfully!</span>
                <Link to="/" className="btn btn--outline btn--sm">Continue Shopping</Link>
              </div>
            )}
          </div>

        </form>
      </section>

      {/* ── Uploaded Prescriptions List ── */}
      <section className="rx-list">
        <h2 className="rx-list__title">
          Uploaded Prescriptions
          {prescriptions.length > 0 && <span className="rx-list__count">{prescriptions.length}</span>}
        </h2>
        {loading ? (
          <div className="rx-spinner-wrap"><p>Loading…</p></div>
        ) : prescriptions.length === 0 ? (
          <div className="rx-empty">
            <div className="rx-empty__icon"><FileText size={42} /></div>
            <p>No prescriptions uploaded yet.</p>
            <small>Upload your first prescription using the form above.</small>
          </div>
        ) : (
          <div className="rx-grid">
            {prescriptions.map(rx => {
              const badge = statusBadge(rx.status);
              const isPdf = rx.imageUrl?.toLowerCase().includes('.pdf') || rx.imageUrl?.includes('/raw/');
              return (
                <div key={rx._id} className="rx-card">
                  <div className="rx-card__thumb" onClick={() => setPreview({ url: rx.imageUrl, isPdf })}>
                    {isPdf ? (
                      <div className="rx-card__pdf-icon"><FileText size={40} /></div>
                    ) : (
                      <img src={rx.imageUrl} alt="Prescription" loading="lazy" />
                    )}
                    <div className="rx-card__overlay"><Eye size={16} /> View</div>
                  </div>
                  <div className="rx-card__body">
                    <span className={badge.cls}>{badge.icon} {badge.label}</span>
                    {rx.patientName && <p><strong>Patient:</strong> {rx.patientName}</p>}
                    {rx.doctorName && <p><strong>Doctor:</strong> {rx.doctorName}</p>}
                    {rx.adminNote && (
                      <div className="rx-card__admin-note"><strong>Pharmacist:</strong> {rx.adminNote}</div>
                    )}
                    {rx.address && (
                      <div className="rx-card__address">
                        <MapPin size={11} />
                        {rx.address.line1}, {rx.address.city} {rx.address.pincode}
                      </div>
                    )}
                    <p className="rx-card__date">{fmt(rx.createdAt)}</p>
                    {rx.usedInOrders?.length > 0 && (
                      <p className="rx-card__used"><CheckCircle size={11} /> Used in {rx.usedInOrders.length} order(s)</p>
                    )}
                  </div>
                  <div className="rx-card__actions">
                    <button className="btn btn--outline btn--sm"
                      onClick={() => setPreview({ url: rx.imageUrl, isPdf })}>
                      <Eye size={14} /> View
                    </button>
                    {rx.status === 'pending' && (!rx.usedInOrders || rx.usedInOrders.length === 0) && (
                      <button className="btn btn--danger btn--sm" onClick={() => handleDelete(rx._id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Preview Modal ── */}
      {preview && (
        <div className="rx-modal" onClick={() => setPreview(null)}>
          <div className="rx-modal__box" onClick={e => e.stopPropagation()}>
            <button className="rx-modal__close" onClick={() => setPreview(null)}>✕</button>
            {preview.isPdf ? (
              <iframe src={preview.url} title="Prescription PDF"
                style={{ width: '80vw', height: '80vh', border: 'none' }} />
            ) : (
              <img src={preview.url} alt="Prescription"
                style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', display: 'block' }} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
