from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from datetime import datetime
import os

from app.db.session import get_db
from app.core.auth import require_role
from app.core.settings import settings
from app.models import User, UserRole, DriverProfile, DriverApprovalStatus, AccountStatus, PlatformFee, UserProfile, Rating, City, DriverCitySelection, SupportReport, SupportReportStatus
from app.schemas import (
    AdminBillOverviewOut,
    AdminBillingSettingsIn,
    AdminBillingSettingsOut,
    CityIn,
    CityOut,
    CityTaxUpdateIn,
    PlatformFeeIn,
    PlatformFeeOut,
    SupportReportOut,
    SupportReportUpdateIn,
    UserBillingAccessIn,
    UserBillingAccessOut,
    UserOut,
)
from app.services.license_monitor import sync_driver_license_notifications
from app.services.billing import (
    bill_status,
    build_access_state,
    get_billing_settings,
    get_platform_fee_row,
    get_user_billing_access,
    stripe_ready,
    sync_billing_notifications,
    sync_user_bills,
)
from app.api.reports import report_to_out

router = APIRouter(prefix="/admin", tags=["admin"])

def user_out(
    u: User,
    rating_avg: float = 0.0,
    billing_free_access: bool = False,
    billing_access_status: str = "current",
) -> UserOut:
    return UserOut(
        id=u.id, role=u.role.value, name=u.name, email=u.email, phone=u.phone,
        status=u.status.value, age=u.age, is_student=u.is_student, rating_avg=rating_avg,
        billing_free_access=billing_free_access,
        billing_access_status=billing_access_status,
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
    out: list[UserOut] = []
    for u in users:
        access = get_user_billing_access(db, u.id)
        access_state = "current"
        if u.role != UserRole.admin:
            access_state = build_access_state(db, u.id).status
        out.append(
            user_out(
                u,
                ratings_by_user_id.get(u.id, 0.0),
                billing_free_access=bool(access.is_free_access) if access else False,
                billing_access_status=access_state,
            )
        )
    return out

@router.get("/reports", response_model=list[SupportReportOut])
def flagged_reports(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    reports = db.scalars(select(SupportReport).order_by(SupportReport.created_at.desc()).limit(200)).all()
    return [report_to_out(r, db) for r in reports]


@router.post("/reports/{report_id}", response_model=SupportReportOut)
def update_report(report_id: int, payload: SupportReportUpdateIn, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    report = db.scalar(select(SupportReport).where(SupportReport.id == report_id))
    if not report:
        raise HTTPException(404, "Report not found")
    try:
        report.status = SupportReportStatus(payload.status)
    except Exception:
        raise HTTPException(400, "Invalid report status")
    report.admin_note = (payload.admin_note or "").strip()
    report.updated_at = datetime.utcnow()
    if report.status in (SupportReportStatus.resolved, SupportReportStatus.dismissed):
        report.resolved_at = datetime.utcnow()
    else:
        report.resolved_at = None
    db.commit()
    db.refresh(report)
    return report_to_out(report, db)

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


@router.get("/billing/settings", response_model=AdminBillingSettingsOut)
def get_billing_settings_route(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    fee = get_platform_fee_row(db)
    config = get_billing_settings(db)
    db.commit()
    return AdminBillingSettingsOut(
        fee_per_ride=fee.fee_per_ride,
        global_free_mode=config.global_free_mode,
        cycle_length_days=config.cycle_length_days,
        grace_period_days=config.grace_period_days,
        billing_anchor_date=config.billing_anchor_date,
        stripe_ready=stripe_ready(),
        currency=(settings.BILLING_CURRENCY or "cad").lower(),
    )


@router.post("/billing/settings", response_model=AdminBillingSettingsOut)
def update_billing_settings(
    payload: AdminBillingSettingsIn,
    user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    fee = get_platform_fee_row(db)
    fee.fee_per_ride = payload.fee_per_ride
    config = get_billing_settings(db)
    config.global_free_mode = payload.global_free_mode
    config.cycle_length_days = payload.cycle_length_days
    config.grace_period_days = payload.grace_period_days
    config.billing_anchor_date = payload.billing_anchor_date.strip() or "2024-01-01"
    config.updated_at = datetime.utcnow()
    db.commit()
    return AdminBillingSettingsOut(
        fee_per_ride=fee.fee_per_ride,
        global_free_mode=config.global_free_mode,
        cycle_length_days=config.cycle_length_days,
        grace_period_days=config.grace_period_days,
        billing_anchor_date=config.billing_anchor_date,
        stripe_ready=stripe_ready(),
        currency=(settings.BILLING_CURRENCY or "cad").lower(),
    )


@router.post("/billing/users/{uid}/free-access", response_model=UserBillingAccessOut)
def set_user_free_access(
    uid: int,
    payload: UserBillingAccessIn,
    user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    target = db.scalar(select(User).where(User.id == uid))
    if not target:
        raise HTTPException(404, "User not found")
    access = get_user_billing_access(db, uid, create=True)
    if not access:
        raise HTTPException(500, "Unable to load billing access")
    access.is_free_access = payload.is_free_access
    access.reason = (payload.reason or "").strip()
    access.updated_at = datetime.utcnow()
    db.commit()
    sync_billing_notifications(db, uid)
    return UserBillingAccessOut(
        user_id=uid,
        is_free_access=access.is_free_access,
        reason=access.reason,
        updated_at=access.updated_at.isoformat() if access.updated_at else None,
    )


@router.get("/billing/overview", response_model=list[AdminBillOverviewOut])
def billing_overview(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.role != UserRole.admin).order_by(User.id.asc())).all()
    rows: list[AdminBillOverviewOut] = []
    for target in users:
        bills = sync_user_bills(db, target.id)
        for bill in bills:
            subtotal = float(bill.subtotal or 0.0)
            current_status = bill_status(bill)
            if subtotal <= 0 and current_status == "accruing":
                continue
            label = bill.month
            if bill.period_start and bill.period_end:
                label = f"{bill.period_start.strftime('%b %d')} - {bill.period_end.strftime('%b %d, %Y')}"
            rows.append(
                AdminBillOverviewOut(
                    bill_id=bill.id,
                    user_id=target.id,
                    user_name=target.name,
                    user_email=target.email,
                    role=target.role.value,
                    period_label=label,
                    status=current_status,
                    subtotal=subtotal,
                    tax_amount=float(bill.tax_amount or 0.0),
                    total_due=float(bill.total_due or 0.0),
                    is_paid=bool(bill.is_paid),
                    is_waived=bool(bill.waived_at),
                    city_name=bill.city_name or "",
                    payment_provider=bill.payment_provider or "",
                    payment_reference=bill.payment_reference or "",
                    due_at=bill.due_at.isoformat() if bill.due_at else None,
                    grace_expires_at=bill.grace_expires_at.isoformat() if bill.grace_expires_at else None,
                    paid_at=bill.paid_at.isoformat() if bill.paid_at else None,
                )
            )
    rows.sort(key=lambda row: ((row.paid_at or row.due_at or ""), row.bill_id), reverse=True)
    return rows


@router.get("/cities", response_model=list[CityOut])
def list_cities(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    rows = db.scalars(select(City).where(City.is_active == True).order_by(City.name.asc())).all()
    return [
        CityOut(
            id=c.id,
            name=c.name,
            is_active=c.is_active,
            province_name=c.province_name,
            tax_name=c.tax_name,
            tax_rate=c.tax_rate,
        )
        for c in rows
    ]


@router.post("/cities", response_model=CityOut)
def add_city(payload: CityIn, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "City name required")
    existing = db.scalar(select(City).where(func.lower(City.name) == name.lower()))
    if existing:
        existing.is_active = True
        existing.province_name = payload.province_name.strip() or existing.province_name
        existing.tax_name = payload.tax_name.strip() or existing.tax_name
        existing.tax_rate = payload.tax_rate
        db.commit()
        db.refresh(existing)
        return CityOut(
            id=existing.id,
            name=existing.name,
            is_active=existing.is_active,
            province_name=existing.province_name,
            tax_name=existing.tax_name,
            tax_rate=existing.tax_rate,
        )
    c = City(
        name=name,
        is_active=True,
        province_name=payload.province_name.strip() or "Ontario",
        tax_name=payload.tax_name.strip() or "HST",
        tax_rate=payload.tax_rate,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return CityOut(
        id=c.id,
        name=c.name,
        is_active=c.is_active,
        province_name=c.province_name,
        tax_name=c.tax_name,
        tax_rate=c.tax_rate,
    )


@router.put("/cities/{city_id}", response_model=CityOut)
def update_city_tax(
    city_id: int,
    payload: CityTaxUpdateIn,
    user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    city = db.scalar(select(City).where(City.id == city_id))
    if not city:
        raise HTTPException(404, "City not found")
    city.province_name = payload.province_name.strip() or city.province_name
    city.tax_name = payload.tax_name.strip() or city.tax_name
    city.tax_rate = payload.tax_rate
    db.commit()
    db.refresh(city)
    return CityOut(
        id=city.id,
        name=city.name,
        is_active=city.is_active,
        province_name=city.province_name,
        tax_name=city.tax_name,
        tax_rate=city.tax_rate,
    )


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
        member = db.scalar(select(User).where(User.id == sel.user_id))
        out.append({
            "user_id": sel.user_id,
            "user_name": member.name if member else "Unknown",
            "user_email": member.email if member else "",
            "user_role": member.role.value if member else "",
            "driver_name": member.name if member else "Unknown",
            "driver_email": member.email if member else "",
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
