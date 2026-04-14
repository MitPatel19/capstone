from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.settings import settings
from app.db.session import engine, Base, SessionLocal
from app.services.seed import ensure_seed
from app.api.auth import live_presence_counts, router as auth_router
from app.api.rides import router as rides_router
from app.api.admin import router as admin_router
from app.api.billing import router as billing_router
from app.api.reports import router as reports_router
from app.ws.manager import manager
from app.core.auth import decode_token

upload_dir = Path(settings.UPLOAD_DIR)
if not upload_dir.is_absolute():
    upload_dir = (Path.cwd() / upload_dir).resolve()
upload_dir.mkdir(parents=True, exist_ok=True)

frontend_dist_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
frontend_index_path = frontend_dist_dir / "index.html"
presentation_path = Path(__file__).resolve().parents[2] / "project-presentation.html"
presentation_qr_path = Path(__file__).resolve().parents[2] / "presentation-qr.svg"

app = FastAPI(title=settings.APP_NAME)

app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_runtime_schema():
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as conn:
        user_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()
        }
        if "email_verified" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 1"))
        if "email_verification_token_hash" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN email_verification_token_hash VARCHAR(255) DEFAULT ''"))
        if "email_verification_sent_at" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN email_verification_sent_at DATETIME"))
        if "password_reset_token_hash" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(255) DEFAULT ''"))
        if "password_reset_sent_at" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_sent_at DATETIME"))
        if "password_reset_expires_at" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME"))
        conn.execute(text("UPDATE users SET email_verified = 1 WHERE email_verified IS NULL"))

        cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(join_requests)")).fetchall()
        }
        if "primary_rider_credit" not in cols:
            conn.execute(text("ALTER TABLE join_requests ADD COLUMN primary_rider_credit FLOAT DEFAULT 0.0"))
        if "driver_bonus" not in cols:
            conn.execute(text("ALTER TABLE join_requests ADD COLUMN driver_bonus FLOAT DEFAULT 0.0"))

        driver_profile_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(driver_profiles)")).fetchall()
        }
        if "license_expiry_date" not in driver_profile_cols:
            conn.execute(text("ALTER TABLE driver_profiles ADD COLUMN license_expiry_date DATETIME"))
        if "license_expiry_status" not in driver_profile_cols:
            conn.execute(text("ALTER TABLE driver_profiles ADD COLUMN license_expiry_status VARCHAR(40) DEFAULT 'unknown'"))
        if "license_expiry_source" not in driver_profile_cols:
            conn.execute(text("ALTER TABLE driver_profiles ADD COLUMN license_expiry_source VARCHAR(40) DEFAULT 'manual'"))

        ride_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(rides)")).fetchall()
        }
        if "completed_at" not in ride_cols:
            conn.execute(text("ALTER TABLE rides ADD COLUMN completed_at DATETIME"))

        city_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(cities)")).fetchall()
        }
        if "province_name" not in city_cols:
            conn.execute(text("ALTER TABLE cities ADD COLUMN province_name VARCHAR(120) DEFAULT 'Ontario'"))
        if "tax_name" not in city_cols:
            conn.execute(text("ALTER TABLE cities ADD COLUMN tax_name VARCHAR(80) DEFAULT 'HST'"))
        if "tax_rate" not in city_cols:
            conn.execute(text("ALTER TABLE cities ADD COLUMN tax_rate FLOAT DEFAULT 13.0"))

        billing_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(billing_months)")).fetchall()
        }
        if "period_start" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN period_start DATETIME"))
        if "period_end" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN period_end DATETIME"))
        if "subtotal" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN subtotal FLOAT DEFAULT 0.0"))
        if "tax_rate" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN tax_rate FLOAT DEFAULT 0.0"))
        if "tax_amount" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN tax_amount FLOAT DEFAULT 0.0"))
        if "due_at" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN due_at DATETIME"))
        if "grace_expires_at" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN grace_expires_at DATETIME"))
        if "paid_at" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN paid_at DATETIME"))
        if "payment_provider" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN payment_provider VARCHAR(40) DEFAULT ''"))
        if "payment_reference" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN payment_reference VARCHAR(255) DEFAULT ''"))
        if "stripe_session_id" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN stripe_session_id VARCHAR(255) DEFAULT ''"))
        if "stripe_payment_intent_id" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN stripe_payment_intent_id VARCHAR(255) DEFAULT ''"))
        if "waived_at" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN waived_at DATETIME"))
        if "waiver_reason" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN waiver_reason VARCHAR(255) DEFAULT ''"))
        if "currency" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN currency VARCHAR(12) DEFAULT 'cad'"))
        if "city_name" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN city_name VARCHAR(120) DEFAULT ''"))
        if "province_name" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN province_name VARCHAR(120) DEFAULT ''"))
        if "tax_name" not in billing_cols:
            conn.execute(text("ALTER TABLE billing_months ADD COLUMN tax_name VARCHAR(80) DEFAULT ''"))

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema()
    db = SessionLocal()
    try:
        ensure_seed(db)
    finally:
        db.close()

app.include_router(auth_router)
app.include_router(rides_router)
app.include_router(admin_router)
app.include_router(billing_router)
app.include_router(reports_router)

@app.get("/health")
def health():
    return {"status":"ok"}


async def broadcast_presence_update():
    db = SessionLocal()
    try:
        active_riders, active_drivers = live_presence_counts(db)
    finally:
        db.close()
    await manager.broadcast(
        {
            "type": "presence_update",
            "active_riders": active_riders,
            "active_drivers": active_drivers,
        }
    )


@app.get("/", include_in_schema=False)
def serve_frontend_root():
    if frontend_index_path.exists():
        return FileResponse(frontend_index_path)
    return {"status": "ok", "frontend_built": False}


@app.get("/presentation", include_in_schema=False)
@app.get("/presentation.html", include_in_schema=False)
def serve_project_presentation():
    if presentation_path.exists():
        return FileResponse(presentation_path)
    raise HTTPException(status_code=404, detail="Presentation not found")


@app.get("/presentation-qr.svg", include_in_schema=False)
@app.get("/presentation/qr", include_in_schema=False)
def serve_project_presentation_qr():
    if presentation_qr_path.exists():
        return FileResponse(presentation_qr_path, media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Presentation QR not found")

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
    await broadcast_presence_update()
    try:
        while True:
            # keep alive + optional client pings
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        await manager.disconnect(uid, ws)
        await broadcast_presence_update()
    except Exception:
        await manager.disconnect(uid, ws)
        await broadcast_presence_update()


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend_app(full_path: str, request: Request):
    if not frontend_index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found")

    candidate = (frontend_dist_dir / full_path).resolve()
    if frontend_dist_dir.resolve() in candidate.parents and candidate.is_file():
        return FileResponse(candidate)

    if "." in Path(full_path).name:
        raise HTTPException(status_code=404, detail="Static asset not found")

    if "text/html" not in request.headers.get("accept", ""):
        raise HTTPException(status_code=404, detail="Not found")

    return FileResponse(frontend_index_path)
