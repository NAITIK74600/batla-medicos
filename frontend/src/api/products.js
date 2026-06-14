import api from './axios';

export const getProducts = (params) => api.get('/products', { params });
export const getProductBySlug = (slug) => api.get(`/products/${slug}`);
export const getRelatedProducts = (id) => api.get(`/products/${id}/related`);
export const createProduct = (data) => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const updateProductImages = (id, data) => api.post(`/products/update-images/${id}`, data);
export const deleteProduct = (id) => api.delete(`/products/${id}`);
export const bulkImportProducts = (file, mode = 'append') => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('mode', mode);
  return api.post('/products/bulk-import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const downloadImportTemplate = () => api.get('/products/import-template', { responseType: 'blob' });
export const downloadCsvTemplate    = () => api.get('/products/csv-template',    { responseType: 'blob' });
export const exportProductsExcel   = (params) => api.get('/products/export-excel', { params, responseType: 'blob', timeout: 120000 });
export const quickUpdateProduct  = (id, data) => api.patch(`/products/${id}/quick-update`, data);
export const getAdminProducts    = (params)    => api.get('/products/admin/list', { params });
export const bulkUpdateProducts  = (data)      => api.patch('/products/bulk-update', data);
export const bulkDiscountProducts = (data)     => api.patch('/products/bulk-discount', data);
export const aiFillProduct       = (productId) => api.post('/products/ai-fill', { productId });
export const aiFillBulk          = (productIds) => api.post('/products/ai-fill-bulk', { productIds });
export const getMissingInfoCount = ()          => api.get('/products/missing-info/count');
export const getTopBrands        = ()          => api.get('/products/brands');
export const requestMedicineAvailability = (data) => api.post('/products/request-availability', data);
