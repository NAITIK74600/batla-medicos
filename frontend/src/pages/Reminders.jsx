import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, BellOff, Plus, Trash2, Check, Clock, Pill, Edit2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import SEO from '../components/SEO';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STORAGE_KEY = 'bm_medicine_reminders';

const EMPTY = {
  medicineName: '',
  dosage: '',
  times: ['08:00'],
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  notes: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  active: true,
};

function loadReminders() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveReminders(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function uid() { return `r_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

export default function Reminders() {
  const [reminders, setReminders]     = useState(loadReminders);
  const [form, setForm]               = useState(EMPTY);
  const [editing, setEditing]         = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [notifPerm, setNotifPerm]     = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const timerRef = useRef(null);

  // Auto-request permission on mount if not yet decided
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(perm => setNotifPerm(perm));
    }
  }, []);

  // Persist whenever reminders change
  useEffect(() => { saveReminders(reminders); }, [reminders]);

  // Check every minute for due reminders
  const checkDue = useCallback(() => {
    if (notifPerm !== 'granted') return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dayName = DAYS[(now.getDay() + 6) % 7]; // Mon=0
    reminders.forEach(r => {
      if (!r.active) return;
      if (!r.days.includes(dayName)) return;
      if (r.endDate && new Date(r.endDate) < now) return;
      if (r.times.includes(hhmm)) {
        new Notification(`💊 Medicine Reminder — Batla Medicos`, {
          body: `Time to take ${r.medicineName}${r.dosage ? ' · ' + r.dosage : ''}${r.notes ? '\n' + r.notes : ''}`,
          icon: '/favicon.svg',
        });
      }
    });
  }, [reminders, notifPerm]);

  useEffect(() => {
    timerRef.current = setInterval(checkDue, 60 * 1000);
    return () => clearInterval(timerRef.current);
  }, [checkDue]);

  const requestNotif = async () => {
    if (typeof Notification === 'undefined') { toast.error('Notifications not supported in this browser.'); return; }
    if (Notification.permission === 'denied') {
      toast.error('Notifications are blocked. Please allow them in your browser\'s site settings, then refresh.');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') toast.success('Notifications enabled! You will be reminded on time.');
    else toast.error('Notification permission denied. You can allow it in browser site settings.');
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.medicineName.trim()) { toast.error('Medicine name is required.'); return; }
    if (form.times.length === 0) { toast.error('Add at least one reminder time.'); return; }
    if (form.days.length === 0) { toast.error('Select at least one day.'); return; }
    if (editing) {
      setReminders(prev => prev.map(r => r.id === editing ? { ...form, id: editing } : r));
      toast.success('Reminder updated.');
    } else {
      setReminders(prev => [...prev, { ...form, id: uid() }]);
      toast.success('Reminder added!');
    }
    setForm(EMPTY); setEditing(null); setShowForm(false);
  };

  const handleEdit = (r) => {
    setForm({ ...r }); setEditing(r.id); setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id) => {
    if (!confirm('Delete this reminder?')) return;
    setReminders(prev => prev.filter(r => r.id !== id));
    toast.success('Reminder deleted.');
  };

  const toggleActive = (id) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const addTime = () => {
    if (form.times.length >= 6) { toast.error('Max 6 times per day.'); return; }
    setForm(f => ({ ...f, times: [...f.times, '09:00'] }));
  };
  const updateTime = (i, val) => setForm(f => ({ ...f, times: f.times.map((t, idx) => idx === i ? val : t) }));
  const removeTime = (i) => setForm(f => ({ ...f, times: f.times.filter((_, idx) => idx !== i) }));
  const toggleDay  = (d) => setForm(f => ({
    ...f,
    days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d],
  }));

  const active   = reminders.filter(r => r.active);
  const inactive = reminders.filter(r => !r.active);

  return (
    <main className="rem-page container">
      <SEO title="Medicine Reminders" description="Set medicine reminders and never miss a dose with Batla Medicos." path="/reminders" noIndex />
      <div className="rem-page__header">
        <div>
          <h1><Pill size={22} /> Medicine Reminders</h1>
          <p className="rem-page__sub">Never miss a dose. Reminders fire as browser notifications.</p>
        </div>
        <div className="rem-page__header-actions">
          {notifPerm === 'granted' ? (
            <span className="rem-notif-on"><Check size={14} /> Notifications On</span>
          ) : notifPerm === 'denied' ? (
            <span className="rem-notif-blocked" title="Open browser site settings to unblock notifications">
              <BellOff size={16} /> Notifications Blocked
            </span>
          ) : (
            <button className="btn btn--outline" onClick={requestNotif}>
              <Bell size={16} /> Enable Notifications
            </button>
          )}
          <button className="btn btn--primary" onClick={() => { setForm(EMPTY); setEditing(null); setShowForm(s => !s); }}>
            <Plus size={16} /> Add Reminder
          </button>
        </div>
      </div>

      {showForm && (
        <section className="rem-form-card">
          <div className="rem-form-card__head">
            <h2>{editing ? 'Edit Reminder' : 'New Reminder'}</h2>
            <button className="icon-btn" onClick={() => { setShowForm(false); setForm(EMPTY); setEditing(null); }}><X size={18} /></button>
          </div>
          <form onSubmit={handleSave} className="rem-form">
            <div className="rem-form__row">
              <div className="form-group">
                <label>Medicine Name *</label>
                <input value={form.medicineName} onChange={e => setForm(f => ({ ...f, medicineName: e.target.value }))}
                  placeholder="e.g. Metformin 500mg" maxLength={100} required />
              </div>
              <div className="form-group">
                <label>Dosage / Instructions</label>
                <input value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))}
                  placeholder="e.g. 1 tablet after meals" maxLength={100} />
              </div>
            </div>

            {/* Times */}
            <div className="form-group">
              <label>Reminder Times *</label>
              <div className="rem-times">
                {form.times.map((t, i) => (
                  <div key={i} className="rem-time-row">
                    <Clock size={14} />
                    <input type="time" value={t} onChange={e => updateTime(i, e.target.value)} />
                    {form.times.length > 1 && (
                      <button type="button" className="icon-btn rem-time-remove" onClick={() => removeTime(i)}><X size={12} /></button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn--outline btn--sm" onClick={addTime}><Plus size={13} /> Add time</button>
              </div>
            </div>

            {/* Days */}
            <div className="form-group">
              <label>Days *</label>
              <div className="rem-days">
                {DAYS.map(d => (
                  <button key={d} type="button"
                    className={`rem-day-btn${form.days.includes(d) ? ' rem-day-btn--on' : ''}`}
                    onClick={() => toggleDay(d)}>{d}</button>
                ))}
              </div>
            </div>

            <div className="rem-form__row">
              <div className="form-group">
                <label>Start Date</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>End Date <small>(leave blank = ongoing)</small></label>
                <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Take with water, avoid alcohol…" rows={2} maxLength={300} />
            </div>

            <div className="rem-form__actions">
              <button type="submit" className="btn btn--primary">{editing ? 'Save Changes' : 'Add Reminder'}</button>
              <button type="button" className="btn btn--outline" onClick={() => { setShowForm(false); setForm(EMPTY); setEditing(null); }}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {reminders.length === 0 ? (
        <div className="rem-empty">
          <BellOff size={52} />
          <h3>No reminders yet</h3>
          <p>Tap "Add Reminder" to set up your medicine schedule.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="rem-section-title">Active ({active.length})</h2>
              <div className="rem-grid">
                {active.map(r => <ReminderCard key={r.id} r={r} onEdit={handleEdit} onDelete={handleDelete} onToggle={toggleActive} />)}
              </div>
            </section>
          )}
          {inactive.length > 0 && (
            <section>
              <h2 className="rem-section-title rem-section-title--inactive">Paused ({inactive.length})</h2>
              <div className="rem-grid rem-grid--inactive">
                {inactive.map(r => <ReminderCard key={r.id} r={r} onEdit={handleEdit} onDelete={handleDelete} onToggle={toggleActive} />)}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function ReminderCard({ r, onEdit, onDelete, onToggle }) {
  return (
    <div className={`rem-card${!r.active ? ' rem-card--inactive' : ''}`}>
      <div className="rem-card__top">
        <div className="rem-card__icon"><Pill size={20} /></div>
        <div className="rem-card__name">{r.medicineName}</div>
        <button className="icon-btn rem-card__toggle" title={r.active ? 'Pause' : 'Enable'}
          onClick={() => onToggle(r.id)}>
          {r.active ? <Bell size={16} /> : <BellOff size={16} />}
        </button>
      </div>
      {r.dosage && <p className="rem-card__dosage">{r.dosage}</p>}
      <div className="rem-card__times">
        {r.times.map(t => <span key={t} className="rem-card__time">{t}</span>)}
      </div>
      <div className="rem-card__days">
        {DAYS.map(d => (
          <span key={d} className={`rem-card__day${r.days.includes(d) ? ' rem-card__day--on' : ''}`}>{d}</span>
        ))}
      </div>
      {r.notes && <p className="rem-card__notes">{r.notes}</p>}
      {r.endDate && <p className="rem-card__end">Until {new Date(r.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
      <div className="rem-card__actions">
        <button className="btn btn--outline btn--sm" onClick={() => onEdit(r)}><Edit2 size={13} /> Edit</button>
        <button className="btn btn--danger btn--sm" onClick={() => onDelete(r.id)}><Trash2 size={13} /> Delete</button>
      </div>
    </div>
  );
}
