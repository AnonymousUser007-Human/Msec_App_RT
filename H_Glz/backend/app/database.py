from threading import Lock
from typing import Generic, TypeVar

T = TypeVar("T")


class InMemoryRepository(Generic[T]):
    """Small thread-safe repository for local development."""

    def __init__(self) -> None:
        self._items: list[T] = []
        self._lock = Lock()

    def all(self) -> list[T]:
        with self._lock:
            return list(self._items)

    def add(self, item: T) -> T:
        with self._lock:
            self._items.append(item)
            return item

    def clear(self) -> None:
        with self._lock:
            self._items.clear()
