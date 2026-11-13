import { apiClient } from './client';

export const schedulerApi = {
  getJobs: (params = {}) =>
    apiClient.get('/api/v1/scheduler/jobs', { params }),

  getJob: (jobId) =>
    apiClient.get(`/api/v1/scheduler/jobs/${jobId}`),

  createJob: (payload) =>
    apiClient.post('/api/v1/scheduler/jobs', payload),

  updateJob: (jobId, payload) =>
    apiClient.put(`/api/v1/scheduler/jobs/${jobId}`, payload),

  deleteJob: (jobId) =>
    apiClient.delete(`/api/v1/scheduler/jobs/${jobId}`),

  triggerJob: (jobId) =>
    apiClient.post(`/api/v1/scheduler/jobs/${jobId}/trigger`),

  pauseJob: (jobId) =>
    apiClient.post(`/api/v1/scheduler/jobs/${jobId}/pause`),

  resumeJob: (jobId) =>
    apiClient.post(`/api/v1/scheduler/jobs/${jobId}/resume`),
};

