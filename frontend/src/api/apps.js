import { apiClient } from './client';

export const appsApi = {
  list: (params = {}) =>
    apiClient.get('/api/v1/apps', { params }),

  get: (appId) =>
    apiClient.get(`/api/v1/apps/${appId}`),

  create: (dataOrName, description = '', icon = 'box', skillNames = []) => {
    if (typeof dataOrName === 'object' && dataOrName !== null) {
      return apiClient.post('/api/v1/apps', dataOrName);
    }
    return apiClient.post('/api/v1/apps', { name: dataOrName, description, icon, skill_names: skillNames });
  },

  update: (appId, dataOrName, description, icon, skillNames) => {
    if (typeof dataOrName === 'object' && dataOrName !== null) {
      return apiClient.post('/api/v1/apps', { ...dataOrName, id: appId });
    }
    return apiClient.post('/api/v1/apps', { id: appId, name: dataOrName, description, icon, skill_names: skillNames });
  },

  delete: (appId) =>
    apiClient.delete(`/api/v1/apps/${appId}`),

  updateSkills: (appId, skillNames) =>
    apiClient.put(`/api/v1/apps/${appId}/skills`, { skill_names: skillNames }),

  duplicate: (appId, targetTenantIds, newAppName = null) =>
    apiClient.post(`/api/v1/apps/${appId}/duplicate`, {
      target_tenant_ids: targetTenantIds,
      new_app_name: newAppName
    }),
};
