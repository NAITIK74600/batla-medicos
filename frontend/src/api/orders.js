import api from './axios';

export const createOrder = (data) => api.post('/orders', data);
export const verifyPayment = (data) => api.post('/orders/verify-payment', data);
export const getMyOrders = () => api.get('/orders/my');
export const getOrderById = (id) => api.get(`/orders/${id}`);
export const downloadReceipt = (id) => api.get(`/orders/${id}/receipt`, { responseType: 'blob' });
// Admin
export const getAllOrders     = (params) => api.get('/orders', { params });
export const updateOrderStatus = (id, status) => api.patch(`/orders/${id}/status`, { status });
export const verifyDeliveryOtp = (id, otp)    => api.post(`/orders/${id}/verify-otp`, { otp });
export const regenerateOtp    = (id)          => api.post(`/orders/${id}/regenerate-otp`);
export const resendReceipt    = (id)          => api.post(`/orders/${id}/resend-receipt`);
export const archiveOrders    = (period)      => api.post('/orders/admin/archive', { period });
export const exportOrders     = (params)      => api.get('/orders/admin/export', { params, responseType: 'blob' });
// Customer
export const shareLocation    = (id, data) => api.post(`/orders/${id}/share-location`, data);
export const reorder          = (id)       => api.post(`/orders/${id}/reorder`);
