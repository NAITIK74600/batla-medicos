import api from './axios';

export const getProductReviews = (productId, page = 1) =>
  api.get(`/reviews/product/${productId}`, { params: { page } });

export const submitReview = (data) => api.post('/reviews', data);

export const adminDeleteReview = (id) => api.delete(`/reviews/${id}`);
