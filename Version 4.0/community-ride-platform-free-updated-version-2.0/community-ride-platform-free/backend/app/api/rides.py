from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from datetime import datetime, timedelta
import random, string

from app.db.session import get_db
from app.core.auth import get_current_user, require_role
from app.models import User, UserRole, Ride, RideStop, RideStatus, Message, JoinRequest, JoinRequestStatus, Cancellation, Rating, DriverApprovalStatus, UserProfile, DriverVehicle, RideOffer, RideOfferStatus, DriverCitySelection
from app.schemas import RideCreateIn, RideOut, MessageIn, MessageOut, BargainIn, CancelIn, JoinRequestIn, JoinRequestOut, OTPVerifyIn, DriverOfferOut, ConfirmPriceIn, RatingIn, RoutePointOut
from app.services.billing import ensure_user_billing_access
from app.ws.manager import manager

router = APIRouter(prefix="/rides", tags=["rides"])

PRIMARY_RIDER_JOIN_SHARE = 0.35
DRIVER_COMPLETED_RIDE_RETENTION_HOURS = 24
DRIVER_TERMINAL_RIDE_STATUSES = {RideStatus.completed, RideStatus.cancelled}


def money_round(value: float) -> float:
    return round(float(value or 0.0) + 1e-9, 2)


def base_ride_price(ride: Ride) -> float:
    return money_round(ride.bargain_price if ride.bargain_price is not None else ride.posted_price)


def compute_join_split(price: float) -> tuple[float, float]:
    rider_credit = money_round(price * PRIMARY_RIDER_JOIN_SHARE)
    driver_bonus = money_round(price - rider_credit)
    return rider_credit, driver_bonus


def accepted_join_metrics(db: Session, ride_id: int) -> tuple[list[JoinRequest], float, float, float]:
    accepted_joins = db.scalars(
        select(JoinRequest).where(
            JoinRequest.ride_id == ride_id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    ).all()
    total_joiner_price = money_round(sum(jr.price for jr in accepted_joins))
    rider_discount_total = money_round(sum(jr.primary_rider_credit for jr in accepted_joins))
    driver_bonus_total = money_round(sum(jr.driver_bonus for jr in accepted_joins))
    return accepted_joins, total_joiner_price, rider_discount_total, driver_bonus_total

def user_rating_avg(db: Session, user_id: int) -> float:
    rows = db.scalars(select(Rating.stars).where(Rating.to_user_id == user_id)).all()
    if not rows:
        return 0.0
    return round(sum(rows) / len(rows), 1)


def is_accepted_joiner(db: Session, ride_id: int, user_id: int) -> bool:
    jr = db.scalar(
        select(JoinRequest).where(
            JoinRequest.ride_id == ride_id,
            JoinRequest.joiner_id == user_id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    )
    return jr is not None


def get_user_approved_city_id(db: Session, user_id: int) -> int | None:
    sel = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user_id))
    if not sel or not sel.approved_city_id:
        return None
    return sel.approved_city_id


def ensure_user_has_approved_city(user: User, db: Session) -> int:
    city_id = get_user_approved_city_id(db, user.id)
    if not city_id:
        raise HTTPException(403, "Approved city selection is required")
    return city_id


def ride_city_matches_user(db: Session, ride: Ride, user: User) -> bool:
    ride_city_id = get_user_approved_city_id(db, ride.rider_id)
    user_city_id = get_user_approved_city_id(db, user.id)
    return bool(ride_city_id and user_city_id and ride_city_id == user_city_id)


def optimize_stop_order(stops: list[str]) -> list[str]:
    # Lightweight dedup optimization; preserves sequence while removing repeated waypoints.
    seen = set()
    out: list[str] = []
    for s in stops:
        key = s.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


async def notify_driver_market_update(db: Session, ride_id: int):
    ride = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not ride:
        return
    ride_city_id = get_user_approved_city_id(db, ride.rider_id)
    if not ride_city_id:
        return
    driver_ids = db.scalars(select(User.id).where(User.role == UserRole.driver)).all()
    for did in driver_ids:
        if get_user_approved_city_id(db, did) != ride_city_id:
            continue
        await manager.send_to_user(did, {"type": "ride_market_update", "ride_id": ride_id})

