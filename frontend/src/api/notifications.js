import api from './axios';

export const getMyNotifications    = (params = {}) => api.get('/notifications', { params });
export const getAdminNotifications = (params = {}) => api.get('/notifications/admin', { params });
export const markNotifRead         = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotifsRead     = () => api.patch('/notifications/read-all');
export const deleteNotif           = (id) => api.delete(`/notifications/${id}`);
