import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { duplicatesApi } from "../../services/api";
import type {
  DuplicateGroup,
  DuplicateGroupsResponse as _DuplicateGroupsResponse,
  DuplicateGroupQueryParams,
  DuplicateStatistics,
} from "../../services/api/types";

// Async thunks
export const fetchDuplicateGroups = createAsyncThunk(
  "duplicates/fetchDuplicateGroups",
  async (params?: DuplicateGroupQueryParams) => {
    return await duplicatesApi.getDuplicateGroups(params);
  },
);

export const fetchDuplicateGroup = createAsyncThunk(
  "duplicates/fetchDuplicateGroup",
  async (id: string) => {
    return await duplicatesApi.getDuplicateGroup(id);
  },
);

export const reviewDuplicateGroup = createAsyncThunk(
  "duplicates/reviewDuplicateGroup",
  async ({ id, reviewed }: { id: string; reviewed: boolean }) => {
    await duplicatesApi.reviewDuplicateGroup(id, reviewed);
    return { id, reviewed };
  },
);

export const deleteDuplicateGroup = createAsyncThunk(
  "duplicates/deleteDuplicateGroup",
  async (id: string) => {
    await duplicatesApi.deleteDuplicateGroup(id);
    return id;
  },
);

export const fetchDuplicateStatistics = createAsyncThunk(
  "duplicates/fetchStatistics",
  async () => {
    return await duplicatesApi.getDuplicateStatistics();
  },
);

export const bulkReviewGroups = createAsyncThunk(
  "duplicates/bulkReviewGroups",
  async ({ groupIds, reviewed }: { groupIds: string[]; reviewed: boolean }) => {
    await duplicatesApi.bulkReviewGroups(groupIds, reviewed);
    return { groupIds, reviewed };
  },
);

// State interface
interface DuplicatesState {
  groups: DuplicateGroup[];
  currentGroup: DuplicateGroup | null;
  statistics: DuplicateStatistics | null;
  pagination: {
    count: number;
    currentPage: number;
    pageSize: number;
  };
  filters: {
    reviewed: boolean | null;
    minConfidence: number;
  };
  selectedGroups: string[];
  loading: {
    groups: boolean;
    singleGroup: boolean;
    statistics: boolean;
    review: boolean;
    delete: boolean;
    bulkActions: boolean;
  };
  error: string | null;
}

// Initial state
const initialState: DuplicatesState = {
  groups: [],
  currentGroup: null,
  statistics: null,
  pagination: {
    count: 0,
    currentPage: 1,
    pageSize: 20,
  },
  filters: {
    reviewed: null, // null = all, true = reviewed, false = unreviewed
    minConfidence: 0.7,
  },
  selectedGroups: [],
  loading: {
    groups: false,
    singleGroup: false,
    statistics: false,
    review: false,
    delete: false,
    bulkActions: false,
  },
  error: null,
};

