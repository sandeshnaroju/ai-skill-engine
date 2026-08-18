import { apiClient } from './client';

export const authApi = {
  login: (email, password) =>
    apiClient.post('/api/v1/auth/login', { email, password }),

  register: (email, password) =>
    apiClient.post('/api/v1/auth/register', { email, password }),

  logout: () =>
    apiClient.post('/api/v1/auth/logout'),

  verifyOtp: (email, otpCode) =>
    apiClient.post('/api/v1/auth/verify-otp', { email, otp_code: otpCode }),

  resendOtp: (email) =>
    apiClient.post('/api/v1/auth/resend-otp', { email }),

  forgotPassword: (email) =>
    apiClient.post('/api/v1/auth/forgot-password', { email }),

  resetPassword: (token, password) =>
    apiClient.post('/api/v1/auth/reset-password', { token, password }),

  getProfile: () =>
    apiClient.get('/api/v1/auth/me', { silent: true }),

  updateProfile: (data) =>
    apiClient.put('/api/v1/auth/me', data),
};
