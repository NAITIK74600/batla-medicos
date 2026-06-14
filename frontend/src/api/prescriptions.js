import api from './axios';

export const uploadPrescription   = (fd) => api.post('/prescriptions', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getMyPrescriptions   = ()   => api.get('/prescriptions/my');
export const deletePrescription   = (id) => api.delete(`/prescriptions/${id}`);
// Admin
export const getAllPrescriptions  = (params) => api.get('/prescriptions', { params });
export const updatePrescriptionStatus = (id, data) => api.patch(`/prescriptions/${id}`, data);
export const createOrderFromPrescription = (id, data) => api.post(`/prescriptions/${id}/create-order`, data);
export const exportPrescriptions = (params) => api.get('/prescriptions/export', { params, responseType: 'blob' });
export const clearPrescriptions  = (password) => api.delete('/prescriptions/clear', { data: { password } });