// Slice
const duplicatesSlice = createSlice({
  name: "duplicates",
  initialState,
  reducers: {
    // Filter actions
    setReviewedFilter: (state, action: PayloadAction<boolean | null>) => {
      state.filters.reviewed = action.payload;
      state.pagination.currentPage = 1;
    },
    setMinConfidenceFilter: (state, action: PayloadAction<number>) => {
      state.filters.minConfidence = action.payload;
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
    selectGroup: (state, action: PayloadAction<string>) => {
      if (!state.selectedGroups.includes(action.payload)) {
        state.selectedGroups.push(action.payload);
      }
    },
    deselectGroup: (state, action: PayloadAction<string>) => {
      state.selectedGroups = state.selectedGroups.filter(
        (id) => id !== action.payload,
      );
    },
    selectAllGroups: (state) => {
      state.selectedGroups = state.groups.map((group) => group.id);
    },
    toggleGroupSelection: (state, action: PayloadAction<string>) => {
      const index = state.selectedGroups.indexOf(action.payload);
      if (index > -1) {
        state.selectedGroups.splice(index, 1);
      } else {
        state.selectedGroups.push(action.payload);
      }
    },
    clearSelection: (state) => {
      state.selectedGroups = [];
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Local updates (for optimistic updates)
    updateGroupReviewStatus: (
      state,
      action: PayloadAction<{
        id: string;
        reviewed: boolean;
      }>,
    ) => {
      const group = state.groups.find((g) => g.id === action.payload.id);
      if (group) {
        group.reviewed = action.payload.reviewed;
      }
      if (state.currentGroup?.id === action.payload.id) {
        state.currentGroup.reviewed = action.payload.reviewed;
      }
    },

    removeGroup: (state, action: PayloadAction<string>) => {
      state.groups = state.groups.filter(
        (group) => group.id !== action.payload,
      );
      state.selectedGroups = state.selectedGroups.filter(
        (id) => id !== action.payload,
      );
      if (state.currentGroup?.id === action.payload) {
        state.currentGroup = null;
      }
    },
  },
  extraReducers: (builder) => {
    // Fetch duplicate groups
    builder
      .addCase(fetchDuplicateGroups.pending, (state) => {
        state.loading.groups = true;
        state.error = null;
      })
      .addCase(fetchDuplicateGroups.fulfilled, (state, action) => {
        state.loading.groups = false;
        // The API returns an object with groups array and pagination info
        const payload = action.payload as any; // Type assertion to handle the response
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          state.groups = payload.groups || [];
          state.pagination.count = payload.count || 0;
          state.pagination.currentPage = payload.page || 1;
          state.pagination.pageSize = payload.page_size || 100;
        } else if (Array.isArray(payload)) {
          // Fallback for old API format
          state.groups = payload;
          state.pagination.count = payload.length;
        }
      })
      .addCase(fetchDuplicateGroups.rejected, (state, action) => {
        state.loading.groups = false;
        state.error =
          action.error.message || "Failed to fetch duplicate groups";
      })

      // Fetch single group
      .addCase(fetchDuplicateGroup.pending, (state) => {
        state.loading.singleGroup = true;
        state.error = null;
      })
      .addCase(fetchDuplicateGroup.fulfilled, (state, action) => {
        state.loading.singleGroup = false;
        state.currentGroup = action.payload;
      })
      .addCase(fetchDuplicateGroup.rejected, (state, action) => {
        state.loading.singleGroup = false;
        state.error = action.error.message || "Failed to fetch duplicate group";
      })

      // Review group
      .addCase(reviewDuplicateGroup.pending, (state) => {
        state.loading.review = true;
      })
      .addCase(reviewDuplicateGroup.fulfilled, (state, action) => {
        state.loading.review = false;
        const { id, reviewed } = action.payload;
        const group = state.groups.find((g) => g.id === id);
        if (group) {
          group.reviewed = reviewed;
        }
        if (state.currentGroup?.id === id) {
          state.currentGroup.reviewed = reviewed;
        }
      })
      .addCase(reviewDuplicateGroup.rejected, (state, action) => {
        state.loading.review = false;
        state.error = action.error.message || "Failed to update review status";
      })

      // Delete group
      .addCase(deleteDuplicateGroup.pending, (state) => {
        state.loading.delete = true;
      })
      .addCase(deleteDuplicateGroup.fulfilled, (state, action) => {
        state.loading.delete = false;
        state.groups = state.groups.filter(
          (group) => group.id !== action.payload,
        );
        state.selectedGroups = state.selectedGroups.filter(
          (id) => id !== action.payload,
        );
        if (state.currentGroup?.id === action.payload) {
          state.currentGroup = null;
        }
      })
      .addCase(deleteDuplicateGroup.rejected, (state, action) => {
        state.loading.delete = false;
        state.error = action.error.message || "Failed to delete group";
      })

      // Statistics
      .addCase(fetchDuplicateStatistics.pending, (state) => {
        state.loading.statistics = true;
      })
      .addCase(fetchDuplicateStatistics.fulfilled, (state, action) => {
        state.loading.statistics = false;
        state.statistics = action.payload;
      })
      .addCase(fetchDuplicateStatistics.rejected, (state, action) => {
        state.loading.statistics = false;
        state.error = action.error.message || "Failed to fetch statistics";
      })

      // Bulk operations
      .addCase(bulkReviewGroups.pending, (state) => {
        state.loading.bulkActions = true;
      })
      .addCase(bulkReviewGroups.fulfilled, (state, action) => {
        state.loading.bulkActions = false;
        const { groupIds, reviewed } = action.payload;
        groupIds.forEach((id) => {
          const group = state.groups.find((g) => g.id === id);
          if (group) {
            group.reviewed = reviewed;
          }
        });
        state.selectedGroups = [];
      })
      .addCase(bulkReviewGroups.rejected, (state, action) => {
        state.loading.bulkActions = false;
        state.error =
          action.error.message || "Failed to perform bulk operation";
      });
  },
});

export const {
  setReviewedFilter,
  setMinConfidenceFilter,
  setCurrentPage,
  setPageSize,
  selectGroup,
  deselectGroup,
  selectAllGroups,
  toggleGroupSelection,
  clearSelection,
  clearError,
  updateGroupReviewStatus,
  removeGroup,
} = duplicatesSlice.actions;

export default duplicatesSlice.reducer;
