import { apiClient } from './client';

export const skillsApi = {
  list: (params = {}) =>
    apiClient.get('/api/v1/skills', { params }),

  get: (skillName, tenantId = null) =>
    apiClient.get(`/api/v1/skills/${encodeURIComponent(skillName)}`, {
      params: tenantId ? { tenant_id: tenantId } : {}
    }),

  create: (skillName, content, tenantId = null) =>
    apiClient.post('/api/v1/skills', { skill_name: skillName, content, tenant_id: tenantId }),

  update: (skillName, content, tenantId = null) =>
    apiClient.put(`/api/v1/skills/${encodeURIComponent(skillName)}`, { skill_name: skillName, content, tenant_id: tenantId }),

  delete: (skillName, tenantId = null) =>
    apiClient.delete(`/api/v1/skills/${encodeURIComponent(skillName)}`, {
      params: tenantId ? { tenant_id: tenantId } : {}
    }),

  generate: (payload) =>
    apiClient.post('/api/v1/generator/generate', payload),

  duplicate: (skillName, targetTenantIds, newSkillName = null, sourceTenantId = null) =>
    apiClient.post(`/api/v1/skills/${encodeURIComponent(skillName)}/duplicate`, {
      target_tenant_ids: targetTenantIds,
      new_skill_name: newSkillName,
      source_tenant_id: sourceTenantId
    }),
};
