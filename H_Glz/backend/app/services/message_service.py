from app.database import InMemoryRepository
from app.models import MessageCreate, MessageRead


class MessageService:
    def __init__(self) -> None:
        self._messages = InMemoryRepository[MessageRead]()

    def list_messages(self) -> list[MessageRead]:
        return self._messages.all()

    def create_message(self, payload: MessageCreate) -> MessageRead:
        return self._messages.add(MessageRead(**payload.model_dump()))


message_service = MessageService()
