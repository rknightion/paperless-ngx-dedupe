import json
import logging
from datetime import datetime

from fastapi import WebSocket, WebSocketDisconnect, WebSocketException

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasting"""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.connection_count = 0

    async def connect(self, websocket: WebSocket) -> str:
        """Accept new WebSocket connection and return connection ID"""
        await websocket.accept()

        # Generate unique connection ID
        connection_id = f"conn_{self.connection_count}"
        self.connection_count += 1

        self.active_connections[connection_id] = websocket

        logger.info(f"WebSocket connection established: {connection_id}")
        logger.info(f"Active connections: {len(self.active_connections)}")

        return connection_id

    def disconnect(self, connection_id: str):
        """Remove connection"""
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]
            logger.info(f"WebSocket connection closed: {connection_id}")
            logger.info(f"Active connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, connection_id: str):
        """Send message to specific connection"""
        websocket = self.active_connections.get(connection_id)
        if websocket:
            try:
                # Check if websocket is still connected
                if websocket.client_state.value != 1:  # 1 = CONNECTED
                    logger.debug(
                        f"WebSocket {connection_id} is not connected, removing from active connections"
                    )
                    self.disconnect(connection_id)
                    return

                # Convert datetime objects to ISO format strings
                def serialize_datetime(obj):
                    if isinstance(obj, datetime):
                        return obj.isoformat()
                    raise TypeError(
                        f"Object of type {type(obj).__name__} is not JSON serializable"
                    )

                await websocket.send_text(
                    json.dumps(message, default=serialize_datetime)
                )
            except Exception as e:
                if 'Need to call "accept" first' not in str(e):
                    logger.error(f"Error sending message to {connection_id}: {e}")
                self.disconnect(connection_id)

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        if not self.active_connections:
            return

        # Convert datetime objects to ISO format strings
        def serialize_datetime(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(
                f"Object of type {type(obj).__name__} is not JSON serializable"
            )

        message_str = json.dumps(message, default=serialize_datetime)

        # Send to all connections and handle disconnections
        disconnected_connections = []

        for connection_id, websocket in list(self.active_connections.items()):
            try:
                # Check if websocket is still open before sending
                if websocket.client_state.value == 1:  # 1 = CONNECTED
                    await websocket.send_text(message_str)
                else:
                    disconnected_connections.append(connection_id)
            except Exception as e:
                if 'Need to call "accept" first' not in str(e):
                    logger.error(f"Error broadcasting to {connection_id}: {e}")
                disconnected_connections.append(connection_id)

        # Clean up disconnected connections
        for connection_id in disconnected_connections:
            self.disconnect(connection_id)

    async def send_processing_update(self, processing_status: dict):
        """Send processing status update to all clients"""
        message = {"type": "processing_update", "data": processing_status}
        await self.broadcast(message)

    async def send_error(self, error_message: str, connection_id: str | None = None):
        """Send error message"""
        message = {"type": "error", "data": error_message}

        if connection_id:
            await self.send_personal_message(message, connection_id)
        else:
            await self.broadcast(message)

    async def send_completion(self, completion_data: dict):
        """Send processing completion message"""
        message = {"type": "processing_completed", "data": completion_data}
        await self.broadcast(message)

    async def send_sync_update(self, sync_status: dict):
        """Send document sync status update to all clients"""
        message = {"type": "sync_update", "data": sync_status}
        await self.broadcast(message)

    async def send_sync_completion(self, completion_data: dict):
        """Send sync completion message"""
        message = {"type": "sync_completed", "data": completion_data}
        await self.broadcast(message)

    def get_connection_count(self) -> int:
        """Get number of active connections"""
        return len(self.active_connections)


# Global connection manager instance
manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint handler"""
    connection_id = None

    try:
        # Accept connection
        connection_id = await manager.connect(websocket)

        # Send initial connection confirmation
        await manager.send_personal_message(
            {
                "type": "connection_established",
                "data": {
                    "connection_id": connection_id,
                    "message": "WebSocket connection established successfully",
                },
            },
            connection_id,
        )

        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for messages from client
                data = await websocket.receive_text()

                try:
                    message = json.loads(data)
                    await handle_client_message(message, connection_id)
                except json.JSONDecodeError:
                    await manager.send_error("Invalid JSON format", connection_id)

            except WebSocketDisconnect:
                logger.info(f"Client disconnected: {connection_id}")
                break
            except Exception as e:
                # Check if it's a "Need to call accept first" error and break immediately
                if 'Need to call "accept" first' in str(e):
                    logger.debug(
                        f"WebSocket connection already closed: {connection_id}"
                    )
                    break

                logger.error(f"Error handling WebSocket message: {e}")
                # Only send error if WebSocket is still connected
                if connection_id in manager.active_connections:
                    try:
                        websocket = manager.active_connections.get(connection_id)
                        # Check WebSocket state before sending
                        if (
                            websocket and websocket.client_state.value == 1
                        ):  # 1 = CONNECTED
                            await manager.send_error(
                                f"Server error: {str(e)}", connection_id
                            )
                    except Exception:  # noqa: E722
                        pass  # Connection might be closed, ignore error

    except WebSocketException as e:
        logger.error(f"WebSocket exception: {e}")
    except Exception as e:
        logger.error(f"Unexpected error in WebSocket handler: {e}")
    finally:
        if connection_id:
            manager.disconnect(connection_id)


async def handle_client_message(message: dict, connection_id: str):
    """Handle incoming messages from clients"""
    message_type = message.get("type")

    if message_type == "ping":
        # Respond to ping with pong
        await manager.send_personal_message(
            {"type": "pong", "data": message.get("data", {})}, connection_id
        )

    elif message_type == "subscribe":
        # Handle subscription requests (for future use)
        topics = message.get("data", {}).get("topics", [])
        logger.info(f"Client {connection_id} subscribed to topics: {topics}")

        await manager.send_personal_message(
            {"type": "subscription_confirmed", "data": {"topics": topics}},
            connection_id,
        )

    elif message_type == "get_status":
        # Send current processing status
        from .processing import processing_status

        await manager.send_personal_message(
            {"type": "processing_update", "data": processing_status}, connection_id
        )

    elif message_type == "get_sync_status":
        # Send current sync status
        from .documents import sync_status

        await manager.send_personal_message(
            {"type": "sync_update", "data": sync_status}, connection_id
        )

    else:
        logger.warning(f"Unknown message type from {connection_id}: {message_type}")
        await manager.send_error(f"Unknown message type: {message_type}", connection_id)


# Utility functions for use in other parts of the application
async def broadcast_processing_update(processing_status: dict):
    """Utility function to broadcast processing updates"""
    await manager.send_processing_update(processing_status)


async def broadcast_error(error_message: str):
    """Utility function to broadcast errors"""
    await manager.send_error(error_message)


async def broadcast_completion(completion_data: dict):
    """Utility function to broadcast completion"""
    await manager.send_completion(completion_data)


def get_connection_count() -> int:
    """Get current number of WebSocket connections"""
    return manager.get_connection_count()


# Sync-specific broadcast functions
async def broadcast_sync_update(sync_status: dict):
    """Utility function to broadcast sync updates"""
    await manager.send_sync_update(sync_status)


async def broadcast_sync_completion(completion_data: dict):
    """Utility function to broadcast sync completion"""
    await manager.send_sync_completion(completion_data)
