import api from './axios';

// Delivery boy self-service
export const registerDeliveryBoy = (data) => api.post('/delivery/register', data);
export const getDeliveryProfile  = ()     => api.get('/delivery/me');
export const toggleAvailability  = (isAvailable) => api.patch('/delivery/availability', { isAvailable });
export const updateLocation      = (lat, lng)    => api.patch('/delivery/location', { lat, lng });
export const getDeliveryOrders   = ()     => api.get('/delivery/orders');
export const getDeliveryHistory  = (page) => api.get('/delivery/orders/history', { params: { page } });
export const pickupOrder         = (id)   => api.post(`/delivery/orders/${id}/pick`);
export const deliveryVerifyOtp   = (id, otp) => api.post(`/delivery/orders/${id}/verify-otp`, { otp });

// Admin delivery management
export const getAllDeliveryBoys       = (status) => api.get('/delivery/admin/all', { params: status ? { status } : {} });
export const updateDeliveryBoyStatus  = (id, status) => api.patch(`/delivery/admin/${id}/status`, { status });
export const getAvailableDeliveryBoys = () => api.get('/delivery/admin/available');
export const assignOrderToDelivery    = (orderId, deliveryBoyId) => api.post('/delivery/admin/assign', { orderId, deliveryBoyId });
