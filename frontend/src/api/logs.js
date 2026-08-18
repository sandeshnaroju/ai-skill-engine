import { apiClient } from './client';

export const logsApi = {
  getExecutionLogs: (params = {}) =>
    apiClient.get('/api/v1/logs', { params }),

  getRequestLogs: (params = {}) =>
    apiClient.get('/api/v1/logs/requests', { params }),

  getRequestLogDetail: (requestId) =>
    apiClient.get(`/api/v1/logs/requests/${requestId}`),

  getUsageSummary: (params = {}) =>
    apiClient.get('/api/v1/logs/usage', { params }),
};
