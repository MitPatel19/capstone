from datetime import datetime, timedelta
from jose import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.settings import settings
from app.db.session import get_db
from app.models import User, UserRole, AccountStatus
import os, base64, hashlib, hmac

bearer = HTTPBearer(auto_error=False)

# Password hashing (no bcrypt/passlib dependency) using PBKDF2-HMAC-SHA256.
# Format: pbkdf2_sha256$<iterations>$<salt_b64>$<dk_b64>
_DEFAULT_ITERS = 200_000

def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")

def _b64d(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))

def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, _DEFAULT_ITERS, dklen=32)
    return f"pbkdf2_sha256${_DEFAULT_ITERS}${_b64e(salt)}${_b64e(dk)}"

def verify_password(pw: str, hashed: str) -> bool:
    try:
        scheme, iters, salt_b64, dk_b64 = hashed.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        iters_i = int(iters)
        salt = _b64d(salt_b64)
        dk_expected = _b64d(dk_b64)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, iters_i, dklen=len(dk_expected))
        return hmac.compare_digest(dk, dk_expected)
    except Exception:
        return False

def create_access_token(subject: str, role: str, user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": subject, "role": role, "uid": user_id, "exp": expire}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

async def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                           db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.scalar(select(User).where(User.id == int(uid)))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.status != AccountStatus.active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return user

def require_role(*roles: UserRole):
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep
