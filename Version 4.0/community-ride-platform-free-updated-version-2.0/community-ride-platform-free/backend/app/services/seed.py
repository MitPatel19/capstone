from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.settings import settings
from app.models import BillingSettings, City, PlatformFee, User, UserRole
from app.core.auth import hash_password

def ensure_seed(db: Session):
    # platform fee singleton
    fee = db.scalar(select(PlatformFee).order_by(PlatformFee.id.asc()))
    if not fee:
        db.add(PlatformFee(fee_per_ride=0.50))
        db.commit()

    billing = db.scalar(select(BillingSettings).order_by(BillingSettings.id.asc()))
    if not billing:
        db.add(
            BillingSettings(
                global_free_mode=False,
                cycle_length_days=14,
                grace_period_days=7,
                billing_anchor_date="2024-01-01",
            )
        )
        db.commit()

    admin = db.scalar(select(User).where(User.email == settings.ADMIN_EMAIL))
    if not admin:
        admin = User(
            role=UserRole.admin,
            name=settings.ADMIN_NAME,
            email=settings.ADMIN_EMAIL,
            phone="",
            password_hash=hash_password(settings.ADMIN_PASSWORD),
            age=30,
            is_student=False,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    # default city options for driver selection
    for city_name in ["Thunder Bay", "Northside", "Downtown", "Westside", "Eastside"]:
        c = db.scalar(select(City).where(City.name == city_name))
        if not c:
            db.add(City(name=city_name, is_active=True, province_name="Ontario", tax_name="HST", tax_rate=13.0))
        else:
            if not c.province_name:
                c.province_name = "Ontario"
            if not c.tax_name:
                c.tax_name = "HST"
            if not c.tax_rate:
                c.tax_rate = 13.0
    db.commit()
