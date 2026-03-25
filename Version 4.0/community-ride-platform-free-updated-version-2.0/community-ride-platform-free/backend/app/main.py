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
from app.api.reports import router as reports_router
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


def ensure_runtime_schema():
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
