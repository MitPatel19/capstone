from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from datetime import datetime
import os

from app.db.session import get_db
from app.core.auth import require_role
from app.core.settings import settings
from app.models import User, UserRole, DriverProfile, DriverApprovalStatus, AccountStatus, PlatformFee, UserProfile, Rating, Cancellation, City, DriverCitySelection
from app.schemas import PlatformFeeOut, PlatformFeeIn, UserOut, CityOut, CityIn
from app.services.license_monitor import sync_driver_license_notifications

router = APIRouter(prefix="/admin", tags=["admin"])

def user_out(u: User, rating_avg: float = 0.0) -> UserOut:
    return UserOut(
        id=u.id, role=u.role.value, name=u.name, email=u.email, phone=u.phone,
        status=u.status.value, age=u.age, is_student=u.is_student, rating_avg=rating_avg
    )


def upload_path_to_url(path: str) -> str:
    if not path:
        return ""
    normalized_path = path.replace("\\", "/")
    normalized_upload_dir = settings.UPLOAD_DIR.replace("\\", "/").rstrip("/")
    filename = os.path.basename(normalized_path)

    if normalized_path.startswith(normalized_upload_dir + "/"):
        return f"/uploads/{filename}"
    if "/uploads/" in normalized_path:
        return normalized_path[normalized_path.index("/uploads/"):]
    return f"/uploads/{filename}"

