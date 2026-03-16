from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DriverProfile, Notification, User, UserRole


EXPIRING_SOON_DAYS = 30


def parse_license_expiry_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d")
    except ValueError:
        return None


def _notification_exists(db: Session, user_id: int, kind: str, body: str) -> bool:
    existing = db.scalar(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.kind == kind,
            Notification.body == body,
        )
    )
    return existing is not None


def _create_notification(db: Session, user_id: int, kind: str, title: str, body: str, action_path: str) -> None:
    if _notification_exists(db, user_id, kind, body):
        return
    db.add(
        Notification(
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            action_path=action_path,
        )
    )


def sync_driver_license_notifications(db: Session) -> None:
    today = datetime.utcnow().date()
    admins = db.scalars(select(User).where(User.role == UserRole.admin)).all()
    drivers = db.scalars(select(DriverProfile)).all()

    for profile in drivers:
        expiry = profile.license_expiry_date.date() if profile.license_expiry_date else None
        previous_status = profile.license_expiry_status or "unknown"

        if not expiry:
            profile.license_expiry_status = "unknown"
            continue

        if expiry < today:
            status = "expired"
        elif expiry <= today + timedelta(days=EXPIRING_SOON_DAYS):
            status = "expiring_soon"
        else:
            status = "valid"

        profile.license_expiry_status = status
        driver_name = profile.user.name if profile.user else "This driver"
        expiry_text = expiry.isoformat()

        if status == "expired":
            driver_body = f"Your driver license expired on {expiry_text}. Upload an updated license as soon as possible."
            _create_notification(
                db,
                profile.user_id,
                "driver_license_expired",
                "Driver license expired",
                driver_body,
                "/profile",
            )
            admin_body = f"{driver_name}'s driver license expired on {expiry_text}. Review the account and request an updated license."
            for admin in admins:
                _create_notification(
                    db,
                    admin.id,
                    f"admin_driver_license_expired_{profile.user_id}",
                    "Expired driver license detected",
                    admin_body,
                    "/admin",
                )
        elif status == "expiring_soon" and previous_status != "expiring_soon":
            driver_body = f"Your driver license will expire on {expiry_text}. Upload your renewed license before it expires."
            _create_notification(
                db,
                profile.user_id,
                "driver_license_expiring_soon",
                "Driver license expiring soon",
                driver_body,
                "/profile",
            )
            admin_body = f"{driver_name}'s driver license will expire on {expiry_text}. Follow up before it lapses."
            for admin in admins:
                _create_notification(
                    db,
                    admin.id,
                    f"admin_driver_license_expiring_soon_{profile.user_id}",
                    "Driver license expiring soon",
                    admin_body,
                    "/admin",
                )
