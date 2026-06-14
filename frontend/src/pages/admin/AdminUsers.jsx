import { useEffect, useState } from 'react';
import { getAdminUsers, banUser, changeUserRole } from '../../api/admin';
import toast from 'react-hot-toast';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    try {
      const { data } = await getAdminUsers({ page, limit: 20, search });
      setUsers(data.users || []);
      setPages(data.pages || 1);
    } catch {}
  };

  useEffect(() => { fetchUsers(); }, [page, search]);

  const handleBan = async (id, current) => {
    try {
      await banUser(id, !current);
      toast.success(`User ${!current ? 'banned' : 'unbanned'}.`);
      fetchUsers();
    } catch { toast.error('Action failed.'); }
  };

  const handleMakeAdmin = async (id, name) => {
    if (!confirm(`Promote "${name}" to admin? They will be able to access the admin panel.`)) return;
    try {
      await changeUserRole(id, 'admin');
      toast.success(`${name} is now an admin.`);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to change role.'); }
  };

  return (
    <div className="admin-page">
      <h1>Customers</h1>
      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search by name or email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
      </div>
      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u._id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.phone}</td>
              <td>{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
              <td>{u.isBanned ? <span className="badge badge--red">Banned</span> : <span className="badge badge--green">Active</span>}</td>
              <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  className={`btn btn--sm ${u.isBanned ? 'btn--outline' : 'btn--danger'}`}
                  onClick={() => handleBan(u._id, u.isBanned)}
                >
                  {u.isBanned ? 'Unban' : 'Ban'}
                </button>
                <button
                  className="btn btn--sm btn--primary"
                  onClick={() => handleMakeAdmin(u._id, u.name)}
                >
                  Make Admin
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    </div>
  );
}
