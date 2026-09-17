import { apiClient } from './client';

export const filesApi = {
  /**
   * List paginated files for the current tenant.
   * @param {Object} params - { provider, session_id, origin, source, search, page, page_size }
   * @param {Object} [options] - { tenantKey }
   */
  listTenantFiles: async (params = {}, options = {}) => {
    return apiClient.get('/api/v1/files/tenant', { params, ...options });
  },

  /**
   * List all files for a specific session thread.
   * @param {string} sessionId
   * @param {Object} [options] - { tenantKey }
   */
  listSessionFiles: async (sessionId, options = {}) => {
    return apiClient.get(`/api/v1/files/session/${encodeURIComponent(sessionId)}`, options);
  },

  /**
   * Delete an individual file by ID.
   * @param {string} fileId
   * @param {Object} [options] - { tenantKey }
   */
  deleteFile: async (fileId, options = {}) => {
    return apiClient.delete(`/api/v1/files/${encodeURIComponent(fileId)}`, options);
  },

  /**
   * Purge all storage files and sandbox caches for a specific session.
   * @param {string} sessionId
   * @param {Object} [params] - { origin }
   * @param {Object} [options] - { tenantKey }
   */
  purgeSession: async (sessionId, params = {}, options = {}) => {
    return apiClient.delete(`/api/v1/files/session/${encodeURIComponent(sessionId)}`, { params, ...options });
  },
};
