from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime
from app.models import User, UserRole, DriverProfile, PlatformFee, DriverApprovalStatus
from app.core.auth import hash_password

ADMIN_EMAIL = "pmit9114@gmail.com"
ADMIN_PASSWORD = "Mit@2020"
ADMIN_NAME = "Admin"

def ensure_seed(db: Session):
    # platform fee singleton
    fee = db.scalar(select(PlatformFee).order_by(PlatformFee.id.asc()))
    if not fee:
        db.add(PlatformFee(fee_per_ride=0.50))
        db.commit()

    admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
    if not admin:
        admin = User(
            role=UserRole.admin,
            name=ADMIN_NAME,
            email=ADMIN_EMAIL,
            phone="",
            password_hash=hash_password(ADMIN_PASSWORD),
            age=30,
            is_student=False,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
