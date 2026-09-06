/**
 * frontend/src/api/artifacts.js
 * API client methods for Canvas Artifacts, Ephemeral Embed Tokens, and Real-Time SSE.
 */
import { apiClient } from './index';

export const artifactsApi = {
  getDetails: async (artifactId, token = null) => {
    const headers = {};
    if (token) headers['X-Embed-Token'] = token;
    const res = await apiClient.get(`/api/v1/artifacts/${artifactId}${token ? `?token=${encodeURIComponent(token)}` : ''}`, { headers });
    return res?.data !== undefined ? res.data : res;
  },

  getBlock: async (artifactId, blockKey, token = null) => {
    const headers = {};
    if (token) headers['X-Embed-Token'] = token;
    const res = await apiClient.get(`/api/v1/artifacts/${artifactId}/blocks/${blockKey}${token ? `?token=${encodeURIComponent(token)}` : ''}`, { headers });
    return res?.data !== undefined ? res.data : res;
  },

  updateBlock: async (artifactId, blockKey, content, summary = '', token = null) => {
    const headers = {};
    if (token) headers['X-Embed-Token'] = token;
    const res = await apiClient.put(`/api/v1/artifacts/${artifactId}/blocks/${blockKey}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      content,
      summary
    }, { headers });
    return res?.data !== undefined ? res.data : res;
  },

  getCommits: async (artifactId, blockKey = null, token = null) => {
    const headers = {};
    if (token) headers['X-Embed-Token'] = token;
    const qs = new URLSearchParams();
    if (blockKey) qs.set('block_key', blockKey);
    if (token) qs.set('token', token);
    const qStr = qs.toString() ? `?${qs.toString()}` : '';
    const res = await apiClient.get(`/api/v1/artifacts/${artifactId}/commits${qStr}`, { headers });
    return res?.data !== undefined ? res.data : res;
  },

  rollbackBlock: async (artifactId, blockKey, targetVersion, token = null) => {
    const headers = {};
    if (token) headers['X-Embed-Token'] = token;
    const res = await apiClient.post(`/api/v1/artifacts/${artifactId}/blocks/${blockKey}/rollback${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      target_version: targetVersion
    }, { headers });
    return res?.data !== undefined ? res.data : res;
  },

  refreshToken: async (artifactId, currentToken) => {
    const headers = { 'X-Embed-Token': currentToken };
    const res = await apiClient.post(`/api/v1/artifacts/${artifactId}/refresh-token`, {}, { headers });
    return res?.data !== undefined ? res.data : res;
  },

  mintEmbedToken: async (artifactId, expiresInMinutes = 30) => {
    const res = await apiClient.post(`/api/v1/artifacts/${artifactId}/embed-token?expires_in_minutes=${expiresInMinutes}`);
    return res?.data !== undefined ? res.data : res;
  },

  listByTenant: async (tenantId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.artifact_type && params.artifact_type !== 'all') qs.set('artifact_type', params.artifact_type);
    if (params.session_id) qs.set('session_id', params.session_id);
    if (params.page) qs.set('page', params.page);
    if (params.page_size) qs.set('page_size', params.page_size);
    const qStr = qs.toString() ? `?${qs.toString()}` : '';
    const res = await apiClient.get(`/api/v1/artifacts/tenant/${tenantId}${qStr}`);
    return res?.data !== undefined ? res.data : res;
  },

  deleteArtifact: async (artifactId) => {
    const res = await apiClient.delete(`/api/v1/artifacts/${artifactId}`);
    return res?.data !== undefined ? res.data : res;
  },

  getSessionArtifacts: async (sessionId) => {
    const res = await apiClient.get(`/api/v1/artifacts/session/${sessionId}`);
    return res?.data !== undefined ? res.data : res;
  },

  getExportUrl: (artifactId, token = null, format = null) => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (format) params.set('format', format);
    const qs = params.toString();
    return `/api/v1/artifacts/${artifactId}/export${qs ? `?${qs}` : ''}`;
  },

  getStreamUrl: (artifactId, token = null) => {
    return `/api/v1/artifacts/${artifactId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
};
