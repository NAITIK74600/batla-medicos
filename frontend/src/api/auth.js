import api from './axios';

export const registerUser       = (data)  => api.post('/auth/register', data);
export const loginUser          = (data)  => api.post('/auth/login', data);
export const googleAuth         = (data) => api.post('/auth/google', data);
export const logoutUser         = ()      => api.post('/auth/logout');
export const getMe              = ()      => api.get('/auth/me');
export const refreshToken       = ()      => api.post('/auth/refresh');
export const verifyEmailOtp     = (email, otp) => api.post('/auth/verify-email-otp', { email, otp });
export const resendEmailOtp     = (email) => api.post('/auth/resend-email-otp', { email });
export const forgotPassword     = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword      = (email, otp, password) => api.post('/auth/reset-password', { email, otp, password });
