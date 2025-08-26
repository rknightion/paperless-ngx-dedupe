import type { ApiError } from './types';

// API Configuration
// Use relative URL to work with nginx proxy
const API_BASE_URL = ''; // Empty string means use same origin
const API_VERSION = 'v1';

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/${API_VERSION}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({
          detail: `HTTP ${response.status}: ${response.statusText}`,
          status_code: response.status,
        }));
        throw new Error(
          errorData.detail || `Request failed with status ${response.status}`
        );
      }

      // Handle empty responses (like DELETE requests)
      if (response.status === 204) {
        return {} as T;
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network request failed');
    }
  }

  // HTTP Methods
  async get<T = any>(
    endpoint: string,
    params?: Record<string, any>
  ): Promise<T> {
    let searchParams = '';
    if (params) {
      // Filter out undefined values before creating URLSearchParams
      const filteredParams = Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);
      
      if (Object.keys(filteredParams).length > 0) {
        searchParams = `?${new URLSearchParams(filteredParams).toString()}`;
      }
    }
    return this.request<T>(`${endpoint}${searchParams}`);
  }

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // Utility methods
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  setAuthHeader(token: string): void {
    this.defaultHeaders = {
      ...this.defaultHeaders,
      Authorization: `Bearer ${token}`,
    };
  }

  removeAuthHeader(): void {
    const { Authorization: _Authorization, ...rest } = this
      .defaultHeaders as any;
    this.defaultHeaders = rest;
  }
}

// Create and export singleton instance
export const apiClient = new ApiClient();
export default apiClient;
