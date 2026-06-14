import api from './axios';

// Customer
export const validateCoupon = (code, cartTotal) => api.post('/coupons/validate', { code, cartTotal });

// Admin
export const getAllCoupons  = ()          => api.get('/coupons/admin/all');
export const createCoupon   = (data)      => api.post('/coupons/admin', data);
export const updateCoupon   = (id, data)  => api.put(`/coupons/admin/${id}`, data);
export const deleteCoupon   = (id)        => api.delete(`/coupons/admin/${id}`);
