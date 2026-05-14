from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    author: str = Field(default="Anonyme", min_length=1, max_length=80)
    content: str = Field(..., min_length=1, max_length=2000)


class MessageRead(MessageCreate):
    id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
