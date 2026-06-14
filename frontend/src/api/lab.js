import api from './axios';

// ── Lab Tests (public) ──────────────────────────────────────────
export const getLabTests      = (params) => api.get('/lab/tests', { params });
export const getLabTestById   = (id)     => api.get(`/lab/tests/${id}`);

// ── Lab Tests (admin) ──────────────────────────────────────────
export const getAdminLabTests = (params) => api.get('/lab/tests/admin', { params });
export const createLabTest    = (data)   => api.post('/lab/tests', data);
export const updateLabTest    = (id, data) => api.put(`/lab/tests/${id}`, data);
export const deleteLabTest    = (id)     => api.delete(`/lab/tests/${id}`);

// ── Lab Bookings (user) ────────────────────────────────────────
export const createLabBooking = (data)   => api.post('/lab/bookings', data);
export const getMyLabBookings = (params) => api.get('/lab/bookings/my', { params });
export const getLabBookingById = (id)    => api.get(`/lab/bookings/${id}`);
export const cancelLabBooking  = (id)    => api.delete(`/lab/bookings/${id}`);

// ── Lab Bookings (admin) ───────────────────────────────────────
export const getAdminLabBookings    = (params) => api.get('/lab/bookings', { params });
export const updateLabBookingStatus = (id, status) => api.patch(`/lab/bookings/${id}/status`, { status });
export const uploadLabReport        = (id, data)   => api.patch(`/lab/bookings/${id}/report`, data);
export const exportLabBookings      = (params) => api.get('/lab/bookings/export', { params, responseType: 'blob' });
export const clearLabBookings       = (password) => api.delete('/lab/bookings/clear', { data: { password } });
export const exportLabTests         = () => api.get('/lab/tests/export', { responseType: 'blob' });
