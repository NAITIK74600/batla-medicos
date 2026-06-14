import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getLabTests, createLabBooking } from '../api/lab';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { getGeoPosition, GEO_ERROR_MESSAGES } from '../utils/geo';
import {
  FlaskConical, Droplets, Search, ShoppingCart, X, CheckCircle,
  Clock, Home, MapPin, ChevronRight, ChevronLeft, Minus, Plus,
  Shield, UserCheck, FileText, Microscope, TestTube, Activity,
  Navigation, Loader, LocateFixed,
} from 'lucide-react';
import SEO from '../components/SEO';

const FEATURES = [
  { icon: <Home size={20} />,      title: 'Free Home Collection', sub: 'Doorstep sample pickup' },
  { icon: <FileText size={20} />,  title: 'Reports in 24–48 hrs',  sub: 'Digital & printable'   },
  { icon: <Shield size={20} />,    title: 'Certified Lab',        sub: 'NABL accredited'        },
  { icon: <UserCheck size={20} />, title: 'Trained Phlebotomist', sub: 'Safe & hygienic'        },
];

const CAT_COLORS = {
  blood:    { bg: '#FEF2F2', color: '#C0392B', label: 'Blood' },
  urine:    { bg: '#FFFBEB', color: '#D97706', label: 'Urine' },
  stool:    { bg: '#F0FBF4', color: '#1B8843', label: 'Stool' },
  imaging:  { bg: '#EFF6FF', color: '#2563EB', label: 'Imaging' },
  cardiac:  { bg: '#FDF4FF', color: '#9333EA', label: 'Cardiac' },
  hormones: { bg: '#FFF7ED', color: '#EA580C', label: 'Hormones' },
  vitamins: { bg: '#ECFDF5', color: '#059669', label: 'Vitamins' },
  other:    { bg: '#F9FAFB', color: '#6B7280', label: 'Other' },
};

const STATUS_STEPS = ['pending','confirmed','sample_collected','processing','report_ready','completed'];
const STATUS_LABELS = {
  pending: 'Pending', confirmed: 'Confirmed', sample_collected: 'Sample Collected',
  processing: 'Processing', report_ready: 'Report Ready', completed: 'Completed', cancelled: 'Cancelled',
};

const SLOTS = [
  '6:00 AM - 8:00 AM', '8:00 AM - 10:00 AM', '10:00 AM - 12:00 PM',
  '12:00 PM - 2:00 PM', '2:00 PM - 4:00 PM', '4:00 PM - 6:00 PM',
];

const today = () => new Date().toISOString().split('T')[0];
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; };

