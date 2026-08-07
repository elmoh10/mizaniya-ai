import { getCurrentIdToken } from '../config/firebaseClient';

const API_BASE = '/api/v1';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
  [key: string]: any;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await getCurrentIdToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE}${cleanEndpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.warn(`API Authorization error (${res.status}) on ${url}`);
      }
      return {
        success: false,
        error: body.error || `HTTP ${res.status}: ${res.statusText}`,
        details: body.details,
      };
    }

    return body;
  } catch (err: any) {
    console.error(`API Fetch Failure on ${url}:`, err);
    return {
      success: false,
      error: err.message || 'Network request failed',
    };
  }
}

export const apiClient = {
  get: <T = any>(endpoint: string, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'GET', headers }),

  post: <T = any>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'POST', body: JSON.stringify(body), headers }),

  patch: <T = any>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body), headers }),

  delete: <T = any>(endpoint: string, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'DELETE', headers }),
};
