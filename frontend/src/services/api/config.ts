import { apiClient } from './client';
import type {
  Configuration,
  TestConnectionResponse,
} from './types';

export const configApi = {
  // Get current configuration
  async getConfiguration(): Promise<Configuration> {
    return apiClient.get<Configuration>('/config/');
  },

  // Update configuration
  async updateConfiguration(config: Partial<Configuration>): Promise<Configuration> {
    return apiClient.put<Configuration>('/config/', config);
  },

  // Test paperless-ngx connection
  async testConnection(config?: {
    paperless_url: string;
    paperless_api_token?: string;
    paperless_username?: string;
    paperless_password?: string;
  }): Promise<TestConnectionResponse> {
    return apiClient.post<TestConnectionResponse>('/config/test-connection', config);
  },

  // Reset configuration to defaults
  async resetConfiguration(): Promise<Configuration> {
    return apiClient.post<Configuration>('/config/reset');
  },

  // Get configuration schema/defaults
  async getConfigurationDefaults(): Promise<Configuration> {
    return apiClient.get<Configuration>('/config/defaults');
  },

  // Validate configuration
  async validateConfiguration(config: Partial<Configuration>): Promise<{
    valid: boolean;
    errors: Record<string, string[]>;
  }> {
    return apiClient.post('/config/validate', config);
  },
};

export default configApi;