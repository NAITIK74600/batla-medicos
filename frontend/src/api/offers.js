import api from './axios';

export const getActiveOffers = (display) => api.get('/offers', { params: { ...(display ? { display } : {}) } });
export const getAllOffers = () => api.get('/offers/all');
export const getOfferStats = () => api.get('/offers/stats');
export const createOffer = (data) => api.post('/offers', data);
export const updateOffer = (id, data) => api.put(`/offers/${id}`, data);
export const deleteOffer = (id) => api.delete(`/offers/${id}`);
export const duplicateOffer = (id) => api.post(`/offers/${id}/duplicate`);
export const trackOfferClick = (id) => api.post(`/offers/${id}/click`);
export const reorderOffers = (order) => api.patch('/offers/reorder', { order });
export const bulkToggleOffers = (ids, isActive) => api.patch('/offers/bulk-toggle', { ids, isActive });
