import api from './axios';

export const uploadPrescription = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/upload/prescription', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const uploadImage = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/upload/image', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const uploadVideo = (file, onUploadProgress) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/upload/video', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
    timeout: 300000, // 5 min for large videos
  });
};
