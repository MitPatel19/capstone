from datetime import datetime
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session
import aiofiles
import os
import uuid

from app.core.auth import get_current_user
from app.core.storage import build_upload_path, ensure_upload_dir, upload_path_to_url
from app.db.session import get_db
from app.models import Ride, SupportReport, SupportReportStatus, SupportReportTargetType, User, UserRole
from app.schemas import SupportReportOut

router = APIRouter(prefix="/reports", tags=["reports"])


def can_user_report_ride(user: User, ride: Ride, db: Session) -> bool:
    if user.role == UserRole.admin:
        return True
    if user.role == UserRole.driver:
        return ride.driver_id == user.id
    if user.role == UserRole.rider:
        if ride.rider_id == user.id:
            return True
        from app.models import JoinRequest, JoinRequestStatus
        jr = db.scalar(
            select(JoinRequest).where(
                JoinRequest.ride_id == ride.id,
                JoinRequest.joiner_id == user.id,
                JoinRequest.status == JoinRequestStatus.accepted,
            )
        )
        return jr is not None
    return False


def report_to_out(report: SupportReport, db: Session) -> SupportReportOut:
    reporter = db.scalar(select(User).where(User.id == report.reporter_user_id))
    reported = db.scalar(select(User).where(User.id == report.reported_user_id)) if report.reported_user_id else None
    return SupportReportOut(
        id=report.id,
        target_type=report.target_type.value,
        status=report.status.value,
        category=report.category,
        subject=report.subject,
        description=report.description,
        reporter_user_id=report.reporter_user_id,
        reporter_name=reporter.name if reporter else "Unknown",
        reported_user_id=report.reported_user_id,
        reported_name=reported.name if reported else "",
        ride_id=report.ride_id,
        attachment_url=upload_path_to_url(report.attachment_path),
        admin_note=report.admin_note or "",
        created_at=report.created_at.isoformat(),
        updated_at=report.updated_at.isoformat(),
        resolved_at=report.resolved_at.isoformat() if report.resolved_at else None,
    )


@router.post("", response_model=SupportReportOut)
async def create_report(
    target_type: str = Form(...),
    category: str = Form(...),
    subject: str = Form(...),
    description: str = Form(""),
    ride_id: int | None = Form(None),
    reported_user_id: int | None = Form(None),
    attachment: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        normalized_target = SupportReportTargetType(target_type)
    except Exception:
        raise HTTPException(400, "Invalid report target type")

    subject = (subject or "").strip()
    description = (description or "").strip()
    category = (category or "").strip().lower()
    if not subject:
        raise HTTPException(400, "Subject is required")
    if len(description) < 10:
        raise HTTPException(400, "Please provide a more detailed description")

    ride = None
    if ride_id is not None:
        ride = db.scalar(select(Ride).where(Ride.id == ride_id))
        if not ride:
            raise HTTPException(404, "Ride not found")

    reported_user = None
    if reported_user_id is not None:
        reported_user = db.scalar(select(User).where(User.id == reported_user_id))
        if not reported_user:
            raise HTTPException(404, "Reported user not found")
        if reported_user.id == user.id:
            raise HTTPException(400, "You cannot report yourself")

    if normalized_target == SupportReportTargetType.ride:
        if not ride:
            raise HTTPException(400, "Ride report requires a ride")
        if not can_user_report_ride(user, ride, db):
            raise HTTPException(403, "You cannot report this ride")
    elif normalized_target == SupportReportTargetType.user:
        if not reported_user:
            raise HTTPException(400, "User report requires a reported user")
        if ride and not can_user_report_ride(user, ride, db):
            raise HTTPException(403, "You cannot attach this ride to the report")
    else:
        ride = None
        reported_user = None

    attachment_path = ""
    if attachment:
        ensure_upload_dir()
        ext = os.path.splitext(attachment.filename or "")[1]
        fname = f"report_{uuid.uuid4().hex}{ext}"
        attachment_path = str(build_upload_path(fname))
        async with aiofiles.open(attachment_path, "wb") as f:
            content = await attachment.read()
            await f.write(content)

    report = SupportReport(
        reporter_user_id=user.id,
        target_type=normalized_target,
        status=SupportReportStatus.open,
        category=category or "general",
        subject=subject,
        description=description,
        ride_id=ride.id if ride else None,
        reported_user_id=reported_user.id if reported_user else None,
        attachment_path=attachment_path,
        updated_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report_to_out(report, db)


@router.get("/mine", response_model=list[SupportReportOut])
def my_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reports = db.scalars(
        select(SupportReport)
        .where(SupportReport.reporter_user_id == user.id)
        .order_by(SupportReport.created_at.desc())
    ).all()
    return [report_to_out(r, db) for r in reports]
