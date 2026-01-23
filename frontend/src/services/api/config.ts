import { apiClient } from './client';
import type {
  Configuration,
  ConfigurationResponse,
  ConfigValidationResponse,
  TestConnectionResponse,
} from './types';

export const configApi = {
  // Get current configuration
  async getConfiguration(): Promise<Configuration> {
    return apiClient.get<Configuration>('/config/');
  },

  // Update configuration
  async updateConfiguration(
    config: Partial<Configuration>
  ): Promise<ConfigurationResponse> {
    return apiClient.put<ConfigurationResponse>('/config/', config);
  },

  // Test paperless-ngx connection
  async testConnection(config?: {
    paperless_url: string;
    paperless_api_token?: string;
    paperless_username?: string;
    paperless_password?: string;
  }): Promise<TestConnectionResponse> {
    return apiClient.post<TestConnectionResponse>(
      '/config/test-connection',
      config
    );
  },

  // Reset configuration to defaults
  async resetConfiguration(): Promise<ConfigurationResponse> {
    return apiClient.post<ConfigurationResponse>('/config/reset');
  },

  // Get configuration schema/defaults
  async getConfigurationDefaults(): Promise<Configuration> {
    return apiClient.get<Configuration>('/config/defaults');
  },

  // Validate configuration
  async validateConfiguration(
    config: Partial<Configuration>
  ): Promise<ConfigValidationResponse> {
    return apiClient.post<ConfigValidationResponse>('/config/validate', config);
  },
};

export default configApi;
