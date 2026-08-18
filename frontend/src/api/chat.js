import { apiClient } from './client';

export const chatApi = {
  createCompletion: (payload, tenantKey = null) =>
    apiClient.post('/api/v1/chat/completions', payload, { tenantKey }),

  createStream: (payload, tenantKey = null, options = {}) =>
    apiClient.fetchRaw('/api/v1/chat/completions', {
      method: 'POST',
      body: payload,
      tenantKey,
      apiKey: options.apiKey || null,
      headers: {
        'X-Request-Source': options.source || 'dashboard',
        ...(options.headers || {})
      },
      signal: options.signal
    }),

  getHistory: (sessionId, tenantKey = null) =>
    apiClient.get('/api/v1/chat/history', { params: { session_id: sessionId }, tenantKey }),

  clearHistory: (sessionId, tenantKey = null) =>
    apiClient.delete('/api/v1/chat/history', { params: { session_id: sessionId }, tenantKey }),
};
