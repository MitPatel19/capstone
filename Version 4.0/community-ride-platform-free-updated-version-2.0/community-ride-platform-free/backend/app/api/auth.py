from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select
import aiofiles
import hashlib
import os
import secrets
import uuid

from app.core.auth import hash_password, verify_password, create_access_token, get_current_user, require_role
from app.core.settings import settings
from app.db.session import get_db
from app.models import User, UserRole, DriverProfile, DriverApprovalStatus, UserProfile, Rating, Ride, RideStatus, JoinRequest, JoinRequestStatus, City, DriverCitySelection, RiderDefaultRoute, DriverVehicle, Notification
from app.schemas import Token, ProfileOut, ProfileUpdateIn, ChangePasswordIn, MetricsOut, RiderStatsOut, DriverDocsOut, NotificationOut, AuthActionOut
from app.schemas import SignupRiderIn, LoginIn, ForgotPasswordIn, ResetPasswordIn, ResendVerificationIn
from app.schemas import CityOut, DriverCityOut, DriverCitySelectIn, RiderDefaultRouteOut, RiderDefaultRouteIn
from app.services.emailer import send_email
from app.services.license_monitor import parse_license_expiry_date, sync_driver_license_notifications

router = APIRouter(prefix="/auth", tags=["auth"])


def hash_auth_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def build_verify_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}"


def build_reset_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"


def maybe_debug_url(url: str, email_sent: bool) -> str | None:
    if email_sent or settings.ENV.lower() == "prod":
        return None
    return url


def send_verification_email(user: User) -> tuple[bool, str]:
    token = secrets.token_urlsafe(32)
    verify_url = build_verify_url(token)
    user.email_verification_token_hash = hash_auth_token(token)
    user.email_verification_sent_at = datetime.utcnow()
    user.password_reset_token_hash = ""
    user.password_reset_sent_at = None
    user.password_reset_expires_at = None
    email_sent = send_email(
        to_email=user.email,
        subject="Verify your Community Ride account",
        text_body=(
            f"Hi {user.name},\n\n"
            f"Please verify your email by opening this link:\n{verify_url}\n\n"
            "If you did not create this account, you can ignore this email."
        ),
        html_body=(
            f"<p>Hi {user.name},</p>"
            f"<p>Please verify your email by clicking <a href=\"{verify_url}\">this link</a>.</p>"
            "<p>If you did not create this account, you can ignore this email.</p>"
        ),
    )
    return email_sent, verify_url


def send_password_reset_email(user: User) -> tuple[bool, str]:
    token = secrets.token_urlsafe(32)
    reset_url = build_reset_url(token)
    user.password_reset_token_hash = hash_auth_token(token)
    user.password_reset_sent_at = datetime.utcnow()
    user.password_reset_expires_at = datetime.utcnow() + timedelta(hours=1)
    email_sent = send_email(
        to_email=user.email,
        subject="Reset your Community Ride password",
        text_body=(
            f"Hi {user.name},\n\n"
            f"Use this link to reset your password:\n{reset_url}\n\n"
            "This link expires in 1 hour. If you did not request this, you can ignore this email."
        ),
        html_body=(
            f"<p>Hi {user.name},</p>"
            f"<p>Use <a href=\"{reset_url}\">this link</a> to reset your password.</p>"
            "<p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>"
        ),
    )
    return email_sent, reset_url


def get_or_create_profile(db: Session, user_id: int) -> UserProfile:
    prof = db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    if prof:
        return prof
    prof = UserProfile(user_id=user_id, default_address="", avatar_path="")
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return prof


def get_or_create_rider_defaults(db: Session, user_id: int) -> RiderDefaultRoute:
    defaults = db.scalar(select(RiderDefaultRoute).where(RiderDefaultRoute.user_id == user_id))
    if defaults:
        return defaults
    defaults = RiderDefaultRoute(user_id=user_id, pickup_text="", dropoff_text="")
    db.add(defaults)
    db.commit()
    db.refresh(defaults)
    return defaults


