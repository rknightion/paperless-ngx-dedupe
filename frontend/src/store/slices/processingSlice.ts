import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { processingApi } from '../../services/api';
import type { ProcessingStatus, AnalyzeRequest, AnalyzeResponse } from '../../services/api/types';

// Async thunks
export const startAnalysis = createAsyncThunk(
  'processing/startAnalysis',
  async (request: AnalyzeRequest) => {
    return await processingApi.startAnalysis(request);
  }
);

export const fetchProcessingStatus = createAsyncThunk(
  'processing/fetchStatus',
  async () => {
    return await processingApi.getProcessingStatus();
  }
);

export const cancelProcessing = createAsyncThunk(
  'processing/cancel',
  async () => {
    return await processingApi.cancelProcessing();
  }
);

export const clearCache = createAsyncThunk(
  'processing/clearCache',
  async () => {
    return await processingApi.clearCache();
  }
);

// State interface
interface ProcessingState {
  status: ProcessingStatus;
  lastAnalysisRequest: AnalyzeRequest | null;
  history: Array<{
    id: string;
    started_at: string;
    completed_at?: string;
    status: 'completed' | 'failed' | 'cancelled';
    documents_processed: number;
    groups_found: number;
    error?: string;
  }>;
  loading: {
    start: boolean;
    cancel: boolean;
    clearCache: boolean;
    fetchStatus: boolean;
  };
  error: string | null;
  wsConnected: boolean;
  estimatedTimeRemaining: number | null;
  processingSpeed: number | null; // documents per minute
}

// Initial state
const initialState: ProcessingState = {
  status: {
    is_processing: false,
    current_step: '',
    progress: 0,
    total: 0,
    started_at: undefined,
    completed_at: undefined,
    error: undefined,
  },
  lastAnalysisRequest: null,
  history: [],
  loading: {
    start: false,
    cancel: false,
    clearCache: false,
    fetchStatus: false,
  },
  error: null,
  wsConnected: false,
  estimatedTimeRemaining: null,
  processingSpeed: null,
};

// Helper function to calculate estimated time remaining
const calculateTimeRemaining = (
  progress: number,
  total: number,
  startTime: string,
  currentTime: string
): number | null => {
  if (progress === 0 || !startTime) return null;
  
  const elapsed = new Date(currentTime).getTime() - new Date(startTime).getTime();
  const progressRatio = progress / total;
  const totalEstimated = elapsed / progressRatio;
  const remaining = totalEstimated - elapsed;
  
  return Math.max(0, Math.round(remaining / 1000)); // Return in seconds
};

// Helper function to calculate processing speed
const calculateProcessingSpeed = (
  progress: number,
  startTime: string,
  currentTime: string
): number | null => {
  if (progress === 0 || !startTime) return null;
  
  const elapsed = new Date(currentTime).getTime() - new Date(startTime).getTime();
  const elapsedMinutes = elapsed / (1000 * 60);
  
  return progress / elapsedMinutes; // documents per minute
};

// Slice
const processingSlice = createSlice({
  name: 'processing',
  initialState,
  reducers: {
    // WebSocket connection status
    setWebSocketConnected: (state, action: PayloadAction<boolean>) => {
      state.wsConnected = action.payload;
    },

    // Real-time processing updates (from WebSocket)
    updateProcessingStatus: (state, action: PayloadAction<ProcessingStatus>) => {
      const newStatus = action.payload;
      const currentTime = new Date().toISOString();
      
      state.status = newStatus;
      
      // Calculate estimated time remaining and processing speed
      if (newStatus.is_processing && newStatus.started_at) {
        state.estimatedTimeRemaining = calculateTimeRemaining(
          newStatus.progress,
          newStatus.total,
          newStatus.started_at,
          currentTime
        );
        
        state.processingSpeed = calculateProcessingSpeed(
          newStatus.progress,
          newStatus.started_at,
          currentTime
        );
      } else {
        state.estimatedTimeRemaining = null;
        state.processingSpeed = null;
      }
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Reset processing state (useful for cleanup)
    resetProcessingState: (state) => {
      state.status = initialState.status;
      state.estimatedTimeRemaining = null;
      state.processingSpeed = null;
      state.error = null;
    },

    // Add to processing history
    addToHistory: (state, action: PayloadAction<ProcessingState['history'][0]>) => {
      state.history.unshift(action.payload);
      // Keep only last 10 entries
      if (state.history.length > 10) {
        state.history = state.history.slice(0, 10);
      }
    },
  },
  extraReducers: (builder) => {
    // Start analysis
    builder
      .addCase(startAnalysis.pending, (state, action) => {
        state.loading.start = true;
        state.error = null;
        state.lastAnalysisRequest = action.meta.arg;
      })
      .addCase(startAnalysis.fulfilled, (state, action) => {
        state.loading.start = false;
        // The actual status will come from WebSocket updates
      })
      .addCase(startAnalysis.rejected, (state, action) => {
        state.loading.start = false;
        state.error = action.error.message || 'Failed to start analysis';
      })

      // Fetch status
      .addCase(fetchProcessingStatus.pending, (state) => {
        state.loading.fetchStatus = true;
      })
      .addCase(fetchProcessingStatus.fulfilled, (state, action) => {
        state.loading.fetchStatus = false;
        state.status = action.payload;
        
        // Calculate estimates if processing
        if (action.payload.is_processing && action.payload.started_at) {
          const currentTime = new Date().toISOString();
          state.estimatedTimeRemaining = calculateTimeRemaining(
            action.payload.progress,
            action.payload.total,
            action.payload.started_at,
            currentTime
          );
          
          state.processingSpeed = calculateProcessingSpeed(
            action.payload.progress,
            action.payload.started_at,
            currentTime
          );
        }
      })
      .addCase(fetchProcessingStatus.rejected, (state, action) => {
        state.loading.fetchStatus = false;
        state.error = action.error.message || 'Failed to fetch processing status';
      })

      // Cancel processing
      .addCase(cancelProcessing.pending, (state) => {
        state.loading.cancel = true;
        state.error = null;
      })
      .addCase(cancelProcessing.fulfilled, (state) => {
        state.loading.cancel = false;
        // Status update will come from WebSocket
      })
      .addCase(cancelProcessing.rejected, (state, action) => {
        state.loading.cancel = false;
        state.error = action.error.message || 'Failed to cancel processing';
      })

      // Clear cache
      .addCase(clearCache.pending, (state) => {
        state.loading.clearCache = true;
        state.error = null;
      })
      .addCase(clearCache.fulfilled, (state) => {
        state.loading.clearCache = false;
      })
      .addCase(clearCache.rejected, (state, action) => {
        state.loading.clearCache = false;
        state.error = action.error.message || 'Failed to clear cache';
      });
  },
});

export const {
  setWebSocketConnected,
  updateProcessingStatus,
  clearError,
  resetProcessingState,
  addToHistory,
} = processingSlice.actions;

export default processingSlice.reducer;