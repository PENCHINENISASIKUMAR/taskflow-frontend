import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

api.interceptors.response.use(
  response => response,
  error => {
    const path = error.config?.url || '';
    const publicAuthCall = ['/auth/login', '/auth/register', '/auth/csrf', '/auth/me'].some(route => path.includes(route));
    if (error.response?.status === 401 && !publicAuthCall) {
      window.dispatchEvent(new CustomEvent('taskflow:session-expired'));
    }
    return Promise.reject(error);
  },
);

export const apiClient = api;
export const authApi = api;
export const usersApi = api;
export const tasksApi = api;
export const ensureCsrf = () => api.get('/auth/csrf');
