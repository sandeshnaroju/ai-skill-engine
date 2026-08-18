import { apiClient } from './client';

export const userDataApi = {
  list: (params = {}) =>
    apiClient.get('/api/v1/user_data_templates', { params }),

  get: (templateId) =>
    apiClient.get(`/api/v1/user_data_templates/${templateId}`),

  create: (name, description, data, tenantId = null) =>
    apiClient.post('/api/v1/user_data_templates', { name, description, data, tenant_id: tenantId }, { tenantId }),

  update: (templateId, name, description, data, tenantId = null) =>
    apiClient.put(`/api/v1/user_data_templates/${templateId}`, { name, description, data, tenant_id: tenantId }, { tenantId }),

  delete: (templateId, tenantId = null) =>
    apiClient.delete(`/api/v1/user_data_templates/${templateId}`, { tenantId }),
};
