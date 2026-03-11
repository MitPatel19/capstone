from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime

from app.db.session import get_db
from app.core.auth import require_role
from app.models import User, UserRole, DriverProfile, DriverApprovalStatus, AccountStatus, PlatformFee, UserProfile
from app.schemas import PlatformFeeOut, PlatformFeeIn, UserOut

router = APIRouter(prefix="/admin", tags=["admin"])

def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, role=u.role.value, name=u.name, email=u.email, phone=u.phone,
        status=u.status.value, age=u.age, is_student=u.is_student
    )

@router.get("/drivers/pending")
def pending_drivers(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    rows = db.scalars(select(DriverProfile).where(DriverProfile.approval_status == DriverApprovalStatus.pending)).all()
    out = []
    for p in rows:
        out.append({
            "driver_id": p.user_id,
            "name": p.user.name,
            "email": p.user.email,
            "phone": p.user.phone,
            "age": p.user.age,
            "submitted": p.user.created_at.isoformat(),
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
    return [user_out(u) for u in users]

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
