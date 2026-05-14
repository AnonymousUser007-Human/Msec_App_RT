from fastapi import APIRouter

from app.models import MessageCreate, MessageRead
from app.services.message_service import message_service
from app.websocket.manager import connection_manager

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("", response_model=list[MessageRead])
def list_messages() -> list[MessageRead]:
    return message_service.list_messages()


@router.post("", response_model=MessageRead, status_code=201)
async def create_message(payload: MessageCreate) -> MessageRead:
    message = message_service.create_message(payload)
    await connection_manager.broadcast(message.model_dump(mode="json"))
    return message
