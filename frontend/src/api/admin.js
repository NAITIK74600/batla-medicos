import api from './axios';

export const getDashboardStats = () => api.get('/admin/dashboard');
export const getAdminUsers = (params) => api.get('/admin/users', { params });
export const banUser = (id, isBanned) => api.patch(`/admin/users/${id}/ban`, { isBanned });
export const changeUserRole = (id, role) => api.patch(`/admin/users/${id}/role`, { role });
export const getAdmins = () => api.get('/admin/admins');
export const createAdmin = (data) => api.post('/admin/admins', data);
export const deleteAdmin = (id) => api.delete(`/admin/admins/${id}`);
export const getAuditLog = (params) => api.get('/admin/audit-log', { params });
export const clearAuditLog = (password) => api.delete('/admin/audit-log/clear', { data: { password } });
export const clearOrders = (password) => api.delete('/admin/orders/clear', { data: { password } });
export const triggerCsvSync = () => api.post('/admin/sync-csv');
export const getCsvSyncStatus = () => api.get('/admin/sync-csv/status');
export const getAvailabilityRequests = (params) => api.get('/admin/availability-requests', { params });
export const updateAvailabilityRequestStatus = (id, status) => api.patch(`/admin/availability-requests/${id}/status`, { status });
export const deleteAvailabilityRequest = (id) => api.delete(`/admin/availability-requests/${id}`);
export const importStock = (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/admin/import-stock', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); };
export const getImportStockStatus = () => api.get('/admin/import-stock/status');
