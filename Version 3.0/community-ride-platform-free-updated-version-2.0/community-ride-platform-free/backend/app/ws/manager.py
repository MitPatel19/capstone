from typing import Dict, List
from fastapi import WebSocket
import asyncio

class ConnectionManager:
    def __init__(self):
        self._lock = asyncio.Lock()
        self.active: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.active.setdefault(user_id, []).append(ws)

    async def disconnect(self, user_id: int, ws: WebSocket):
        async with self._lock:
            conns = self.active.get(user_id, [])
            if ws in conns:
                conns.remove(ws)
            if not conns and user_id in self.active:
                del self.active[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        async with self._lock:
            conns = list(self.active.get(user_id, []))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                # ignore broken sockets
                pass

manager = ConnectionManager()
