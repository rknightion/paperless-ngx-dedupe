import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { documentsApi } from '../../services/api';
import type {
  Document,
  DocumentListResponse as _DocumentListResponse,
  DocumentQueryParams,
} from '../../services/api/types';

// Async thunks
export const fetchDocuments = createAsyncThunk(
  'documents/fetchDocuments',
  async (params?: DocumentQueryParams) => {
    return await documentsApi.getDocuments(params);
  }
);

export const fetchDocument = createAsyncThunk(
  'documents/fetchDocument',
  async (id: number) => {
    return await documentsApi.getDocument(id);
  }
);

export const syncDocuments = createAsyncThunk(
  'documents/syncDocuments',
  async () => {
    return await documentsApi.syncDocuments();
  }
);

// State interface
interface DocumentsState {
  documents: Document[];
  currentDocument: Document | null;
  pagination: {
    count: number;
    next: string | null;
    previous: string | null;
    currentPage: number;
    pageSize: number;
  };
  filters: {
    search: string;
    processing_status: string;
    ordering: string;
  };
  selectedDocuments: number[];
  loading: {
    list: boolean;
    single: boolean;
    sync: boolean;
  };
  error: string | null;
  lastSyncedAt: string | null;
  syncStatus: {
    is_syncing: boolean;
    current_step: string;
    progress: number;
    total: number;
    error: string | null;
    documents_synced: number;
    documents_updated: number;
    started_at: string | null;
    completed_at: string | null;
  } | null;
}

// Initial state
const initialState: DocumentsState = {
  documents: [],
  currentDocument: null,
  pagination: {
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
    pageSize: 25,
  },
  filters: {
    search: '',
    processing_status: '',
    ordering: '-created',
  },
  selectedDocuments: [],
  loading: {
    list: false,
    single: false,
    sync: false,
  },
  error: null,
  lastSyncedAt: null,
  syncStatus: null,
};

// Slice
const documentsSlice = createSlice({
  name: 'documents',
  initialState,
  reducers: {
    // Filter actions
    setSearchFilter: (state, action: PayloadAction<string>) => {
      state.filters.search = action.payload;
      state.pagination.currentPage = 1;
    },
    setProcessingStatusFilter: (state, action: PayloadAction<string>) => {
      state.filters.processing_status = action.payload;
      state.pagination.currentPage = 1;
    },
    setOrdering: (state, action: PayloadAction<string>) => {
      state.filters.ordering = action.payload;
      state.pagination.currentPage = 1;
    },

    // Pagination actions
    setCurrentPage: (state, action: PayloadAction<number>) => {
      state.pagination.currentPage = action.payload;
    },
    setPageSize: (state, action: PayloadAction<number>) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },

    // Selection actions
    selectDocument: (state, action: PayloadAction<number>) => {
      if (!state.selectedDocuments.includes(action.payload)) {
        state.selectedDocuments.push(action.payload);
      }
    },
    deselectDocument: (state, action: PayloadAction<number>) => {
      state.selectedDocuments = state.selectedDocuments.filter(
        (id) => id !== action.payload
      );
    },
    selectAllDocuments: (state) => {
      state.selectedDocuments = state.documents.map((doc) => doc.id);
    },
    clearSelection: (state) => {
      state.selectedDocuments = [];
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Update document status (for real-time updates)
    updateDocumentStatus: (
      state,
      action: PayloadAction<{
        id: number;
        processing_status: Document['processing_status'];
      }>
    ) => {
      const document = state.documents.find(
        (doc) => doc.id === action.payload.id
      );
      if (document) {
        document.processing_status = action.payload.processing_status;
      }
      if (state.currentDocument?.id === action.payload.id) {
        state.currentDocument.processing_status =
          action.payload.processing_status;
      }
    },

    // Sync status updates (from WebSocket)
    updateSyncStatus: (state, action: PayloadAction<any>) => {
      state.syncStatus = action.payload;
    },

    syncCompleted: (state, action: PayloadAction<any>) => {
      const payload = action.payload || {};
      const completedAt =
        payload.completed_at ||
        state.syncStatus?.completed_at ||
        new Date().toISOString();

      const baseStatus =
        state.syncStatus || {
          is_syncing: false,
          current_step: '',
          progress: 0,
          total: 0,
          error: null,
          documents_synced: 0,
          documents_updated: 0,
          started_at: null,
          completed_at: null,
        };

      state.syncStatus = {
        ...baseStatus,
        ...payload,
        is_syncing: false,
        current_step: payload.current_step || 'Completed',
        completed_at: completedAt,
      } as any;

      const status = state.syncStatus as NonNullable<DocumentsState['syncStatus']>;
      if (payload.documents_synced !== undefined) {
        status.documents_synced = payload.documents_synced;
      }
      if (payload.documents_updated !== undefined) {
        status.documents_updated = payload.documents_updated;
      }
      if (payload.total !== undefined) {
        status.total = payload.total;
        status.progress = payload.progress ?? payload.total;
      }

      state.lastSyncedAt = completedAt;
    },
  },
  extraReducers: (builder) => {
    // Fetch documents
    builder
      .addCase(fetchDocuments.pending, (state) => {
        state.loading.list = true;
        state.error = null;
      })
      .addCase(fetchDocuments.fulfilled, (state, action) => {
        state.loading.list = false;
        state.documents = action.payload.results;
        state.pagination.count = action.payload.count;
        state.pagination.next = action.payload.next || null;
        state.pagination.previous = action.payload.previous || null;
      })
      .addCase(fetchDocuments.rejected, (state, action) => {
        state.loading.list = false;
        state.error = action.error.message || 'Failed to fetch documents';
      })

      // Fetch single document
      .addCase(fetchDocument.pending, (state) => {
        state.loading.single = true;
        state.error = null;
      })
      .addCase(fetchDocument.fulfilled, (state, action) => {
        state.loading.single = false;
        state.currentDocument = action.payload;
      })
      .addCase(fetchDocument.rejected, (state, action) => {
        state.loading.single = false;
        state.error = action.error.message || 'Failed to fetch document';
      })

      // Sync documents
      .addCase(syncDocuments.pending, (state) => {
        state.loading.sync = true;
        state.error = null;
      })
      .addCase(syncDocuments.fulfilled, (state) => {
        state.loading.sync = false;
        state.lastSyncedAt = new Date().toISOString();
      })
      .addCase(syncDocuments.rejected, (state, action) => {
        state.loading.sync = false;
        state.error = action.error.message || 'Failed to sync documents';
      });
  },
});

export const {
  setSearchFilter,
  setProcessingStatusFilter,
  setOrdering,
  setCurrentPage,
  setPageSize,
  selectDocument,
  deselectDocument,
  selectAllDocuments,
  clearSelection,
  clearError,
  updateDocumentStatus,
  updateSyncStatus,
  syncCompleted,
} = documentsSlice.actions;

export default documentsSlice.reducer;
