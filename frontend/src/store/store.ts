import { configureStore, Middleware } from '@reduxjs/toolkit';
import { documentsSlice, duplicatesSlice, processingSlice, configSlice } from './slices';
import { updateProcessingStatus, setWebSocketConnected } from './slices/processingSlice';
import { updateDocumentStatus } from './slices/documentsSlice';
import { wsClient } from '../services/websocket';

// WebSocket middleware for real-time updates
const webSocketMiddleware: Middleware = (store) => (next) => (action: any) => {
  const result = next(action);

  // Initialize WebSocket connection when store is ready
  if (action.type === 'store/init') {
    wsClient.connect()
      .then(() => {
        store.dispatch(setWebSocketConnected(true));
        
        // Set up WebSocket event listeners
        wsClient.on('processing_update', (status) => {
          store.dispatch(updateProcessingStatus(status));
        });

        wsClient.on('error', (error) => {
          console.error('WebSocket error:', error);
          store.dispatch(setWebSocketConnected(false));
        });

        wsClient.on('processing_completed', (data) => {
          console.log('Processing completed:', data);
          // Could trigger notifications or other side effects here
        });

        wsClient.on('max_reconnect_attempts_reached', () => {
          store.dispatch(setWebSocketConnected(false));
          console.error('WebSocket max reconnection attempts reached');
        });
      })
      .catch((error) => {
        console.error('Failed to connect WebSocket:', error);
        store.dispatch(setWebSocketConnected(false));
      });
  }

  return result;
};

// Configure store
export const store = configureStore({
  reducer: {
    documents: documentsSlice,
    duplicates: duplicatesSlice,
    processing: processingSlice,
    config: configSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for serializable check
        ignoredActions: ['processing/updateProcessingStatus'],
      },
    }).concat(webSocketMiddleware),
  devTools: import.meta.env?.DEV !== false,
});

// Initialize WebSocket
store.dispatch({ type: 'store/init' });

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Type-safe hooks
export type AppStore = typeof store;