import asyncio
import json
import logging
from typing import Dict, Set, List, Optional, Any, TYPE_CHECKING
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.utils.state_collector import StateCollector

logger = logging.getLogger(__name__)

class GameWebSocketManager:
    """Manages WebSocket connections for real-time game updates."""
    
    def __init__(self):
        # game_id -> set of websockets
        self.game_connections: Dict[str, Set[WebSocket]] = {}
        # websocket -> game_id for cleanup
        self.connection_games: Dict[WebSocket, str] = {}
        self.lock = asyncio.Lock()
        # StateCollector will be injected
        self.state_collector: Optional[StateCollector] = None
    
    async def connect(self, websocket: WebSocket, game_id: str):
        """Connect a WebSocket to a specific game."""
        await websocket.accept()
        
        async with self.lock:
            if game_id not in self.game_connections:
                self.game_connections[game_id] = set()
            
            self.game_connections[game_id].add(websocket)
            self.connection_games[websocket] = game_id
        
        logger.info(f"WebSocket connected to game {game_id}. Total connections: {len(self.game_connections[game_id])}")
        
        # Get complete state if state collector is available
        complete_state = None
        if self.state_collector:
            try:
                complete_state = await self.state_collector.get_complete_state(game_id)
            except Exception as e:
                logger.warning(f"Failed to get complete state for game {game_id}: {e}")
        
        # Send enhanced connection confirmation with complete state
        await self._send_to_websocket(websocket, {
            "type": "CONNECTION_ESTABLISHED",
            "complete_state": complete_state,
            # TODO(hunter): nothing uses these and game_id is already in the URL
            # "game_id": game_id,
            # "timestamp": datetime.now().isoformat(),
        })
    
    async def disconnect(self, websocket: WebSocket):
        """Disconnect a WebSocket and clean up."""
        async with self.lock:
            game_id = self.connection_games.get(websocket)
            if game_id and game_id in self.game_connections:
                self.game_connections[game_id].discard(websocket)
                
                # Clean up empty game connection sets
                if not self.game_connections[game_id]:
                    del self.game_connections[game_id]
                
                logger.info(f"WebSocket disconnected from game {game_id}")
            
            self.connection_games.pop(websocket, None)
    
    async def broadcast_to_game(self, game_id: str, message: Dict[str, Any]):
        """Broadcast a message to all WebSockets connected to a specific game."""
        if game_id not in self.game_connections:
            logger.debug(f"No WebSocket connections for game {game_id}")
            return
        
        # Add metadata to message # TODO(hunter): nothing uses the game_id or timestamp
        # message.update({
        #     "game_id": game_id,
        #     "timestamp": datetime.now().isoformat()
        # })
        
        # Get connections (copy to avoid modification during iteration)
        connections = list(self.game_connections[game_id])
        
        if not connections:
            return
        
        logger.debug(f"Broadcasting to {len(connections)} connections for game {game_id}: {message.get('type', 'unknown')}")
        
        # Send to all connections, removing failed ones
        failed_connections = []
        for websocket in connections:
            try:
                await self._send_to_websocket(websocket, message)
            except Exception as e:
                logger.warning(f"Failed to send message to WebSocket: {e}")
                failed_connections.append(websocket)
        
        # Clean up failed connections
        if failed_connections:
            async with self.lock:
                for websocket in failed_connections:
                    self.game_connections[game_id].discard(websocket)
                    self.connection_games.pop(websocket, None)
    
    def _serialize_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Convert message to a JSON-serializable format."""
        def convert_value(obj):
            if isinstance(obj, BaseModel):
                return obj.model_dump()
            elif isinstance(obj, datetime):
                return obj.isoformat()
            elif hasattr(obj, '__dict__') and hasattr(obj, '__class__'):
                # Handle enums and other objects with value attribute
                if hasattr(obj, 'value'):
                    return obj.value
                # Handle other objects by converting to dict
                return obj.__dict__
            elif isinstance(obj, dict):
                return {k: convert_value(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_value(item) for item in obj]
            else:
                return obj
        
        return convert_value(message)

    async def _send_to_websocket(self, websocket: WebSocket, message: Dict[str, Any]):
        """Send a message to a specific WebSocket."""
        try:
            # Convert message to JSON-serializable format
            serializable_message = self._serialize_message(message)
            json_str = json.dumps(serializable_message)
            await websocket.send_text(json_str)
        except TypeError as e:
            # Detailed error for JSON serialization issues
            logger.error(f"JSON serialization error in WebSocket message: {e}")
            logger.error(f"Message keys: {list(message.keys())}")
            logger.error(f"Message types: {[(k, type(v).__name__) for k, v in message.items()]}")
            
            # Try to identify the problematic object
            for key, value in message.items():
                try:
                    json.dumps(value)
                except TypeError:
                    logger.error(f"Non-serializable object in key '{key}': {type(value).__name__} = {value}")
            raise
        except Exception as e:
            logger.error(f"Error sending WebSocket message: {e}")
            raise
    
    def get_connection_count(self, game_id: str) -> int:
        """Get the number of active connections for a game."""
        return len(self.game_connections.get(game_id, set()))
    
    def get_all_games(self) -> List[str]:
        """Get list of all games with active connections."""
        return list(self.game_connections.keys())

# Global WebSocket manager instance
websocket_manager = GameWebSocketManager() 