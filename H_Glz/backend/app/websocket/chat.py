from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models import MessageCreate
from app.services.message_service import message_service
from app.websocket.manager import connection_manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket) -> None:
    await connection_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            message = message_service.create_message(MessageCreate(**data))
            await connection_manager.broadcast(message.model_dump(mode="json"))
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