def get_or_create_driver_vehicle(db: Session, user_id: int) -> DriverVehicle:
    row = db.scalar(select(DriverVehicle).where(DriverVehicle.user_id == user_id))
    if row:
        return row
    row = DriverVehicle(user_id=user_id, vehicle_details="")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def require_active_city(db: Session, city_id: int) -> City:
    city = db.scalar(select(City).where(City.id == city_id, City.is_active == True))
    if not city:
        raise HTTPException(404, "Selected city is not available")
    return city


def upsert_approved_city_selection(db: Session, user_id: int, city_id: int) -> DriverCitySelection:
    sel = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user_id))
    if not sel:
        sel = DriverCitySelection(user_id=user_id)
        db.add(sel)
    sel.approved_city_id = city_id
    sel.pending_city_id = None
    sel.approval_status = "approved"
    return sel


def rating_summary(db: Session, user_id: int) -> tuple[float, int]:
    rows = db.scalars(select(Rating).where(Rating.to_user_id == user_id)).all()
    if not rows:
        return 0.0, 0
    avg = sum(r.stars for r in rows) / len(rows)
    return round(avg, 1), len(rows)


def driver_join_bonus_total(db: Session, ride_id: int) -> float:
    rows = db.scalars(
        select(JoinRequest).where(
            JoinRequest.ride_id == ride_id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    ).all()
    return round(sum(float(r.driver_bonus or 0.0) for r in rows), 2)


@router.post("/signup/rider", response_model=AuthActionOut)
def signup_rider(payload: SignupRiderIn, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(400, "Email already registered")
    require_active_city(db, payload.city_id)
    user = User(
        role=UserRole.rider,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        age=payload.age,
        is_student=payload.is_student,
        email_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    upsert_approved_city_selection(db, user.id, payload.city_id)
    email_sent, verify_url = send_verification_email(user)
    db.commit()
    return AuthActionOut(
        status="verification_required",
        message="Account created. Verify your email before logging in.",
        email_sent=email_sent,
        debug_url=maybe_debug_url(verify_url, email_sent),
    )


@router.post("/signup/driver", response_model=AuthActionOut)
async def signup_driver(
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    phone: str = Form(""),
    age: int = Form(...),
    is_student: bool = Form(...),
    city_id: int = Form(...),
    license_expiry_date: str = Form(...),
    license_file: UploadFile = File(...),
    id_file: UploadFile = File(...),
    insurance_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if age < 23:
        raise HTTPException(400, "Driver must be 23+")
    if is_student:
        raise HTTPException(400, "Driver cannot be a student")
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(400, "Email already registered")
    require_active_city(db, city_id)
    parsed_license_expiry = parse_license_expiry_date(license_expiry_date)
    if not parsed_license_expiry:
        raise HTTPException(400, "License expiry date must use YYYY-MM-DD format")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    async def save_file(up: UploadFile) -> str:
        ext = os.path.splitext(up.filename or "")[1]
        fname = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(settings.UPLOAD_DIR, fname)
        async with aiofiles.open(path, "wb") as f:
            content = await up.read()
            await f.write(content)
        return path

    license_path = await save_file(license_file)
    id_path = await save_file(id_file)
    insurance_path = await save_file(insurance_file)

    user = User(
        role=UserRole.driver,
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        age=age,
        is_student=is_student,
        email_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    profile = DriverProfile(
        user_id=user.id,
        approval_status=DriverApprovalStatus.pending,
        license_path=license_path,
        license_expiry_date=parsed_license_expiry,
        license_expiry_status="valid",
        license_expiry_source="manual",
        id_path=id_path,
        insurance_path=insurance_path,
    )
    db.add(profile)
    upsert_approved_city_selection(db, user.id, city_id)
    email_sent, verify_url = send_verification_email(user)
    db.commit()
    sync_driver_license_notifications(db)
    db.commit()
    return AuthActionOut(
        status="verification_required",
        message="Application received. Verify your email first, then wait for admin approval.",
        email_sent=email_sent,
        debug_url=maybe_debug_url(verify_url, email_sent),
    )


@router.post("/login", response_model=Token)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    sync_driver_license_notifications(db)
    db.commit()
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if user.role.value != payload.role:
        raise HTTPException(400, "Role mismatch")
    if not user.email_verified:
        raise HTTPException(403, "Email not verified. Please check your inbox or resend verification email.")
    if user.role == UserRole.driver:
        prof = user.driver_profile
        if not prof or prof.approval_status != DriverApprovalStatus.approved:
            raise HTTPException(403, "Driver account not approved yet")
    token = create_access_token(subject=user.email, role=user.role.value, user_id=user.id)
    return Token(access_token=token)


@router.get("/verify-email", response_model=AuthActionOut)
def verify_email(token: str, db: Session = Depends(get_db)):
    token_hash = hash_auth_token(token)
    user = db.scalar(select(User).where(User.email_verification_token_hash == token_hash))
    if not user:
        raise HTTPException(400, "Verification link is invalid or already used")
    user.email_verified = True
    user.email_verification_token_hash = ""
    user.email_verification_sent_at = None
    db.commit()
    return AuthActionOut(
        status="verified",
        message="Your email has been verified. You can sign in now.",
        email_sent=False,
    )


@router.post("/resend-verification", response_model=AuthActionOut)
def resend_verification(payload: ResendVerificationIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user:
        return AuthActionOut(
            status="ok",
            message="If the account exists, a verification email has been sent.",
            email_sent=False,
        )
    if user.email_verified:
        return AuthActionOut(
            status="already_verified",
            message="This email is already verified. You can sign in.",
            email_sent=False,
        )
    email_sent, verify_url = send_verification_email(user)
    db.commit()
    return AuthActionOut(
        status="verification_sent",
        message="Verification email sent. Please check your inbox.",
        email_sent=email_sent,
        debug_url=maybe_debug_url(verify_url, email_sent),
    )


@router.post("/forgot_password", response_model=AuthActionOut)
def forgot_password(payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.email_verified:
        return AuthActionOut(
            status="ok",
            message="If the account exists, a password reset email has been sent.",
            email_sent=False,
        )
    email_sent, reset_url = send_password_reset_email(user)
    db.commit()
    return AuthActionOut(
        status="reset_sent",
        message="If the account exists, a password reset email has been sent.",
        email_sent=email_sent,
        debug_url=maybe_debug_url(reset_url, email_sent),
    )


@router.post("/reset_password", response_model=AuthActionOut)
def reset_password(payload: ResetPasswordIn, db: Session = Depends(get_db)):
    token_hash = hash_auth_token(payload.token)
    user = db.scalar(select(User).where(User.password_reset_token_hash == token_hash))
    if not user or not user.password_reset_expires_at or user.password_reset_expires_at < datetime.utcnow():
        raise HTTPException(400, "Password reset link is invalid or expired")
    user.password_hash = hash_password(payload.new_password)
    user.password_reset_token_hash = ""
    user.password_reset_sent_at = None
    user.password_reset_expires_at = None
    db.commit()
    return AuthActionOut(
        status="password_reset",
        message="Your password has been reset. You can sign in now.",
        email_sent=False,
    )


@router.get("/me", response_model=ProfileOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sync_driver_license_notifications(db)
    db.commit()
    prof = get_or_create_profile(db, user.id)
    vehicle = get_or_create_driver_vehicle(db, user.id) if user.role == UserRole.driver else None
    avg, cnt = rating_summary(db, user.id)
    member_since = user.created_at.strftime("%B %Y")
    avatar_url = ""
    if prof.avatar_path:
        avatar_url = prof.avatar_path.replace(settings.UPLOAD_DIR, "/uploads")
    return ProfileOut(
        id=user.id,
        role=user.role.value,
        name=user.name,
        email=user.email,
        phone=user.phone,
        age=user.age,
        is_student=user.is_student,
        status=user.status.value,
        default_address=prof.default_address,
        avatar_url=avatar_url,
        member_since=member_since,
        rating_avg=avg,
        rating_count=cnt,
        vehicle_details=vehicle.vehicle_details if vehicle else "",
    )


@router.put("/me", response_model=ProfileOut)
def update_me(payload: ProfileUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.name = payload.name
    user.phone = payload.phone
    prof = get_or_create_profile(db, user.id)
    prof.default_address = payload.default_address
    if user.role == UserRole.driver:
        vehicle = get_or_create_driver_vehicle(db, user.id)
        vehicle.vehicle_details = (payload.vehicle_details or "").strip()
    db.commit()
    return me(user, db)


@router.post("/change_password", response_model=dict)
def change_password(payload: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    user.password_reset_token_hash = ""
    user.password_reset_sent_at = None
    user.password_reset_expires_at = None
    db.commit()
    return {"status": "ok"}


@router.post("/avatar", response_model=dict)
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    fname = f"avatar_{user.id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, fname)
    async with aiofiles.open(path, "wb") as f:
        content = await file.read()
        await f.write(content)
    prof = get_or_create_profile(db, user.id)
    prof.avatar_path = path
    db.commit()
    return {"status": "ok"}


@router.delete("/avatar", response_model=dict)
def delete_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prof = get_or_create_profile(db, user.id)
    if prof.avatar_path and os.path.exists(prof.avatar_path):
        try:
            os.remove(prof.avatar_path)
        except Exception:
            pass
    prof.avatar_path = ""
    db.commit()
    return {"status": "ok"}


@router.get("/metrics", response_model=MetricsOut)
def metrics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    avg, _ = rating_summary(db, user.id)
    rider_total = 0
    rider_active = 0
    if user.role == UserRole.rider:
        own_ids = set(db.scalars(select(Ride.id).where(Ride.rider_id == user.id)).all())
        joined_ids = set(
            db.scalars(
                select(JoinRequest.ride_id).where(
                    JoinRequest.joiner_id == user.id,
                    JoinRequest.status == JoinRequestStatus.accepted,
                )
            ).all()
        )
        rider_ids = own_ids | joined_ids
        rider_total = len(rider_ids)
        if rider_ids:
            rider_active = len(
                db.scalars(
                    select(Ride.id).where(
                        Ride.id.in_(list(rider_ids)),
                        Ride.status.notin_([RideStatus.completed, RideStatus.cancelled]),
                    )
                ).all()
            )
    driver_total = len(db.scalars(select(Ride.id).where(Ride.driver_id == user.id)).all()) if user.role == UserRole.driver else 0
    driver_active = len(db.scalars(select(Ride.id).where(Ride.driver_id == user.id, Ride.status.notin_([RideStatus.completed, RideStatus.cancelled]))).all()) if user.role == UserRole.driver else 0

    today = datetime.utcnow().strftime("%Y-%m-%d")
    todays_earnings = 0.0
    if user.role == UserRole.driver:
        rides = db.scalars(select(Ride).where(Ride.driver_id == user.id, Ride.status == RideStatus.completed)).all()
        for ride in rides:
            if ride.created_at.strftime("%Y-%m-%d") == today:
                todays_earnings += float(ride.bargain_price or ride.posted_price or 0.0)
                todays_earnings += driver_join_bonus_total(db, ride.id)
        todays_earnings = round(todays_earnings, 2)

    return MetricsOut(
        active_rides=rider_active,
        total_rides=rider_total,
        rating_avg=avg,
        accepted_rides=driver_active,
        todays_earnings=todays_earnings,
        total_driver_rides=driver_total,
    )


@router.get("/rider_stats", response_model=RiderStatsOut)
def rider_stats(user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    nowm = datetime.utcnow().strftime("%Y-%m")
    own_rides = db.scalars(select(Ride).where(Ride.rider_id == user.id)).all()
    accepted_joins = db.scalars(
        select(JoinRequest).where(
            JoinRequest.joiner_id == user.id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    ).all()
    accepted_join_by_ride = {jr.ride_id: jr for jr in accepted_joins}
    joined_rides = (
        db.scalars(select(Ride).where(Ride.id.in_(list(accepted_join_by_ride.keys())))).all()
        if accepted_join_by_ride
        else []
    )
    rides_by_id = {ride.id: ride for ride in own_rides}
    for ride in joined_rides:
        rides_by_id[ride.id] = ride
    rides = list(rides_by_id.values())
    total = len(rides)
    completed_this_month = 0
    route_counts = {}
    for ride in rides:
        if ride.status == RideStatus.completed and ride.created_at.strftime("%Y-%m") == nowm:
            completed_this_month += 1
        if ride.status == RideStatus.completed:
            if ride.rider_id == user.id:
                first = None
                if ride.stops:
                    first = sorted(ride.stops, key=lambda x: x.order_index)[0].dropoff_text
                route = f"{ride.pickup_text} -> {first or 'Destination'}"
            else:
                jr = accepted_join_by_ride.get(ride.id)
                route = f"{jr.from_text if jr else ride.pickup_text} -> {jr.to_text if jr else 'Destination'}"
            route_counts[route] = route_counts.get(route, 0) + 1
    fav = max(route_counts.items(), key=lambda kv: kv[1])[0] if route_counts else "-"
    return RiderStatsOut(total_rides=total, rides_this_month=completed_this_month, favorite_route=fav)


@router.get("/driver_docs", response_model=DriverDocsOut)
def driver_docs(user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    sync_driver_license_notifications(db)
    db.commit()
    prof = user.driver_profile
    up = get_or_create_profile(db, user.id)
    if not prof:
        raise HTTPException(404, "Driver profile not found")
    return DriverDocsOut(
        approval_status=prof.approval_status.value,
        reviewed_at=prof.reviewed_at.isoformat() if prof.reviewed_at else None,
        review_note=prof.review_note,
        docs_status=up.docs_status,
        docs_updated_at=up.docs_updated_at.isoformat() if up.docs_updated_at else None,
        license_expiry_date=prof.license_expiry_date.date().isoformat() if prof.license_expiry_date else None,
        license_expiry_status=prof.license_expiry_status or "unknown",
        license_expiry_source=prof.license_expiry_source or "manual",
    )


@router.post("/driver_documents")
async def update_driver_documents(
    license_file: UploadFile = File(None),
    license_expiry_date: str = Form(""),
    id_file: UploadFile = File(None),
    insurance_file: UploadFile = File(None),
    user: User = Depends(require_role(UserRole.driver)),
    db: Session = Depends(get_db),
):
    prof = user.driver_profile
    if not prof:
        raise HTTPException(404, "Driver profile not found")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    async def save_optional(up: UploadFile | None) -> str | None:
        if not up:
            return None
        ext = os.path.splitext(up.filename or "")[1]
        fname = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(settings.UPLOAD_DIR, fname)
        async with aiofiles.open(path, "wb") as f:
            content = await up.read()
            await f.write(content)
        return path

    lp = await save_optional(license_file)
    ip = await save_optional(id_file)
    ins = await save_optional(insurance_file)

    if lp:
        parsed_license_expiry = parse_license_expiry_date(license_expiry_date)
        if not parsed_license_expiry:
            raise HTTPException(400, "License expiry date must use YYYY-MM-DD format when uploading a new driver license")
        prof.license_path = lp
        prof.license_expiry_date = parsed_license_expiry
        prof.license_expiry_source = "manual"
    if ip:
        prof.id_path = ip
    if ins:
        prof.insurance_path = ins

    prof.approval_status = DriverApprovalStatus.pending
    prof.review_note = "Documents updated; pending admin review."
    prof.reviewed_at = None

    up = get_or_create_profile(db, user.id)
    up.docs_status = "pending_review"
    up.docs_updated_at = datetime.utcnow()

    db.commit()
    sync_driver_license_notifications(db)
    db.commit()
    return {"status": "pending_review"}


@router.get("/cities", response_model=list[CityOut])
def list_cities(db: Session = Depends(get_db)):
    cities = db.scalars(select(City).where(City.is_active == True).order_by(City.name.asc())).all()
    return [CityOut(id=city.id, name=city.name, is_active=city.is_active) for city in cities]


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sync_driver_license_notifications(db)
    db.commit()
    notifications = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(20)
    ).all()
    return [
        NotificationOut(
            id=n.id,
            kind=n.kind,
            title=n.title,
            body=n.body,
            action_path=n.action_path or "",
            is_read=n.is_read,
            created_at=n.created_at.isoformat(),
        )
        for n in notifications
    ]


@router.post("/notifications/{notification_id}/read", response_model=dict)
def mark_notification_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notification = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not notification:
        raise HTTPException(404, "Notification not found")
    notification.is_read = True
    db.commit()
    return {"status": "read"}


@router.get("/driver_city", response_model=DriverCityOut)
def get_driver_city(user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    sel = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user.id))
    if not sel:
        return DriverCityOut()
    return DriverCityOut(
        approved_city_id=sel.approved_city_id,
        approved_city_name=sel.approved_city.name if sel.approved_city else "",
        pending_city_id=sel.pending_city_id,
        pending_city_name=sel.pending_city.name if sel.pending_city else "",
        approval_status=sel.approval_status,
        reviewed_at=sel.reviewed_at.isoformat() if sel.reviewed_at else None,
    )


@router.post("/driver_city", response_model=DriverCityOut)
def request_driver_city(payload: DriverCitySelectIn, user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    city = db.scalar(select(City).where(City.id == payload.city_id, City.is_active == True))
    if not city:
        raise HTTPException(404, "City not found")
    sel = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user.id))
    if not sel:
        sel = DriverCitySelection(user_id=user.id)
        db.add(sel)
    sel.pending_city_id = city.id
    sel.approval_status = "pending"
    sel.reviewed_at = None
    db.commit()
    db.refresh(sel)
    return DriverCityOut(
        approved_city_id=sel.approved_city_id,
        approved_city_name=sel.approved_city.name if sel.approved_city else "",
        pending_city_id=sel.pending_city_id,
        pending_city_name=sel.pending_city.name if sel.pending_city else "",
        approval_status=sel.approval_status,
        reviewed_at=sel.reviewed_at.isoformat() if sel.reviewed_at else None,
    )


@router.get("/rider_city", response_model=DriverCityOut)
def get_rider_city(user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    sel = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user.id))
    if not sel:
        return DriverCityOut()
    return DriverCityOut(
        approved_city_id=sel.approved_city_id,
        approved_city_name=sel.approved_city.name if sel.approved_city else "",
        pending_city_id=sel.pending_city_id,
        pending_city_name=sel.pending_city.name if sel.pending_city else "",
        approval_status=sel.approval_status,
        reviewed_at=sel.reviewed_at.isoformat() if sel.reviewed_at else None,
    )


@router.post("/rider_city", response_model=DriverCityOut)
def request_rider_city(payload: DriverCitySelectIn, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    city = db.scalar(select(City).where(City.id == payload.city_id, City.is_active == True))
    if not city:
        raise HTTPException(404, "City not found")
    sel = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user.id))
    if not sel:
        sel = DriverCitySelection(user_id=user.id)
        db.add(sel)
    sel.pending_city_id = city.id
    sel.approval_status = "pending"
    sel.reviewed_at = None
    db.commit()
    db.refresh(sel)
    return DriverCityOut(
        approved_city_id=sel.approved_city_id,
        approved_city_name=sel.approved_city.name if sel.approved_city else "",
        pending_city_id=sel.pending_city_id,
        pending_city_name=sel.pending_city.name if sel.pending_city else "",
        approval_status=sel.approval_status,
        reviewed_at=sel.reviewed_at.isoformat() if sel.reviewed_at else None,
    )


@router.get("/rider_defaults", response_model=RiderDefaultRouteOut)
def get_rider_defaults(user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    defaults = get_or_create_rider_defaults(db, user.id)
    return RiderDefaultRouteOut(
        pickup_text=defaults.pickup_text or "",
        dropoff_text=defaults.dropoff_text or "",
        updated_at=defaults.updated_at.isoformat() if defaults.updated_at else None,
    )


@router.put("/rider_defaults", response_model=RiderDefaultRouteOut)
def update_rider_defaults(payload: RiderDefaultRouteIn, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    defaults = get_or_create_rider_defaults(db, user.id)
    defaults.pickup_text = (payload.pickup_text or "").strip()
    defaults.dropoff_text = (payload.dropoff_text or "").strip()
    defaults.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(defaults)
    return RiderDefaultRouteOut(
        pickup_text=defaults.pickup_text or "",
        dropoff_text=defaults.dropoff_text or "",
        updated_at=defaults.updated_at.isoformat() if defaults.updated_at else None,
    )