@router.get("/drivers/pending")
def pending_drivers(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    sync_driver_license_notifications(db)
    db.commit()
    rows = db.scalars(select(DriverProfile).where(DriverProfile.approval_status == DriverApprovalStatus.pending)).all()
    out = []
    for p in rows:
        documents = []
        if p.license_path:
            documents.append({"label": "License", "url": upload_path_to_url(p.license_path)})
        if p.id_path:
            documents.append({"label": "ID", "url": upload_path_to_url(p.id_path)})
        if p.insurance_path:
            documents.append({"label": "Insurance", "url": upload_path_to_url(p.insurance_path)})
        out.append({
            "driver_id": p.user_id,
            "name": p.user.name,
            "email": p.user.email,
            "phone": p.user.phone,
            "age": p.user.age,
            "submitted": p.user.created_at.isoformat(),
            "license_expiry_date": p.license_expiry_date.date().isoformat() if p.license_expiry_date else None,
            "license_expiry_status": p.license_expiry_status or "unknown",
            "documents": documents,
        })
    return out

@router.post("/drivers/{driver_id}/approve")
def approve_driver(driver_id: int, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    p = db.scalar(select(DriverProfile).where(DriverProfile.user_id == driver_id))
    if not p:
        raise HTTPException(404, "Driver profile not found")
    p.approval_status = DriverApprovalStatus.approved
    p.reviewed_at = datetime.utcnow()
    # If this approval was for updated docs, mark docs up-to-date
    up = db.scalar(select(UserProfile).where(UserProfile.user_id == driver_id))
    if up:
        up.docs_status = "up_to_date"
    db.commit()
    return {"status":"approved"}

@router.post("/drivers/{driver_id}/reject")
def reject_driver(driver_id: int, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    p = db.scalar(select(DriverProfile).where(DriverProfile.user_id == driver_id))
    if not p:
        raise HTTPException(404, "Driver profile not found")
    p.approval_status = DriverApprovalStatus.rejected
    p.reviewed_at = datetime.utcnow()
    db.commit()
    return {"status":"rejected"}

@router.get("/users", response_model=list[UserOut])
def list_users(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.id.asc()).limit(500)).all()
    rating_rows = db.execute(
        select(Rating.to_user_id, func.avg(Rating.stars))
        .group_by(Rating.to_user_id)
    ).all()
    ratings_by_user_id = {int(uid): float(avg) for uid, avg in rating_rows}
    return [user_out(u, ratings_by_user_id.get(u.id, 0.0)) for u in users]

@router.get("/reports")
def flagged_reports(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    reports = []

    low_rating_rows = db.execute(
        select(Rating, User.name, User.role)
        .join(User, Rating.to_user_id == User.id)
        .where(Rating.stars <= 2)
        .order_by(Rating.created_at.desc())
        .limit(20)
    ).all()
    for rating, reported_name, reported_role in low_rating_rows:
        reporter = db.scalar(select(User).where(User.id == rating.from_user_id))
        role_value = reported_role.value if hasattr(reported_role, "value") else str(reported_role)
        reports.append({
            "id": f"rating-{rating.id}",
            "type": "Driver Behavior" if role_value == UserRole.driver.value else "User Behavior",
            "reporter": reporter.name if reporter else "Unknown",
            "reported": reported_name,
            "date": rating.created_at.date().isoformat(),
        })

    cancellation_rows = db.scalars(select(Cancellation).order_by(Cancellation.created_at.desc()).limit(20)).all()
    for cancellation in cancellation_rows:
        reporter = db.scalar(select(User).where(User.id == cancellation.by_user_id))
        reports.append({
            "id": f"cancel-{cancellation.id}",
            "type": "Payment Issue",
            "reporter": reporter.name if reporter else "Unknown",
            "reported": "System",
            "date": cancellation.created_at.date().isoformat(),
        })

    reports.sort(key=lambda r: r["date"], reverse=True)
    return reports[:50]

@router.post("/users/{uid}/disable")
def disable_user(uid: int, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.id == uid))
    if not u:
        raise HTTPException(404, "User not found")
    u.status = AccountStatus.disabled
    db.commit()
    return {"status":"disabled"}

@router.post("/users/{uid}/enable")
def enable_user(uid: int, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.id == uid))
    if not u:
        raise HTTPException(404, "User not found")
    u.status = AccountStatus.active
    db.commit()
    return {"status":"active"}

@router.get("/fee", response_model=PlatformFeeOut)
def get_fee(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    fee = db.scalar(select(PlatformFee).order_by(PlatformFee.id.asc()))
    return PlatformFeeOut(fee_per_ride=fee.fee_per_ride if fee else 0.5)

@router.post("/fee", response_model=PlatformFeeOut)
def set_fee(payload: PlatformFeeIn, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    fee = db.scalar(select(PlatformFee).order_by(PlatformFee.id.asc()))
    if not fee:
        fee = PlatformFee(fee_per_ride=payload.fee_per_ride)
        db.add(fee)
    else:
        fee.fee_per_ride = payload.fee_per_ride
    db.commit()
    return PlatformFeeOut(fee_per_ride=fee.fee_per_ride)


@router.get("/cities", response_model=list[CityOut])
def list_cities(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    rows = db.scalars(select(City).where(City.is_active == True).order_by(City.name.asc())).all()
    return [CityOut(id=c.id, name=c.name, is_active=c.is_active) for c in rows]


@router.post("/cities", response_model=CityOut)
def add_city(payload: CityIn, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "City name required")
    existing = db.scalar(select(City).where(func.lower(City.name) == name.lower()))
    if existing:
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return CityOut(id=existing.id, name=existing.name, is_active=existing.is_active)
    c = City(name=name, is_active=True)
    db.add(c)
    db.commit()
    db.refresh(c)
    return CityOut(id=c.id, name=c.name, is_active=c.is_active)


@router.delete("/cities/{city_id}")
def remove_city(city_id: int, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    c = db.scalar(select(City).where(City.id == city_id))
    if not c:
        raise HTTPException(404, "City not found")
    if not c.is_active:
        return {"status": "removed"}
    c.is_active = False
    db.commit()
    return {"status": "removed"}


@router.get("/cities/requests")
def city_requests(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    rows = db.scalars(select(DriverCitySelection).where(DriverCitySelection.approval_status == "pending")).all()
    out = []
    for sel in rows:
        if not sel.pending_city_id:
            continue
        driver = db.scalar(select(User).where(User.id == sel.user_id))
        out.append({
            "user_id": sel.user_id,
            "driver_name": driver.name if driver else "Unknown",
            "driver_email": driver.email if driver else "",
            "pending_city_id": sel.pending_city_id,
            "pending_city_name": sel.pending_city.name if sel.pending_city else "",
        })
    return out


@router.post("/cities/requests/{user_id}/approve")
def approve_city_request(user_id: int, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    sel = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user_id))
    if not sel or not sel.pending_city_id:
        raise HTTPException(404, "Pending city request not found")
    sel.approved_city_id = sel.pending_city_id
    sel.pending_city_id = None
    sel.approval_status = "approved"
    sel.reviewed_at = datetime.utcnow()
    db.commit()
    return {"status": "approved"}


@router.post("/cities/requests/{user_id}/reject")
def reject_city_request(user_id: int, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    sel = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user_id))
    if not sel or not sel.pending_city_id:
        raise HTTPException(404, "Pending city request not found")
    sel.pending_city_id = None
    sel.approval_status = "rejected"
    sel.reviewed_at = datetime.utcnow()
    db.commit()
    return {"status": "rejected"}
