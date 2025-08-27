import type { ProcessingStatus } from "../api/types";

type WebSocketEventCallback = (data: any) => void;
type ProcessingUpdateCallback = (status: ProcessingStatus) => void;
type SyncUpdateCallback = (status: any) => void;
type ErrorCallback = (error: string) => void;

interface WebSocketMessage {
  type: string;
  data: any;
}

class WebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, WebSocketEventCallback[]> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(url: string = "") {
    // Build WebSocket URL based on current location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    this.url = url || `${protocol}//${host}/ws`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket && this.isConnected) {
        resolve();
        return;
      }

      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          console.log("WebSocket connected");
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Start ping interval to keep connection alive
          this.startPingInterval();

          resolve();
        };

        this.socket.onclose = (event) => {
          console.log("WebSocket disconnected:", event.code, event.reason);
          this.isConnected = false;
          this.stopPingInterval();

          // Auto-reconnect unless it was a normal closure
          if (event.code !== 1000) {
            this.handleReconnection();
          }
        };

        this.socket.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.isConnected = false;

          if (this.reconnectAttempts === 0) {
            reject(new Error("Failed to connect to WebSocket"));
          }
        };

        this.socket.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };
      } catch (error) {
        console.error("Failed to create WebSocket:", error);
        reject(error);
      }
    });
  }

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case "connection_established":
        console.log("Connection established:", message.data);
        break;

      case "processing_update":
        this.emit("processing_update", message.data);
        break;

      case "error":
        this.emit("error", message.data);
        break;

      case "processing_completed":
        this.emit("processing_completed", message.data);
        break;

      case "sync_update":
        this.emit("sync_update", message.data);
        break;

      case "sync_completed":
        this.emit("sync_completed", message.data);
        break;

      case "pong":
        // Pong received, connection is alive
        break;

      default:
        console.log("Unknown message type:", message.type);
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();

    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.send({ type: "ping", data: { timestamp: Date.now() } });
      }
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private send(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    this.stopPingInterval();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.close(1000, "Client disconnect");
      this.socket = null;
      this.isConnected = false;
    }
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`,
      );

      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch((error) => {
          console.error("Reconnection failed:", error);
        });
      }, delay);
    } else {
      console.error("Max reconnection attempts reached");
      this.emit("max_reconnect_attempts_reached", null);
    }
  }

  // Event listener methods
  on(event: "processing_update", callback: ProcessingUpdateCallback): void;
  on(event: "sync_update", callback: SyncUpdateCallback): void;
  on(event: "sync_completed", callback: (data: any) => void): void;
  on(event: "error", callback: ErrorCallback): void;
  on(event: "processing_completed", callback: (data: any) => void): void;
  on(event: "max_reconnect_attempts_reached", callback: () => void): void;
  on(event: string, callback: WebSocketEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: WebSocketEventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(
            `Error in WebSocket event handler for ${event}:`,
            error,
          );
        }
      });
    }
  }

  // Utility methods
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.readyState === WebSocket.OPEN;
  }

  getConnectionState(): "connected" | "disconnected" | "connecting" {
    if (!this.socket) return "disconnected";

    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return "connected";
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
      default:
        return "disconnected";
    }
  }
}

// Create and export singleton instance
export const wsClient = new WebSocketClient();
export default wsClient;
