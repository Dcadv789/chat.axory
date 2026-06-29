import axios from 'axios';
import { refreshAccessToken } from './auth-refresh';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const orgId = localStorage.getItem('active_org_id');
    if (orgId) {
      config.headers['x-organization-id'] = orgId;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken && !error.config._retry) {
        error.config._retry = true;
        // Single-flight compartilhado: 401s concorrentes reusam o mesmo refresh.
        const ok = await refreshAccessToken();
        if (ok) {
          error.config.headers.Authorization = `Bearer ${localStorage.getItem('access_token')}`;
          return api(error.config);
        }
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('active_org_id');
        window.location.href = '/login';
      }
    }
    const message = error.response?.data?.message || error.message;
    return Promise.reject(new Error(Array.isArray(message) ? message[0] : message));
  },
);
