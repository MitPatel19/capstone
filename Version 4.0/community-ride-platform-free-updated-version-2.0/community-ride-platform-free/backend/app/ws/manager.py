from typing import Dict, List
from fastapi import WebSocket
import threading

class ConnectionManager:
    def __init__(self):
        self._lock = threading.Lock()
        self.active: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        with self._lock:
            self.active.setdefault(user_id, []).append(ws)

    async def disconnect(self, user_id: int, ws: WebSocket):
        with self._lock:
            conns = self.active.get(user_id, [])
            if ws in conns:
                conns.remove(ws)
            if not conns and user_id in self.active:
                del self.active[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        with self._lock:
            conns = list(self.active.get(user_id, []))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                # ignore broken sockets
                pass

    async def broadcast(self, message: dict):
        with self._lock:
            sockets = [ws for conns in self.active.values() for ws in conns]
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                # ignore broken sockets
                pass

    def get_active_user_ids(self) -> list[int]:
        with self._lock:
            return list(self.active.keys())

manager = ConnectionManager()