export default function LabTests() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [tests,      setTests]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [catFilter,  setCatFilter]  = useState('all');
  const [cart,       setCart]       = useState([]);
  const [step,       setStep]       = useState(0); // 0=browse 1=patient 2=collection 3=confirm
  const [form,       setForm]       = useState({
    patientName: '', patientAge: '', patientGender: 'male', phone: '',
    collectionType: 'home',
    address: { line1: '', city: 'New Delhi', pincode: '' },
    bookingDate: tomorrow(), slot: SLOTS[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [booked,     setBooked]     = useState(null);
  const [locLoading, setLocLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getLabTests({ limit: 100 })
      .then(r => setTests(r.data?.tests || []))
      .catch(() => toast.error('Failed to load tests.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = tests;
    if (catFilter !== 'all') list = list.filter(t => t.category === catFilter);
    if (search) list = list.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [tests, search, catFilter]);

  const inCart     = id   => cart.some(t => t._id === id);
  const toggleCart = test => setCart(c => inCart(test._id) ? c.filter(t => t._id !== test._id) : [...c, test]);
  const totalPrice = cart.reduce((s, t) => s + t.price, 0);

  const setF    = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setAddr = (key, val) => setForm(f => ({ ...f, address: { ...f.address, [key]: val } }));

  const openWizard = () => {
    if (!user) { navigate('/login'); return; }
    // Pre-fill saved address and patient details from profile
    const savedAddr = user.addresses?.[0];
    setForm(f => ({
      ...f,
      patientName: f.patientName || user.name || '',
      phone: f.phone || user.phone || '',
      address: savedAddr ? {
        line1:   savedAddr.line1   || f.address.line1,
        city:    savedAddr.city    || f.address.city,
        pincode: savedAddr.pincode || f.address.pincode,
      } : f.address,
    }));
    setStep(1);
  };

  const handleLabAutoFillAddress = async () => {
    setLocLoading(true);
    const { position, error } = await getGeoPosition();
    if (error) { setLocLoading(false); toast.error(GEO_ERROR_MESSAGES[error]); return; }
    const { latitude: lat, longitude: lng } = position.coords;
    try {
      const { data } = await api.get('/geocode/reverse', { params: { lat, lng } });
      const { line1, line2, city, pincode } = data;
      if (!line1 && !city) throw new Error('Empty address');
      setForm(f => ({ ...f, address: {
        line1:   line1   || f.address.line1,
        city:    city    || f.address.city,
        pincode: (pincode && /^\d{6}$/.test(pincode)) ? pincode : f.address.pincode,
      }}));
      toast.success('Address auto-filled from GPS!');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not fetch address. Please fill manually.');
    } finally { setLocLoading(false); }
  };

  const handleBooking = async () => {
    setSubmitting(true);
    try {
      const payload = {
        tests: cart.map(t => t._id),
        ...form,
        patientAge: form.patientAge ? Number(form.patientAge) : undefined,
      };
      const { data } = await createLabBooking(payload);
      setBooked(data.booking);
      setCart([]);
      setStep(0);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Booking failed.');
    } finally { setSubmitting(false); }
  };

  if (booked) return (
    <div className="lab-page">
      <div className="container" style={{ maxWidth: 540, paddingTop: 64, paddingBottom: 64, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F0FBF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle size={44} color="#1B8843" strokeWidth={1.5} />
        </div>
        <h2 style={{ fontSize: '1.7rem', fontWeight: 800, margin: '0 0 10px' }}>Booking Confirmed! 🎉</h2>
        <p style={{ color: 'var(--gray-500)', marginBottom: 28, fontSize: 15 }}>
          {booked.collectionType === 'home' ? '🏠 Our phlebotomist visits you on ' : '🏥 Please visit our lab on '}
          <strong>{new Date(booked.bookingDate).toLocaleDateString('en-IN')}</strong> · {booked.slot}
        </p>
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 22px', textAlign: 'left', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Booking Summary</div>
          {booked.testSnapshots?.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{t.name}</span><span style={{ fontWeight: 600 }}>₹{t.price}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginTop: 12, fontSize: 16 }}>
            <span>Total</span><span style={{ color: 'var(--primary)' }}>₹{booked.totalAmount}</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 24 }}>💰 Payment collected at the time of sample collection.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link to="/lab/bookings" className="btn btn--primary">View My Bookings</Link>
          <button className="btn btn--outline" onClick={() => setBooked(null)}>Book More Tests</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="lab-page">
      <SEO
        title="Book Lab Tests Online – Home Collection in New Delhi"
        description="Book lab tests at home from Batla Medicos. CBC, thyroid, diabetes, liver function, kidney function, vitamin D, lipid profile & more. NABL certified lab, reports in 24–48 hours. Free home collection."
        path="/lab"
      />
      {/* Hero */}
      <div className="lab-hero">
        <div className="container lab-hero__inner">
          {/* Left: text + search */}
          <div className="lab-hero__text">
            <div className="lab-hero__badge">
              <FlaskConical size={13} />
              <span>Batla MediLab — Certified Diagnostics</span>
            </div>
            <h1 className="lab-hero__title">
              Book Lab Tests<br />
              <span className="lab-hero__title-accent">at Your Doorstep</span>
            </h1>
            <p className="lab-hero__sub">Home sample collection · Certified lab · Reports in 24–48 hrs</p>
            <div className="lab-search">
              <Search size={16} color="var(--gray-400)" />
              <input placeholder="Search tests (CBC, Blood Sugar, Thyroid…)" value={search} onChange={e => setSearch(e.target.value)} />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, alignItems: 'center' }}>
                  <X size={15} color="var(--gray-400)" />
                </button>
              )}
            </div>
          </div>

          {/* Right: orbital — lab chemicals / DNA */}
          <div className="lab-hero-orbital" aria-hidden="true">
            {/* Central flask */}
            <div className="lab-orbital-center">
              <FlaskConical size={36} color="white" strokeWidth={1.5} />
            </div>

            {/* Ring 1 — Droplets (blood) */}
            <div className="lab-orbital-ring lab-orbital-ring--1">
              <div className="lab-orbital-icon">
                <Droplets size={16} color="#FC8181" />
              </div>
            </div>

            {/* Ring 2 — Test tube (sample) */}
            <div className="lab-orbital-ring lab-orbital-ring--2">
              <div className="lab-orbital-icon lab-orbital-icon--green">
                <TestTube size={16} color="#4ade80" />
              </div>
            </div>

            {/* Ring 3 — Activity (report chart) */}
            <div className="lab-orbital-ring lab-orbital-ring--3">
              <div className="lab-orbital-icon lab-orbital-icon--gold">
                <Activity size={14} color="rgba(255,220,120,0.95)" />
              </div>
            </div>

            {/* DNA text badge top-right */}
            <div className="lab-orbital-dna" aria-hidden="true">🧬 DNA</div>
          </div>
        </div>
      </div>

      {/* Feature strip */}
      <div className="lab-feature-strip">
        <div className="container">
          <div className="lab-feature-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="lab-feature-item">
                <div className="lab-feature-icon">{f.icon}</div>
                <div>
                  <div className="lab-feature-title">{f.title}</div>
                  <div className="lab-feature-sub">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container lab-content">
        <div className="lab-cat-tabs">
          {['all', ...Object.keys(CAT_COLORS)].map(c => (
            <button key={c} className={`lab-cat-tab ${catFilter === c ? 'active' : ''}`} onClick={() => setCatFilter(c)}>
              {c === 'all' ? 'All Tests' : CAT_COLORS[c].label}
            </button>
          ))}
        </div>

        {!loading && (
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
            {filtered.length} {filtered.length === 1 ? 'test' : 'tests'}
            {catFilter !== 'all' && ` in ${CAT_COLORS[catFilter]?.label}`}
            {search && ` for “${search}”`}
          </p>
        )}

        {loading ? (
          <div className="lab-tests-grid">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="lab-test-card lab-test-card--skeleton" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="lab-empty-state">
            <FlaskConical size={52} color="var(--gray-300)" strokeWidth={1} />
            <h3>No tests found</h3>
            <p>
              {tests.length === 0
                ? (isAdmin
                    ? <><Link to="/admin/lab-tests" style={{ color: 'var(--primary)', fontWeight: 600 }}>Go to Admin → Lab Tests</Link>{' '}to add tests to the catalogue.</>
                    : 'No lab tests configured yet. Please contact admin.')
                : 'Try a different category or clear your search.'}
            </p>
          </div>
        ) : (
          <div className="lab-tests-grid">
            {filtered.map(test => {
              const cfg = CAT_COLORS[test.category] || CAT_COLORS.other;
              const added = inCart(test._id);
              return (
                <div key={test._id} className={`lab-test-card ${added ? 'lab-test-card--added' : ''}`}>
                  <div className="lab-test-card__top">
                    <span className="lab-test-card__cat-badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    {test.homeCollection && <span className="lab-test-card__home-badge"><Home size={10} /> Home</span>}
                  </div>
                  <div className="lab-test-card__name">{test.name}</div>
                  {test.sampleType    && <div className="lab-test-card__sample"><Droplets size={12} /> {test.sampleType}</div>}
                  {test.turnaroundTime && <div className="lab-test-card__tat"><Clock size={12} /> {test.turnaroundTime}</div>}
                  {test.parameters?.length > 0 && (
                    <div className="lab-test-card__params">
                      {test.parameters.slice(0, 3).map((p, i) => <span key={i} className="lab-param-tag">{p}</span>)}
                      {test.parameters.length > 3 && <span className="lab-param-tag">+{test.parameters.length - 3} more</span>}
                    </div>
                  )}
                  <div className="lab-test-card__footer">
                    <span className="lab-test-card__price">₹{test.price}</span>
                    <button className={`btn btn--sm ${added ? 'btn--danger' : 'btn--primary'}`} onClick={() => toggleCart(test)}>
                      {added ? <><Minus size={13} /> Remove</> : <><Plus size={13} /> Add</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {cart.length > 0 && <div style={{ height: 84 }} />}
      </div>

      {/* ── Sticky Cart Bar ── */}
      {cart.length > 0 && (
        <div className="lab-cart-bar">
          <div className="container lab-cart-bar__inner">
            <div className="lab-cart-bar__left">
              <ShoppingCart size={18} />
              <span><strong>{cart.length}</strong> test{cart.length > 1 ? 's' : ''} added</span>
              <span className="lab-cart-bar__total">₹{totalPrice}</span>
            </div>
            <div className="lab-cart-bar__right">
              <button className="lab-cart-bar__clear" onClick={() => setCart([])}>Clear all</button>
              <button className="btn btn--primary" onClick={openWizard}>
                Book Now <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Booking Wizard Modal ── */}
      {step > 0 && (
        <div className="lab-modal-overlay" onClick={() => setStep(0)}>
          <div className="lab-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <button onClick={() => setStep(0)} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex' }}>
              <X size={20} />
            </button>

            {/* Step bar */}
            <div className="lab-wizard-steps">
              {['Patient', 'Collection', 'Confirm'].map((s, i) => (
                <div key={i} className={`lab-wizard-step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
                  <div className="lab-wizard-step__num">{step > i + 1 ? '✓' : i + 1}</div>
                  <div className="lab-wizard-step__label">{s}</div>
                </div>
              ))}
            </div>

            {/* Step 1: Patient */}
            {step === 1 && (
              <div>
                <h3 style={{ marginBottom: 4 }}>Patient Details</h3>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20 }}>Who is this test for?</p>
                <div className="form-row">
                  <div className="form-group">
                    <label>Patient Name *</label>
                    <input autoFocus value={form.patientName} onChange={e => setF('patientName', e.target.value)} placeholder="Full name" />
                  </div>
                  <div className="form-group">
                    <label>Phone *</label>
                    <input type="tel" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="10-digit mobile" maxLength={10} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Age</label>
                    <input type="number" min="0" max="120" value={form.patientAge} onChange={e => setF('patientAge', e.target.value)} placeholder="Years" />
                  </div>
                  <div className="form-group">
                    <label>Gender</label>
                    <select value={form.patientGender} onChange={e => setF('patientGender', e.target.value)}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn--outline" onClick={() => setStep(0)}><ChevronLeft size={16} /> Cancel</button>
                  <button className="btn btn--primary" style={{ flex: 1 }}
                    onClick={() => {
                      if (!form.patientName.trim()) { toast.error('Patient name required.'); return; }
                      if (!/^\d{10}$/.test(form.phone)) { toast.error('Valid 10-digit phone required.'); return; }
                      setStep(2);
                    }}>Next — Collection <ChevronRight size={16} /></button>
                </div>
              </div>
            )}

            {/* Step 2: Collection + Schedule */}
            {step === 2 && (
              <div>
                <h3 style={{ marginBottom: 4 }}>Sample Collection</h3>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 18 }}>Choose how you want your sample collected.</p>

                <div className="lab-collect-toggle">
                  <button type="button" className={`lab-collect-btn ${form.collectionType === 'home' ? 'active' : ''}`} onClick={() => setF('collectionType', 'home')}>
                    <Home size={22} />
                    <div>
                      <div style={{ fontWeight: 700 }}>Home Collection</div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Phlebotomist visits you</div>
                    </div>
                  </button>
                  <button type="button" className={`lab-collect-btn ${form.collectionType === 'walkin' ? 'active' : ''}`} onClick={() => setF('collectionType', 'walkin')}>
                    <MapPin size={22} />
                    <div>
                      <div style={{ fontWeight: 700 }}>Walk In</div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Visit our lab</div>
                    </div>
                  </button>
                </div>

                {form.collectionType === 'home' && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="btn-use-location" onClick={handleLabAutoFillAddress} disabled={locLoading}
                        style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {locLoading
                          ? <><Loader size={13} className="spin" /> Detecting&hellip;</>
                          : <><LocateFixed size={13} /> Auto-fill from GPS</>}
                      </button>
                    </div>
                    <div className="form-group">
                      <label>Address *</label>
                      <input value={form.address.line1} onChange={e => setAddr('line1', e.target.value)} placeholder="House/Flat no., Street, Area" />
                    </div>
                    <div className="form-row">
                      <div className="form-group"><label>City</label><input value={form.address.city} onChange={e => setAddr('city', e.target.value)} /></div>
                      <div className="form-group"><label>Pincode</label><input value={form.address.pincode} onChange={e => setAddr('pincode', e.target.value)} maxLength={6} /></div>
                    </div>
                  </div>
                )}

                {form.collectionType === 'walkin' && (
                  <div style={{ background: '#F0FBF4', borderRadius: 10, padding: '12px 16px', margin: '14px 0', fontSize: 13, color: '#1B8843', lineHeight: 1.7 }}>
                    <strong>🏥 Lab Address</strong><br />
                    F 41/2, Nafees Road, Batla House, New Delhi – 110025<br />
                    <span style={{ color: 'var(--gray-500)' }}>Mon–Sun · 7:00 AM – 9:00 PM</span>
                  </div>
                )}

                <div className="form-row" style={{ marginTop: 14 }}>
                  <div className="form-group">
                    <label>Date *</label>
                    <input type="date" min={today()} value={form.bookingDate} onChange={e => setF('bookingDate', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Time Slot *</label>
                    <select value={form.slot} onChange={e => setF('slot', e.target.value)}>
                      {SLOTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn--outline" onClick={() => setStep(1)}><ChevronLeft size={16} /> Back</button>
                  <button className="btn btn--primary" style={{ flex: 1 }}
                    onClick={() => {
                      if (form.collectionType === 'home' && !form.address.line1.trim()) { toast.error('Address required for home collection.'); return; }
                      if (!form.bookingDate) { toast.error('Please select a date.'); return; }
                      setStep(3);
                    }}>Review Booking <ChevronRight size={16} /></button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
              <div>
                <h3 style={{ marginBottom: 4 }}>Confirm Booking</h3>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 18 }}>Review details before confirming.</p>
                <div className="lab-confirm-block">
                  <div className="lab-confirm-row"><span>Patient</span><strong>{form.patientName} ({form.patientGender}{form.patientAge ? `, ${form.patientAge} yrs` : ''})</strong></div>
                  <div className="lab-confirm-row"><span>Phone</span><strong>{form.phone}</strong></div>
                  <div className="lab-confirm-row">
                    <span>Collection</span>
                    <strong>{form.collectionType === 'home' ? `🏠 Home — ${form.address.line1}, ${form.address.city}` : '🏥 Walk In'}</strong>
                  </div>
                  <div className="lab-confirm-row"><span>Date &amp; Slot</span><strong>{new Date(form.bookingDate).toLocaleDateString('en-IN')} · {form.slot}</strong></div>
                </div>
                <div className="lab-confirm-tests">
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Tests ({cart.length})</div>
                  {cart.map(t => (
                    <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{t.name}</span><span style={{ fontWeight: 600 }}>₹{t.price}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, marginTop: 12, color: 'var(--primary)' }}>
                    <span>Total</span><span>₹{totalPrice}</span>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: '12px 0 16px' }}>💰 Payment collected at the time of sample collection.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn--outline" onClick={() => setStep(2)} disabled={submitting}><ChevronLeft size={16} /> Back</button>
                  <button className="btn btn--primary" style={{ flex: 1 }} onClick={handleBooking} disabled={submitting}>
                    {submitting ? 'Booking…' : '✅ Confirm Booking'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
