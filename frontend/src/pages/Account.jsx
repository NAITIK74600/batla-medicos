import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { User, Users, Plus, Trash2, Edit2, X, Heart } from 'lucide-react';
import SEO from '../components/SEO';

const RELATIONS = ['Father', 'Mother', 'Spouse', 'Child', 'Sibling', 'Guardian', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MEMBER_EMPTY = { name: '', relation: 'Spouse', dob: '', bloodGroup: '', allergies: '' };

function fmt(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function Account() {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState('profile');

  // Profile state
  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Family state
  const [members, setMembers]     = useState([]);
  const [mForm, setMForm]         = useState(MEMBER_EMPTY);
  const [editingM, setEditingM]   = useState(null); // _id or 'new'
  const [savingM, setSavingM]     = useState(false);

  const loadAccount = () => {
    api.get('/auth/me').then(r => {
      const u = r.data.user;
      setProfile({ name: u.name || '', phone: u.phone || '' });
      setMembers(u.familyMembers || []);
    }).catch(() => { toast.error('Failed to load account data.'); });
  };

  useEffect(() => { loadAccount(); }, []);

  // ── Profile ─────────────────────────────────────────────────────────────────
  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!profile.name.trim()) { toast.error('Name is required.'); return; }
    setSavingProfile(true);
    try {
      const { data } = await api.patch('/auth/profile', profile);
      setUser(data.user);
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed.');
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Family ──────────────────────────────────────────────────────────────────
  const openNewMember = () => { setMForm(MEMBER_EMPTY); setEditingM('new'); };
  const openEdit      = (m)  => { setMForm({ name: m.name, relation: m.relation, dob: m.dob?.split('T')[0] || '', bloodGroup: m.bloodGroup || '', allergies: m.allergies || '' }); setEditingM(m._id); };
  const cancelMember  = ()   => { setMForm(MEMBER_EMPTY); setEditingM(null); };

  const saveMember = async (e) => {
    e.preventDefault();
    if (!mForm.name.trim()) { toast.error('Name is required.'); return; }
    setSavingM(true);
    try {
      const { data } = editingM === 'new'
        ? await api.post('/auth/family', mForm)
        : await api.patch(`/auth/family/${editingM}`, mForm);
      setMembers(data.familyMembers);
      toast.success(editingM === 'new' ? 'Family member added!' : 'Updated!');
      cancelMember();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save.');
    } finally {
      setSavingM(false);
    }
  };

  const deleteMember = async (id) => {
    if (!confirm('Remove this family member?')) return;
    try {
      const { data } = await api.delete(`/auth/family/${id}`);
      setMembers(data.familyMembers);
      toast.success('Removed.');
    } catch {
      toast.error('Failed to remove.');
    }
  };

  const TABS = [
    { id: 'profile', label: 'Profile',         icon: <User size={15} /> },
    { id: 'family',  label: 'Family',           icon: <Users size={15} /> },
  ];

  return (
    <main className="account-page container">
      <SEO title="My Account" description="Manage your Batla Medicos account, profile and family members." path="/account" noIndex />
      <h1>My Account</h1>

      <div className="account-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`account-tab${tab === t.id ? ' account-tab--active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── PROFILE ─────────────────────────────────────────── */}
      {tab === 'profile' && (
        <section className="account-section">
          <h2><User size={18} /> Profile Information</h2>
          <form className="account-form" onSubmit={handleProfileSave}>
            <div className="form-group">
              <label>Full Name *</label>
              <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                placeholder="Your full name" maxLength={100} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input value={user?.email || ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <small>Email cannot be changed.</small>
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                placeholder="10-digit mobile number" maxLength={10} pattern="\d{10}" />
            </div>
            <button type="submit" className="btn btn--primary" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </section>
      )}

      {/* ── FAMILY ──────────────────────────────────────────── */}
      {tab === 'family' && (
        <section className="account-section">
          <div className="account-section__head">
            <h2><Users size={18} /> Family Members</h2>
            {editingM === null && (
              <button className="btn btn--primary btn--sm" onClick={openNewMember}><Plus size={14} /> Add Member</button>
            )}
          </div>
          <p className="account-section__sub">Add family members to order medicines on their behalf and manage their health profiles.</p>

          {(editingM !== null) && (
            <form className="family-form" onSubmit={saveMember}>
              <h3>{editingM === 'new' ? 'Add Family Member' : 'Edit Member'}</h3>
              <div className="family-form__grid">
                <div className="form-group">
                  <label>Name *</label>
                  <input value={mForm.name} onChange={e => setMForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" maxLength={100} required />
                </div>
                <div className="form-group">
                  <label>Relation *</label>
                  <select value={mForm.relation} onChange={e => setMForm(f => ({ ...f, relation: e.target.value }))}>
                    {RELATIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <input type="date" value={mForm.dob} onChange={e => setMForm(f => ({ ...f, dob: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Blood Group</label>
                  <select value={mForm.bloodGroup} onChange={e => setMForm(f => ({ ...f, bloodGroup: e.target.value }))}>
                    <option value="">-</option>
                    {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>Known Allergies</label>
                  <textarea value={mForm.allergies} onChange={e => setMForm(f => ({ ...f, allergies: e.target.value }))}
                    placeholder="e.g. Penicillin, Aspirin…" rows={2} maxLength={300} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button type="submit" className="btn btn--primary" disabled={savingM}>{savingM ? 'Saving…' : 'Save'}</button>
                <button type="button" className="btn btn--outline" onClick={cancelMember}><X size={14} /> Cancel</button>
              </div>
            </form>
          )}

          {members.length === 0 && editingM === null ? (
            <div className="account-empty">
              <Heart size={48} />
              <p>No family members added yet.</p>
            </div>
          ) : (
            <div className="family-grid">
              {members.map(m => (
                <div key={m._id} className="family-card">
                  <div className="family-card__avatar">{m.name[0]?.toUpperCase()}</div>
                  <div className="family-card__info">
                    <div className="family-card__name">{m.name}</div>
                    <div className="family-card__relation">{m.relation}</div>
                    {m.dob && <div className="family-card__meta">DOB: {fmt(m.dob)}</div>}
                    {m.bloodGroup && <div className="family-card__meta">Blood: <strong>{m.bloodGroup}</strong></div>}
                    {m.allergies && <div className="family-card__allergy">⚠️ {m.allergies}</div>}
                  </div>
                  <div className="family-card__actions">
                    <button className="icon-btn" onClick={() => openEdit(m)}><Edit2 size={15} /></button>
                    <button className="icon-btn icon-btn--danger" onClick={() => deleteMember(m._id)}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

    </main>
  );
}
