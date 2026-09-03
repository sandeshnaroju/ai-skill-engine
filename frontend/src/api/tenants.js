import { apiClient } from './client';

export const tenantsApi = {
  list: (params = {}) =>
    apiClient.get('/api/v1/tenants', { params }),

  create: (name) =>
    apiClient.post('/api/v1/tenants', { name }),

  delete: (tenantId, confirmName) =>
    apiClient.delete(`/api/v1/tenants/${tenantId}`, { params: { confirm_name: confirmName } }),

  listLlms: (tenantKeyOrId = null, params = {}) =>
    apiClient.get('/api/v1/tenant/llms', { tenantKey: tenantKeyOrId, tenantId: tenantKeyOrId, params }),

  createLlm: (llmData, tenantKeyOrId = null) =>
    apiClient.post('/api/v1/tenant/llms', llmData, { tenantKey: tenantKeyOrId, tenantId: tenantKeyOrId }),

  updateLlm: (llmId, llmData, tenantKeyOrId = null) =>
    apiClient.put(`/api/v1/tenant/llms/${llmId}`, llmData, { tenantKey: tenantKeyOrId, tenantId: tenantKeyOrId }),

  deleteLlm: (llmId, tenantKeyOrId = null) =>
    apiClient.delete(`/api/v1/tenant/llms/${llmId}`, { tenantKey: tenantKeyOrId, tenantId: tenantKeyOrId }),

  getLimits: (tenantId) =>
    apiClient.get(`/api/v1/tenants/${tenantId}/limits`),

  updateLimits: (tenantId, limitsData) =>
    apiClient.put(`/api/v1/tenants/${tenantId}/limits`, limitsData),
};

