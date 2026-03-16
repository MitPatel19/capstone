from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select
import os, uuid
import aiofiles

from app.db.session import get_db
from app.models import User, UserRole, DriverProfile, DriverApprovalStatus, UserProfile, Rating, Ride, RideStatus, JoinRequest, JoinRequestStatus, City, DriverCitySelection, RiderDefaultRoute, DriverVehicle
from app.schemas import Token, UserOut, ProfileOut, ProfileUpdateIn, ChangePasswordIn, MetricsOut, RiderStatsOut, DriverDocsOut
from app.schemas import SignupRiderIn, SignupDriverIn, LoginIn
from app.schemas import CityOut, DriverCityOut, DriverCitySelectIn, RiderDefaultRouteOut, RiderDefaultRouteIn
from app.core.auth import hash_password, verify_password, create_access_token, get_current_user, require_role
from app.core.settings import settings

router = APIRouter(prefix="/auth", tags=["auth"])

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

def rating_summary(db: Session, user_id: int) -> tuple[float,int]:
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


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, role=u.role.value, name=u.name, email=u.email, phone=u.phone,
        status=u.status.value, age=u.age, is_student=u.is_student
    )

@router.post("/signup/rider", response_model=UserOut)
def signup_rider(payload: SignupRiderIn, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(400, "Email already registered")
    u = User(
        role=UserRole.rider,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        age=payload.age,
        is_student=payload.is_student,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return user_out(u)

@router.post("/signup/driver", response_model=dict)
async def signup_driver(
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    phone: str = Form(""),
    age: int = Form(...),
    is_student: bool = Form(...),
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

    u = User(
        role=UserRole.driver,
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        age=age,
        is_student=is_student,
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    profile = DriverProfile(
        user_id=u.id,
        approval_status=DriverApprovalStatus.pending,
        license_path=license_path,
        id_path=id_path,
        insurance_path=insurance_path,
    )
    db.add(profile)
    db.commit()
    return {"status": "pending", "message": "Account pending admin approval (within 24 hours)"}

@router.post("/login", response_model=Token)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == payload.email))
    if not u or not verify_password(payload.password, u.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if u.role.value != payload.role:
        raise HTTPException(400, "Role mismatch")
    if u.role == UserRole.driver:
        prof = u.driver_profile
        if not prof or prof.approval_status != DriverApprovalStatus.approved:
            raise HTTPException(403, "Driver account not approved yet")
    token = create_access_token(subject=u.email, role=u.role.value, user_id=u.id)
    return Token(access_token=token)


@router.get("/me", response_model=ProfileOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prof = get_or_create_profile(db, user.id)
    vehicle = get_or_create_driver_vehicle(db, user.id) if user.role == UserRole.driver else None
    avg, cnt = rating_summary(db, user.id)
    member_since = user.created_at.strftime("%B %Y")
    avatar_url = ""
    if prof.avatar_path:
        # served as static by FastAPI's file serving (see main.py)
        avatar_url = prof.avatar_path.replace(settings.UPLOAD_DIR, "/uploads")
    return ProfileOut(
        id=user.id, role=user.role.value, name=user.name, email=user.email, phone=user.phone,
        age=user.age, is_student=user.is_student, status=user.status.value,
        default_address=prof.default_address, avatar_url=avatar_url,
        member_since=member_since, rating_avg=avg, rating_count=cnt,
        vehicle_details=vehicle.vehicle_details if vehicle else ""
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
    db.commit()
    return {"status":"ok"}

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
    return {"status":"ok"}

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
    return {"status":"ok"}

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
    driver_total = len(db.scalars(select(Ride.id).where(Ride.driver_id==user.id)).all()) if user.role==UserRole.driver else 0
    driver_active = len(db.scalars(select(Ride.id).where(Ride.driver_id==user.id, Ride.status.notin_([RideStatus.completed, RideStatus.cancelled]))).all()) if user.role==UserRole.driver else 0

    # today's earnings (sum completed today)
    from datetime import datetime
    today = datetime.utcnow().strftime("%Y-%m-%d")
    todays_earnings = 0.0
    if user.role == UserRole.driver:
        rides = db.scalars(select(Ride).where(Ride.driver_id==user.id, Ride.status==RideStatus.completed)).all()
        for r in rides:
            if r.created_at.strftime("%Y-%m-%d") == today:
                todays_earnings += float(r.bargain_price or r.posted_price or 0.0)
                todays_earnings += driver_join_bonus_total(db, r.id)
        todays_earnings = round(todays_earnings, 2)

    return MetricsOut(
        active_rides=rider_active, total_rides=rider_total, rating_avg=avg,
        accepted_rides=driver_active, todays_earnings=todays_earnings, total_driver_rides=driver_total
    )

@router.get("/rider_stats", response_model=RiderStatsOut)
def rider_stats(user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    from datetime import datetime
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
    rides_by_id = {r.id: r for r in own_rides}
    for r in joined_rides:
        rides_by_id[r.id] = r
    rides = list(rides_by_id.values())
    total = len(rides)
    completed_this_month = 0
    route_counts = {}
    for r in rides:
        if r.status == RideStatus.completed and r.created_at.strftime("%Y-%m") == nowm:
            completed_this_month += 1
        if r.status == RideStatus.completed:
            if r.rider_id == user.id:
                first = None
                if r.stops:
                    first = sorted(r.stops, key=lambda x: x.order_index)[0].dropoff_text
                route = f"{r.pickup_text} -> {first or 'Destination'}"
            else:
                jr = accepted_join_by_ride.get(r.id)
                route = f"{jr.from_text if jr else r.pickup_text} -> {jr.to_text if jr else 'Destination'}"
            route_counts[route] = route_counts.get(route, 0) + 1
    fav = max(route_counts.items(), key=lambda kv: kv[1])[0] if route_counts else "-"
    return RiderStatsOut(total_rides=total, rides_this_month=completed_this_month, favorite_route=fav)

@router.get("/driver_docs", response_model=DriverDocsOut)
def driver_docs(user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    prof = user.driver_profile
    up = get_or_create_profile(db, user.id)
    if not prof:
        raise HTTPException(404, "Driver profile not found")
    return DriverDocsOut(
        approval_status=prof.approval_status.value,
        reviewed_at=prof.reviewed_at.isoformat() if prof.reviewed_at else None,
        review_note=prof.review_note,
        docs_status=up.docs_status,
        docs_updated_at=up.docs_updated_at.isoformat() if up.docs_updated_at else None
    )

@router.post("/driver_documents")
async def update_driver_documents(
    license_file: UploadFile = File(None),
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

    if lp: prof.license_path = lp
    if ip: prof.id_path = ip
    if ins: prof.insurance_path = ins

    # Mark for admin review
    prof.approval_status = DriverApprovalStatus.pending
    prof.review_note = "Documents updated; pending admin review."
    from datetime import datetime
    prof.reviewed_at = None

    up = get_or_create_profile(db, user.id)
    up.docs_status = "pending_review"
    up.docs_updated_at = datetime.utcnow()

    db.commit()
    return {"status":"pending_review"}


@router.get("/cities", response_model=list[CityOut])
def list_cities(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cities = db.scalars(select(City).where(City.is_active == True).order_by(City.name.asc())).all()
    return [CityOut(id=c.id, name=c.name, is_active=c.is_active) for c in cities]


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
    from datetime import datetime
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
