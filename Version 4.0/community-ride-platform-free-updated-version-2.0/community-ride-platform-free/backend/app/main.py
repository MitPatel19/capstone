from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.settings import settings
from app.db.session import engine, Base, SessionLocal
from app.services.seed import ensure_seed
from app.api.auth import router as auth_router
from app.api.rides import router as rides_router
from app.api.admin import router as admin_router
from app.api.billing import router as billing_router
from app.ws.manager import manager
from app.core.auth import decode_token

app = FastAPI(title=settings.APP_NAME)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_seed(db)
    finally:
        db.close()

app.include_router(auth_router)
app.include_router(rides_router)
app.include_router(admin_router)
app.include_router(billing_router)

@app.get("/health")
def health():
    return {"status":"ok"}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4401)
        return
    payload = decode_token(token)
    uid = int(payload.get("uid", 0))
    if not uid:
        await ws.close(code=4401)
        return
    await manager.connect(uid, ws)
    try:
        while True:
            # keep alive + optional client pings
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        await manager.disconnect(uid, ws)
    except Exception:
        await manager.disconnect(uid, ws)