def ride_to_out(r: Ride, db: Session) -> RideOut:
    rider = db.scalar(select(User).where(User.id == r.rider_id))
    driver = db.scalar(select(User).where(User.id == r.driver_id)) if r.driver_id else None
    vehicle_row = db.scalar(select(DriverVehicle).where(DriverVehicle.user_id == r.driver_id)) if r.driver_id else None
    show_vehicle = r.status in (RideStatus.confirmed, RideStatus.in_progress, RideStatus.completed)
    sorted_stops = sorted(r.stops, key=lambda x: x.order_index)
    route_points = [s.dropoff_text for s in sorted_stops]
    accepted_joins: list[JoinRequest] = []
    total_joiner_price = 0.0
    rider_discount_total = 0.0
    driver_bonus_total = 0.0
    if r.status in (RideStatus.confirmed, RideStatus.in_progress, RideStatus.completed):
        accepted_joins, total_joiner_price, rider_discount_total, driver_bonus_total = accepted_join_metrics(db, r.id)
        for jr in accepted_joins:
            route_points.append(jr.from_text)
            route_points.append(jr.to_text)
    optimized = optimize_stop_order(route_points)
    first_dropoff = optimized[0] if optimized else ""
    ride_price = base_ride_price(r)
    return RideOut(
        id=r.id, rider_id=r.rider_id, driver_id=r.driver_id,
        pickup_text=r.pickup_text, time_iso=r.time_iso, posted_price=r.posted_price,
        status=r.status.value, bargain_price=r.bargain_price,
        rider_confirmed_price=r.rider_confirmed_price, driver_confirmed_price=r.driver_confirmed_price,
        otp_verified=r.otp_verified,
        otp_code=(r.otp_code if not r.otp_verified else ""),
        rider_name=rider.name if rider else "",
        rider_phone=rider.phone if rider else "",
        rider_rating=user_rating_avg(db, rider.id) if rider else 0.0,
        driver_name=driver.name if driver else "",
        driver_phone=driver.phone if driver else "",
        driver_rating=user_rating_avg(db, driver.id) if driver else 0.0,
        driver_vehicle=(vehicle_row.vehicle_details if (vehicle_row and show_vehicle) else ""),
        first_dropoff_text=first_dropoff,
        accepted_joiner_count=len(accepted_joins),
        total_joiner_price=total_joiner_price,
        primary_rider_discount_total=rider_discount_total,
        primary_rider_net_price=money_round(max(0.0, ride_price - rider_discount_total)),
        driver_join_bonus_total=driver_bonus_total,
        driver_total_earnings=money_round(ride_price + driver_bonus_total),
        stops=[{"dropoff_text": text, "order_index": idx} for idx, text in enumerate(optimized)]
    )

def join_to_out(jr: JoinRequest, db: Session) -> JoinRequestOut:
    joiner = db.scalar(select(User).where(User.id == jr.joiner_id))
    return JoinRequestOut(
        id=jr.id,
        ride_id=jr.ride_id,
        joiner_id=jr.joiner_id,
        from_text=jr.from_text,
        to_text=jr.to_text,
        price=jr.price,
        primary_rider_credit=jr.primary_rider_credit,
        driver_bonus=jr.driver_bonus,
        status=jr.status.value,
        driver_decision=jr.driver_decision,
        rider_decision=jr.rider_decision,
        created_at=jr.created_at.isoformat(),
        joiner_name=joiner.name if joiner else "",
        joiner_phone=joiner.phone if joiner else "",
        joiner_rating=user_rating_avg(db, joiner.id) if joiner else 0.0,
    )


def offer_to_out(of: RideOffer, db: Session) -> DriverOfferOut:
    driver = db.scalar(select(User).where(User.id == of.driver_id))
    vehicle_row = db.scalar(select(DriverVehicle).where(DriverVehicle.user_id == of.driver_id))
    return DriverOfferOut(
        id=of.id,
        ride_id=of.ride_id,
        driver_id=of.driver_id,
        driver_name=driver.name if driver else "",
        driver_phone=driver.phone if driver else "",
        driver_rating=user_rating_avg(db, of.driver_id),
        driver_vehicle=vehicle_row.vehicle_details if vehicle_row else "",
        latest_price=of.latest_price,
        rider_confirmed_price=of.rider_confirmed_price,
        driver_confirmed_price=of.driver_confirmed_price,
        status=of.status.value,
        created_at=of.created_at.isoformat(),
        updated_at=of.updated_at.isoformat(),
    )


def can_view_ride(user: User, ride: Ride, db: Session) -> bool:
    if user.role == UserRole.admin:
        return True
    if user.role == UserRole.driver:
        if ride.driver_id == user.id:
            return True
        if ride.status in (RideStatus.requested, RideStatus.bargaining):
            return ride_city_matches_user(db, ride, user)
        return False
    if user.role == UserRole.rider:
        if ride.rider_id == user.id:
            return True
        if is_accepted_joiner(db, ride.id, user.id):
            return True
        return ride.status in (RideStatus.confirmed, RideStatus.in_progress) and ride_city_matches_user(db, ride, user)
    return False


