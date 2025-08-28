import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { configApi } from '../../services/api';
import type {
  Configuration,
  TestConnectionResponse,
} from '../../services/api/types';

// Async thunks
export const fetchConfiguration = createAsyncThunk(
  'config/fetchConfiguration',
  async () => {
    return await configApi.getConfiguration();
  }
);

export const updateConfiguration = createAsyncThunk(
  'config/updateConfiguration',
  async (config: Partial<Configuration>) => {
    return await configApi.updateConfiguration(config);
  }
);

export const testConnection = createAsyncThunk(
  'config/testConnection',
  async (connectionConfig?: {
    paperless_url: string;
    paperless_api_token?: string;
    paperless_username?: string;
    paperless_password?: string;
  }) => {
    return await configApi.testConnection(connectionConfig);
  }
);

export const resetConfiguration = createAsyncThunk(
  'config/resetConfiguration',
  async () => {
    return await configApi.resetConfiguration();
  }
);

export const fetchConfigurationDefaults = createAsyncThunk(
  'config/fetchDefaults',
  async () => {
    return await configApi.getConfigurationDefaults();
  }
);

// State interface
interface ConfigState {
  configuration: Configuration | null;
  defaults: Configuration | null;
  connectionStatus: {
    isConnected: boolean;
    lastTested: string | null;
    testResult: TestConnectionResponse | null;
  };
  formData: Partial<Configuration>;
  hasUnsavedChanges: boolean;
  loading: {
    fetch: boolean;
    update: boolean;
    testConnection: boolean;
    reset: boolean;
  };
  error: string | null;
  validationErrors: Record<string, string[]>;
}

// Initial state
const initialState: ConfigState = {
  configuration: null,
  defaults: null,
  connectionStatus: {
    isConnected: false,
    lastTested: null,
    testResult: null,
  },
  formData: {},
  hasUnsavedChanges: false,
  loading: {
    fetch: false,
    update: false,
    testConnection: false,
    reset: false,
  },
  error: null,
  validationErrors: {},
};

// Slice
const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    // Form data management
    updateFormData: (state, action: PayloadAction<Partial<Configuration>>) => {
      state.formData = { ...state.formData, ...action.payload };
      state.hasUnsavedChanges = true;
      state.validationErrors = {}; // Clear validation errors when user types
    },

    setFormData: (state, action: PayloadAction<Partial<Configuration>>) => {
      state.formData = action.payload;
      state.hasUnsavedChanges = false;
    },

    resetFormData: (state) => {
      state.formData = state.configuration || {};
      state.hasUnsavedChanges = false;
      state.validationErrors = {};
    },

    // Validation
    setValidationErrors: (
      state,
      action: PayloadAction<Record<string, string[]>>
    ) => {
      state.validationErrors = action.payload;
    },

    clearValidationErrors: (state) => {
      state.validationErrors = {};
    },

    // Connection status
    setConnectionStatus: (state, action: PayloadAction<boolean>) => {
      state.connectionStatus.isConnected = action.payload;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Clear connection test result
    clearConnectionTest: (state) => {
      state.connectionStatus.testResult = null;
      state.connectionStatus.lastTested = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch configuration
    builder
      .addCase(fetchConfiguration.pending, (state) => {
        state.loading.fetch = true;
        state.error = null;
      })
      .addCase(fetchConfiguration.fulfilled, (state, action) => {
        state.loading.fetch = false;
        state.configuration = action.payload;
        state.formData = action.payload;
        state.hasUnsavedChanges = false;
      })
      .addCase(fetchConfiguration.rejected, (state, action) => {
        state.loading.fetch = false;
        state.error = action.error.message || 'Failed to fetch configuration';
      })

      // Update configuration
      .addCase(updateConfiguration.pending, (state) => {
        state.loading.update = true;
        state.error = null;
        state.validationErrors = {};
      })
      .addCase(updateConfiguration.fulfilled, (state, action) => {
        state.loading.update = false;
        state.configuration = action.payload;
        state.formData = action.payload;
        state.hasUnsavedChanges = false;
      })
      .addCase(updateConfiguration.rejected, (state, action) => {
        state.loading.update = false;

        // Try to parse validation errors from error message
        const errorMessage =
          action.error.message || 'Failed to update configuration';
        try {
          const errorData = JSON.parse(errorMessage);
          if (errorData.errors) {
            state.validationErrors = errorData.errors;
          }
        } catch {
          state.error = errorMessage;
        }
      })

      // Test connection
      .addCase(testConnection.pending, (state) => {
        state.loading.testConnection = true;
        state.error = null;
        state.connectionStatus.testResult = null;
      })
      .addCase(testConnection.fulfilled, (state, action) => {
        state.loading.testConnection = false;
        state.connectionStatus.testResult = action.payload;
        state.connectionStatus.isConnected = action.payload.success;
        state.connectionStatus.lastTested = new Date().toISOString();
      })
      .addCase(testConnection.rejected, (state, action) => {
        state.loading.testConnection = false;
        state.connectionStatus.testResult = {
          success: false,
          message: action.error.message || 'Connection test failed',
        };
        state.connectionStatus.isConnected = false;
        state.connectionStatus.lastTested = new Date().toISOString();
      })

      // Reset configuration
      .addCase(resetConfiguration.pending, (state) => {
        state.loading.reset = true;
        state.error = null;
      })
      .addCase(resetConfiguration.fulfilled, (state, action) => {
        state.loading.reset = false;
        state.configuration = action.payload;
        state.formData = action.payload;
        state.hasUnsavedChanges = false;
        state.validationErrors = {};
      })
      .addCase(resetConfiguration.rejected, (state, action) => {
        state.loading.reset = false;
        state.error = action.error.message || 'Failed to reset configuration';
      })

      // Fetch defaults
      .addCase(fetchConfigurationDefaults.fulfilled, (state, action) => {
        state.defaults = action.payload;
      });
  },
});

export const {
  updateFormData,
  setFormData,
  resetFormData,
  setValidationErrors,
  clearValidationErrors,
  setConnectionStatus,
  clearError,
  clearConnectionTest,
} = configSlice.actions;

export default configSlice.reducer;
