import { useEffect, useState } from 'react';
import { createAdmin, deleteAdmin, getAdmins, changeUserRole } from '../../api/admin';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';

export default function AdminAdmins() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'admin' });
  const [submitting, setSubmitting] = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data } = await getAdmins();
      setAdmins(data.admins || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load admin accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createAdmin(form);
      setForm({ name: '', email: '', phone: '', password: '', role: 'admin' });
      toast.success('Admin created.');
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create admin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this admin account?')) return;
    try {
      await deleteAdmin(id);
      toast.success('Admin deleted.');
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed.');
    }
  };

  const handleDemote = async (id, name) => {
    if (!confirm(`Demote "${name}" back to customer? They will lose admin access.`)) return;
    try {
      await changeUserRole(id, 'customer');
      toast.success(`${name} demoted to customer.`);
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to demote.');
    }
  };

  return (
    <div className="admin-page">
      <h1>Admin Accounts</h1>

      <form className="admin-form" onSubmit={handleCreate}>
        <h2>Create New Admin</h2>
        <div className="form-row">
          <div className="form-group">
            <label>Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Phone *</label>
            <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required maxLength={10} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Password * <small style={{color:'var(--gray-400)'}}>min 8 chars, 1 uppercase, 1 number</small></label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
          </div>
          <div className="form-group">
            <label>Role *</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
        </div>
        <button className="btn btn--primary" type="submit" disabled={submitting}>
          <Plus size={16} /> {submitting ? 'Creating...' : 'Create Admin'}
        </button>
      </form>

      <h2 style={{ marginTop: 32 }}>Existing Admins</h2>
      {loading ? (
        <p style={{ color: 'var(--gray-400)' }}>Loading...</p>
      ) : admins.length === 0 ? (
        <p style={{ color: 'var(--gray-400)' }}>No admin accounts yet. Create one above.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Created</th><th>Action</th></tr>
          </thead>
          <tbody>
            {admins.map(a => (
              <tr key={a._id}>
                <td>{a.name}</td>
                <td>{a.email}</td>
                <td>{a.phone}</td>
                <td><span className="badge">{a.role}</span></td>
                <td>{new Date(a.createdAt).toLocaleDateString('en-IN')}</td>
                <td style={{ display: 'flex', gap: '6px' }}>
                  {a.role === 'admin' && (
                    <button className="btn btn--sm btn--outline" onClick={() => handleDemote(a._id, a.name)}>Demote</button>
                  )}
                  <button className="btn btn--sm btn--danger" onClick={() => handleDelete(a._id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
