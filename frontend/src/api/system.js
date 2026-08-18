import { apiClient } from './client';

export const systemApi = {
  getStatus: () =>
    apiClient.get('/api/v1/system/status'),

  getProviders: () =>
    apiClient.get('/api/v1/system/providers'),

  getSystemLlms: () =>
    apiClient.get('/api/v1/system/llms'),

  getEmailConfig: () =>
    apiClient.get('/api/v1/system/email-config'),

  saveEmailConfig: (configData) =>
    apiClient.post('/api/v1/system/email-config', configData),

  testEmailConfig: (testEmail = null) =>
    apiClient.post('/api/v1/system/email-config/test', { test_email: testEmail }),

  getStorageConfig: () =>
    apiClient.get('/api/v1/system/storage-config'),

  saveStorageConfig: (configData) =>
    apiClient.post('/api/v1/system/storage-config', configData),

  testStorageConfig: () =>
    apiClient.post('/api/v1/system/storage-config/test'),

  getSandboxConfig: () =>
    apiClient.get('/api/v1/system/sandbox-config'),

  saveSandboxConfig: (configData) =>
    apiClient.post('/api/v1/system/sandbox-config', configData),

  testSandboxConfig: () =>
    apiClient.post('/api/v1/system/sandbox-config/test'),
};