def ensure_driver_docs_approved(user: User, db: Session):
    prof = user.driver_profile
    up = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    docs_status = up.docs_status if up else "up_to_date"
    if not prof or prof.approval_status != DriverApprovalStatus.approved or docs_status != "up_to_date":
        raise HTTPException(403, "Driver documents pending admin approval")

@router.get("/me", response_model=list[RideOut])
def my_rides(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == UserRole.rider:
        own = db.scalars(select(Ride).where(Ride.rider_id == user.id).order_by(Ride.id.desc())).all()
        joined_ids = db.scalars(
            select(JoinRequest.ride_id).where(
                JoinRequest.joiner_id == user.id,
                JoinRequest.status == JoinRequestStatus.accepted,
            )
        ).all()
        joined = db.scalars(select(Ride).where(Ride.id.in_(joined_ids)).order_by(Ride.id.desc())).all() if joined_ids else []
        by_id = {r.id: r for r in own}
        for r in joined:
            by_id[r.id] = r
        rides = sorted(by_id.values(), key=lambda x: x.id, reverse=True)
    elif user.role == UserRole.driver:
        rides = db.scalars(select(Ride).where(Ride.driver_id == user.id).order_by(Ride.id.desc())).all()
        cutoff = datetime.utcnow() - timedelta(hours=DRIVER_COMPLETED_RIDE_RETENTION_HOURS)
        rides = [
            r for r in rides
            if r.status not in DRIVER_TERMINAL_RIDE_STATUSES
            or (r.completed_at or r.created_at) >= cutoff
        ]
    else:
        rides = db.scalars(select(Ride).order_by(Ride.id.desc()).limit(100)).all()
    return [ride_to_out(r, db) for r in rides]


@router.get("/active", response_model=list[RideOut])
def active_rides_for_riders(user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    ensure_user_billing_access(db, user)
    ensure_user_has_approved_city(user, db)
    already_joined_ids = set(
        db.scalars(
            select(JoinRequest.ride_id).where(
                JoinRequest.joiner_id == user.id,
                JoinRequest.status == JoinRequestStatus.accepted,
            )
        ).all()
    )
    rides = db.scalars(
        select(Ride)
        .where(
            and_(
                Ride.status.in_([RideStatus.confirmed, RideStatus.in_progress]),
                Ride.rider_id != user.id,
            )
        )
        .order_by(Ride.id.desc())
        .limit(100)
    ).all()
    filtered = [r for r in rides if r.id not in already_joined_ids and ride_city_matches_user(db, r, user)]
    return [ride_to_out(r, db) for r in filtered]


@router.get("/available", response_model=list[RideOut])
def available_rides(user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    ensure_user_billing_access(db, user)
    ensure_driver_docs_approved(user, db)
    ensure_user_has_approved_city(user, db)
    rides = db.scalars(select(Ride).where(Ride.status.in_([RideStatus.requested, RideStatus.bargaining]))).all()
    # show only rides without driver or assigned to current driver
    out = []
    for r in rides:
        if (r.driver_id is None or r.driver_id == user.id) and ride_city_matches_user(db, r, user):
            out.append(ride_to_out(r, db))
    return out

@router.post("", response_model=RideOut)
def create_ride(payload: RideCreateIn, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    ensure_user_billing_access(db, user)
    ensure_user_has_approved_city(user, db)
    r = Ride(
        rider_id=user.id,
        pickup_text=payload.pickup_text,
        time_iso=payload.time_iso,
        posted_price=payload.posted_price,
        status=RideStatus.requested,
    )
    for st in payload.stops:
        r.stops.append(RideStop(order_index=st.order_index, dropoff_text=st.dropoff_text))
    db.add(r)
    db.commit()
    db.refresh(r)
    return ride_to_out(r, db)

@router.get("/{ride_id}", response_model=RideOut)
def get_ride(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if not can_view_ride(user, r, db):
        raise HTTPException(403, "Forbidden")
    return ride_to_out(r, db)


@router.get("/{ride_id}/route_plan", response_model=list[RoutePointOut])
def route_plan(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if not can_view_ride(user, r, db):
        raise HTTPException(403, "Forbidden")

    primary = db.scalar(select(User).where(User.id == r.rider_id))
    points: list[RoutePointOut] = []
    seq = 1

    points.append(
        RoutePointOut(
            sequence=seq,
            user_id=r.rider_id,
            user_name=primary.name if primary else f"Rider #{r.rider_id}",
            role="primary_rider",
            point_type="pickup",
            location_text=r.pickup_text,
        )
    )
    seq += 1

    for st in sorted(r.stops, key=lambda x: x.order_index):
        points.append(
            RoutePointOut(
                sequence=seq,
                user_id=r.rider_id,
                user_name=primary.name if primary else f"Rider #{r.rider_id}",
                role="primary_rider",
                point_type="dropoff",
                location_text=st.dropoff_text,
            )
        )
        seq += 1

    accepted_joins = db.scalars(
        select(JoinRequest).where(
            JoinRequest.ride_id == r.id,
            JoinRequest.status == JoinRequestStatus.accepted,
        ).order_by(JoinRequest.id.asc())
    ).all()
    for jr in accepted_joins:
        joiner = db.scalar(select(User).where(User.id == jr.joiner_id))
        joiner_name = joiner.name if joiner else f"Rider #{jr.joiner_id}"
        points.append(
            RoutePointOut(
                sequence=seq,
                user_id=jr.joiner_id,
                user_name=joiner_name,
                role="joined_rider",
                point_type="pickup",
                location_text=jr.from_text,
            )
        )
        seq += 1
        points.append(
            RoutePointOut(
                sequence=seq,
                user_id=jr.joiner_id,
                user_name=joiner_name,
                role="joined_rider",
                point_type="dropoff",
                location_text=jr.to_text,
            )
        )
        seq += 1

    return points

@router.post("/{ride_id}/driver/accept", response_model=RideOut)
async def driver_accept(ride_id: int, user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    ensure_user_billing_access(db, user)
    ensure_driver_docs_approved(user, db)
    ensure_user_has_approved_city(user, db)
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if not ride_city_matches_user(db, r, user):
        raise HTTPException(403, "Ride is not available in your approved city")
    if r.status not in (RideStatus.requested, RideStatus.bargaining) or r.driver_id is not None:
        raise HTTPException(400, "Ride already confirmed by another driver")
    # First driver to accept immediately confirms the ride at posted price.
    r.driver_id = user.id
    r.status = RideStatus.confirmed
    r.bargain_price = r.posted_price
    r.driver_confirmed_price = True
    r.rider_confirmed_price = True

    offers = db.scalars(select(RideOffer).where(RideOffer.ride_id == r.id)).all()
    for of in offers:
        if of.driver_id == user.id:
            of.latest_price = r.posted_price
            of.driver_confirmed_price = True
            of.rider_confirmed_price = True
            of.status = RideOfferStatus.accepted
            of.updated_at = datetime.utcnow()
        else:
            of.status = RideOfferStatus.rejected
            of.updated_at = datetime.utcnow()
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    await manager.send_to_user(user.id, {"type":"ride_update","ride_id":r.id})
    await notify_driver_market_update(db, r.id)
    return ride_to_out(r, db)


@router.get("/{ride_id}/offers", response_model=list[DriverOfferOut])
def list_offers(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if user.role == UserRole.rider:
        if r.rider_id != user.id and not is_accepted_joiner(db, r.id, user.id):
            raise HTTPException(403, "Forbidden")
    elif user.role == UserRole.driver:
        if r.driver_id != user.id and ((r.status != RideStatus.requested and r.status != RideStatus.bargaining) or not ride_city_matches_user(db, r, user)):
            raise HTTPException(403, "Forbidden")
    offers = db.scalars(select(RideOffer).where(RideOffer.ride_id == ride_id).order_by(RideOffer.updated_at.desc())).all()
    if user.role == UserRole.driver:
        offers = [of for of in offers if of.driver_id == user.id or of.status == RideOfferStatus.accepted]
    return [offer_to_out(of, db) for of in offers]

@router.post("/{ride_id}/bargain", response_model=RideOut)
async def bargain(ride_id: int, payload: BargainIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if r.status not in (RideStatus.bargaining, RideStatus.requested):
        raise HTTPException(400, "Cannot bargain now")
    if r.driver_id is not None:
        raise HTTPException(400, "Ride already confirmed")
    if user.role == UserRole.driver:
        ensure_user_billing_access(db, user)
        ensure_driver_docs_approved(user, db)
        ensure_user_has_approved_city(user, db)
        if not ride_city_matches_user(db, r, user):
            raise HTTPException(403, "Ride is not available in your approved city")
        of = db.scalar(select(RideOffer).where(RideOffer.ride_id == r.id, RideOffer.driver_id == user.id))
        if not of:
            of = RideOffer(ride_id=r.id, driver_id=user.id, latest_price=payload.new_price)
            db.add(of)
        of.latest_price = payload.new_price
        of.driver_confirmed_price = True
        of.rider_confirmed_price = False
        of.status = RideOfferStatus.pending
        of.updated_at = datetime.utcnow()
        r.status = RideStatus.bargaining
    elif user.role == UserRole.rider:
        ensure_user_billing_access(db, user)
        if r.rider_id != user.id:
            raise HTTPException(403, "Forbidden")
        if not payload.driver_id:
            raise HTTPException(400, "driver_id is required for rider bargain")
        of = db.scalar(select(RideOffer).where(RideOffer.ride_id == r.id, RideOffer.driver_id == payload.driver_id))
        if not of:
            raise HTTPException(404, "Driver offer not found")
        of.latest_price = payload.new_price
        of.rider_confirmed_price = True
        of.driver_confirmed_price = False
        of.status = RideOfferStatus.pending
        of.updated_at = datetime.utcnow()
        r.status = RideStatus.bargaining
    else:
        raise HTTPException(403, "Forbidden")
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    if user.role == UserRole.driver:
        await manager.send_to_user(user.id, {"type":"ride_update","ride_id":r.id})
    elif payload.driver_id:
        await manager.send_to_user(payload.driver_id, {"type":"ride_update","ride_id":r.id})
    return ride_to_out(r, db)

@router.post("/{ride_id}/confirm_price", response_model=RideOut)
async def confirm_price(ride_id: int, payload: ConfirmPriceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if r.status != RideStatus.bargaining:
        raise HTTPException(400, "Not in bargaining")
    if r.driver_id is not None:
        raise HTTPException(400, "Ride already confirmed")
    if user.role == UserRole.rider:
        ensure_user_billing_access(db, user)
        if r.rider_id != user.id:
            raise HTTPException(403, "Forbidden")
        if not payload.driver_id:
            raise HTTPException(400, "driver_id is required")
        of = db.scalar(select(RideOffer).where(RideOffer.ride_id == r.id, RideOffer.driver_id == payload.driver_id))
        if not of:
            raise HTTPException(404, "Driver offer not found")
        of.rider_confirmed_price = True
        of.updated_at = datetime.utcnow()
        chosen_driver_id = of.driver_id
    elif user.role == UserRole.driver:
        ensure_user_billing_access(db, user)
        ensure_user_has_approved_city(user, db)
        if not ride_city_matches_user(db, r, user):
            raise HTTPException(403, "Ride is not available in your approved city")
        of = db.scalar(select(RideOffer).where(RideOffer.ride_id == r.id, RideOffer.driver_id == user.id))
        if not of:
            raise HTTPException(404, "No offer found for this driver")
        of.driver_confirmed_price = True
        of.updated_at = datetime.utcnow()
        chosen_driver_id = of.driver_id
    else:
        raise HTTPException(403, "Forbidden")
    of2 = db.scalar(select(RideOffer).where(RideOffer.ride_id == r.id, RideOffer.driver_id == chosen_driver_id))
    if of2 and of2.rider_confirmed_price and of2.driver_confirmed_price:
        r.driver_id = of2.driver_id
        r.bargain_price = of2.latest_price
        r.rider_confirmed_price = True
        r.driver_confirmed_price = True
        r.status = RideStatus.confirmed
        of2.status = RideOfferStatus.accepted
        of2.updated_at = datetime.utcnow()
        others = db.scalars(select(RideOffer).where(RideOffer.ride_id == r.id, RideOffer.driver_id != of2.driver_id)).all()
        for o in others:
            o.status = RideOfferStatus.rejected
            o.updated_at = datetime.utcnow()
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    offers = db.scalars(select(RideOffer).where(RideOffer.ride_id == r.id)).all()
    for o in offers:
        await manager.send_to_user(o.driver_id, {"type":"ride_update","ride_id":r.id})
    if r.status == RideStatus.confirmed:
        await notify_driver_market_update(db, r.id)
    return ride_to_out(r, db)

@router.post("/{ride_id}/cancel", response_model=dict)
async def cancel_ride(ride_id: int, payload: CancelIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if user.role == UserRole.rider and r.rider_id != user.id:
        raise HTTPException(403, "Forbidden")
    if user.role == UserRole.driver and r.driver_id != user.id:
        raise HTTPException(403, "Forbidden")
    if r.status in (RideStatus.completed, RideStatus.cancelled):
        raise HTTPException(400, "Already finished")
    r.status = RideStatus.cancelled
    r.completed_at = datetime.utcnow()
    db.add(Cancellation(ride_id=r.id, by_user_id=user.id, reason=payload.reason))
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    if r.driver_id:
        await manager.send_to_user(r.driver_id, {"type":"ride_update","ride_id":r.id})
    return {"status":"cancelled"}


@router.post("/{ride_id}/leave", response_model=dict)
async def leave_joined_ride(ride_id: int, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if r.status in (RideStatus.completed, RideStatus.cancelled):
        raise HTTPException(400, "Ride already finished")
    jr = db.scalar(
        select(JoinRequest).where(
            JoinRequest.ride_id == ride_id,
            JoinRequest.joiner_id == user.id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    )
    if not jr:
        raise HTTPException(403, "You are not an accepted joined rider for this ride")
    jr.status = JoinRequestStatus.ignored
    db.commit()
    await manager.send_to_user(user.id, {"type":"ride_update","ride_id":r.id})
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    if r.driver_id:
        await manager.send_to_user(r.driver_id, {"type":"ride_update","ride_id":r.id})
    return {"status":"left"}

@router.post("/{ride_id}/message", response_model=MessageOut)
async def send_message(ride_id: int, payload: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if user.role == UserRole.rider and r.rider_id != user.id and not is_accepted_joiner(db, r.id, user.id):
        raise HTTPException(403, "Forbidden")
    if user.role == UserRole.driver and r.driver_id != user.id:
        raise HTTPException(403, "Forbidden")
    m = Message(ride_id=ride_id, sender_id=user.id, content=payload.content)
    db.add(m)
    db.commit()
    db.refresh(m)
    msg = {"type":"chat_message","ride_id":ride_id, "sender_id":user.id, "content":payload.content, "created_at":m.created_at.isoformat()}
    await manager.send_to_user(r.rider_id, msg)
    if r.driver_id:
        await manager.send_to_user(r.driver_id, msg)
    accepted_joiners = db.scalars(
        select(JoinRequest).where(
            JoinRequest.ride_id == r.id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    ).all()
    for jr in accepted_joiners:
        await manager.send_to_user(jr.joiner_id, msg)
    return MessageOut(id=m.id, sender_id=m.sender_id, content=m.content, created_at=m.created_at.isoformat())

@router.post("/{ride_id}/join", response_model=JoinRequestOut)
async def request_join(ride_id: int, payload: JoinRequestIn, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    ensure_user_billing_access(db, user)
    ensure_user_has_approved_city(user, db)
    from_text = (payload.from_text or "").strip()
    to_text = (payload.to_text or "").strip()
    if not from_text:
        raise HTTPException(400, "Join pickup location is required")
    if not to_text:
        raise HTTPException(400, "Join dropoff location is required")
    if payload.price < 8:
        raise HTTPException(400, "Joiner price must be minimum $8")
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if not ride_city_matches_user(db, r, user):
        raise HTTPException(403, "Ride is not available in your approved city")
    if r.status not in (RideStatus.confirmed, RideStatus.in_progress):
        raise HTTPException(400, "Only confirmed or in-progress rides can be joined")
    if r.rider_id == user.id:
        raise HTTPException(400, "You are the primary rider")
    if is_accepted_joiner(db, r.id, user.id):
        raise HTTPException(400, "You already joined this ride")
    primary_rider_credit, driver_bonus = compute_join_split(payload.price)
    jr = JoinRequest(
        ride_id=ride_id,
        joiner_id=user.id,
        from_text=from_text,
        to_text=to_text,
        price=payload.price,
        primary_rider_credit=primary_rider_credit,
        driver_bonus=driver_bonus,
        status=JoinRequestStatus.pending
    )
    db.add(jr)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Join request already exists")
    db.refresh(jr)

    # Pop-up only: push via websocket to driver and primary rider
    driver_event = {
        "type":"join_request",
        "join_request": {
            "id": jr.id, "ride_id": jr.ride_id, "joiner_id": jr.joiner_id,
            "from_text": jr.from_text, "to_text": jr.to_text, "price": jr.price,
            "primary_rider_credit": jr.primary_rider_credit, "driver_bonus": jr.driver_bonus,
            "created_at": jr.created_at.isoformat()
        }
    }
    rider_event = {
        "type":"join_request",
        "join_request": {
            "id": jr.id, "ride_id": jr.ride_id, "joiner_id": jr.joiner_id,
            "from_text": jr.from_text, "to_text": jr.to_text, "price": None,
            "primary_rider_credit": jr.primary_rider_credit, "driver_bonus": None,
            "created_at": jr.created_at.isoformat()
        }
    }
    if r.driver_id:
        await manager.send_to_user(r.driver_id, driver_event)
    await manager.send_to_user(r.rider_id, rider_event)
    return JoinRequestOut(
        id=jr.id, ride_id=jr.ride_id, joiner_id=jr.joiner_id,
        from_text=jr.from_text, to_text=jr.to_text, price=jr.price,
        primary_rider_credit=jr.primary_rider_credit, driver_bonus=jr.driver_bonus,
        status=jr.status.value, driver_decision=jr.driver_decision, rider_decision=jr.rider_decision,
        created_at=jr.created_at.isoformat(),
        joiner_name=user.name,
        joiner_phone=user.phone,
        joiner_rating=user_rating_avg(db, user.id),
    )
@router.get("/{ride_id}/join_requests_recent", response_model=list[JoinRequestOut])
def recent_join_requests(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ride = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not ride:
        raise HTTPException(404, "Ride not found")
    # Only primary rider or assigned driver can view recent join requests
    if user.role == UserRole.rider and ride.rider_id != user.id:
        raise HTTPException(403, "Forbidden")
    if user.role == UserRole.driver and ride.driver_id != user.id:
        raise HTTPException(403, "Forbidden")
    jrs = db.scalars(select(JoinRequest).where(JoinRequest.ride_id==ride_id).order_by(JoinRequest.id.desc()).limit(5)).all()
    out = [join_to_out(jr, db) for jr in jrs]
    if user.role == UserRole.rider:
        for row in out:
            row.price = 0.0
    return out


@router.get("/{ride_id}/my_join_request", response_model=JoinRequestOut | None)
def my_join_request(ride_id: int, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    ride = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not ride:
        raise HTTPException(404, "Ride not found")
    jr = db.scalar(
        select(JoinRequest).where(
            JoinRequest.ride_id == ride_id,
            JoinRequest.joiner_id == user.id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    )
    if not jr:
        return None
    return join_to_out(jr, db)


@router.get("/{ride_id}/messages", response_model=list[MessageOut])
def list_messages(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if user.role == UserRole.rider and r.rider_id != user.id and not is_accepted_joiner(db, r.id, user.id):
        raise HTTPException(403, "Forbidden")
    if user.role == UserRole.driver and r.driver_id != user.id:
        raise HTTPException(403, "Forbidden")
    msgs = db.scalars(select(Message).where(Message.ride_id==ride_id).order_by(Message.id.asc())).all()
    return [MessageOut(id=m.id, sender_id=m.sender_id, content=m.content, created_at=m.created_at.isoformat()) for m in msgs]

@router.post("/join_requests/{jr_id}/driver_decide", response_model=dict)
async def driver_decide_join(jr_id: int, accept: bool, user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    jr = db.scalar(select(JoinRequest).where(JoinRequest.id == jr_id))
    if not jr:
        raise HTTPException(404, "Join request not found")
    ride = jr.ride
    if ride.driver_id != user.id:
        raise HTTPException(403, "Forbidden")
    jr.driver_decision = accept
    if not accept:
        jr.status = JoinRequestStatus.rejected
    else:
        # if both accepted, finalize immediately; otherwise keep pending
        jr.status = JoinRequestStatus.accepted if jr.rider_decision is True else JoinRequestStatus.pending
    db.commit()
    await manager.send_to_user(ride.rider_id, {"type":"join_decision_update","join_request_id":jr.id})
    await manager.send_to_user(jr.joiner_id, {"type":"join_decision_update","join_request_id":jr.id})
    await manager.send_to_user(jr.joiner_id, {"type":"ride_update","ride_id":ride.id})
    if jr.status == JoinRequestStatus.accepted:
        await manager.send_to_user(ride.rider_id, {"type":"ride_update","ride_id":ride.id})
        if ride.driver_id:
            await manager.send_to_user(ride.driver_id, {"type":"ride_update","ride_id":ride.id})
    return {"status":"ok"}

@router.post("/join_requests/{jr_id}/rider_decide", response_model=dict)
async def rider_decide_join(jr_id: int, accept: bool, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    jr = db.scalar(select(JoinRequest).where(JoinRequest.id == jr_id))
    if not jr:
        raise HTTPException(404, "Join request not found")
    ride = jr.ride
    if ride.rider_id != user.id:
        raise HTTPException(403, "Forbidden")
    jr.rider_decision = accept
    if not accept:
        jr.status = JoinRequestStatus.rejected
    else:
        jr.status = JoinRequestStatus.pending
    # if both accepted -> accepted
    if jr.driver_decision is True and jr.rider_decision is True:
        jr.status = JoinRequestStatus.accepted
    db.commit()
    await manager.send_to_user(ride.driver_id or 0, {"type":"join_decision_update","join_request_id":jr.id})
    await manager.send_to_user(jr.joiner_id, {"type":"join_decision_update","join_request_id":jr.id})
    if jr.status == JoinRequestStatus.accepted:
        await manager.send_to_user(jr.joiner_id, {"type":"ride_update","ride_id":ride.id})
        await manager.send_to_user(ride.rider_id, {"type":"ride_update","ride_id":ride.id})
        if ride.driver_id:
            await manager.send_to_user(ride.driver_id, {"type":"ride_update","ride_id":ride.id})
    return {"status":"ok"}

@router.post("/{ride_id}/otp/generate", response_model=dict)
async def generate_otp(ride_id: int, user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r or r.driver_id != user.id:
        raise HTTPException(404, "Ride not found")
    # For demo: generate 4-digit OTP and send to rider (in real life rider shares OTP)
    r.otp_code = "".join(random.choice(string.digits) for _ in range(4))
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"otp_generated","ride_id":r.id, "otp": r.otp_code})
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    await manager.send_to_user(r.driver_id, {"type":"ride_update","ride_id":r.id})
    return {"otp": r.otp_code}

@router.post("/{ride_id}/otp/verify", response_model=dict)
async def verify_otp(ride_id: int, payload: OTPVerifyIn, user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r or r.driver_id != user.id:
        raise HTTPException(404, "Ride not found")
    if payload.otp != r.otp_code or not r.otp_code:
        raise HTTPException(400, "Invalid OTP")
    r.otp_verified = True
    r.status = RideStatus.in_progress
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    await manager.send_to_user(r.driver_id, {"type":"ride_update","ride_id":r.id})
    return {"status":"in_progress"}

@router.post("/{ride_id}/complete", response_model=dict)
async def complete_ride(ride_id: int, user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r or r.driver_id != user.id:
        raise HTTPException(404, "Ride not found")
    if r.status != RideStatus.in_progress:
        raise HTTPException(400, "Ride not in progress")
    r.status = RideStatus.completed
    r.completed_at = datetime.utcnow()
    db.commit()
    participant_ids = {r.rider_id}
    if r.driver_id:
        participant_ids.add(r.driver_id)
    accepted_joiners = db.scalars(
        select(JoinRequest).where(
            JoinRequest.ride_id == r.id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    ).all()
    for jr in accepted_joiners:
        participant_ids.add(jr.joiner_id)
    for uid in participant_ids:
        await manager.send_to_user(uid, {"type":"ride_completed","ride_id":r.id})
    return {"status":"completed"}

@router.post("/{ride_id}/rate", response_model=dict)
def rate_user(ride_id: int, payload: RatingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    # both rider & driver can rate after completion
    if r.status != RideStatus.completed:
        raise HTTPException(400, "Ride not completed")
    accepted_joiners = db.scalars(
        select(JoinRequest).where(
            JoinRequest.ride_id == r.id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    ).all()
    participant_ids = {r.rider_id}
    if r.driver_id:
        participant_ids.add(r.driver_id)
    for jr in accepted_joiners:
        participant_ids.add(jr.joiner_id)
    if user.id not in participant_ids:
        raise HTTPException(403, "Forbidden")
    if payload.to_user_id == user.id or payload.to_user_id not in participant_ids:
        raise HTTPException(400, "Invalid rating target")
    existing = db.scalar(
        select(Rating).where(
            Rating.ride_id == ride_id,
            Rating.from_user_id == user.id,
            Rating.to_user_id == payload.to_user_id,
        )
    )
    if existing:
        raise HTTPException(400, "You already rated this user for this ride")
    rating = Rating(ride_id=ride_id, from_user_id=user.id, to_user_id=payload.to_user_id, stars=payload.stars, comment=payload.comment)
    db.add(rating)
    db.commit()
    return {"status":"submitted"}


@router.get("/{ride_id}/rate_targets", response_model=list[dict])
def rate_targets(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if r.status != RideStatus.completed:
        raise HTTPException(400, "Ride not completed")
    accepted_joiners = db.scalars(
        select(JoinRequest).where(
            JoinRequest.ride_id == r.id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    ).all()
    participant_ids = {r.rider_id}
    if r.driver_id:
        participant_ids.add(r.driver_id)
    for jr in accepted_joiners:
        participant_ids.add(jr.joiner_id)
    if user.id not in participant_ids:
        raise HTTPException(403, "Forbidden")
    out = []
    for pid in participant_ids:
        if pid == user.id:
            continue
        u = db.scalar(select(User).where(User.id == pid))
        if not u:
            continue
        already = db.scalar(
            select(Rating).where(
                Rating.ride_id == ride_id,
                Rating.from_user_id == user.id,
                Rating.to_user_id == pid,
            )
        )
        out.append({
            "user_id": pid,
            "name": u.name,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role),
            "already_rated": already is not None,
        })
    return out
