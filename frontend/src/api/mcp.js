import { apiClient } from './client';

export const mcpApi = {
  list: (params = {}) =>
    apiClient.get('/api/v1/mcp_servers', { params }),

  get: (mcpId) =>
    apiClient.get(`/api/v1/mcp_servers/${mcpId}`),

  create: (serverData, tenantId = null) =>
    apiClient.post('/api/v1/mcp_servers', serverData, { tenantId }),

  update: (mcpId, serverData, tenantId = null) =>
    apiClient.put(`/api/v1/mcp_servers/${mcpId}`, serverData, { tenantId }),

  delete: (mcpId, tenantId = null) =>
    apiClient.delete(`/api/v1/mcp_servers/${mcpId}`, { tenantId }),

  refresh: (mcpId, tenantId = null) =>
    apiClient.post(`/api/v1/mcp_servers/${mcpId}/sync`, null, { tenantId }),
};
