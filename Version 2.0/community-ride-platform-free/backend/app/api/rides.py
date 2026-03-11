from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from datetime import datetime
import random, string

from app.db.session import get_db
from app.core.auth import get_current_user, require_role
from app.models import User, UserRole, Ride, RideStop, RideStatus, Message, JoinRequest, JoinRequestStatus, Cancellation
from app.schemas import RideCreateIn, RideOut, MessageIn, MessageOut, BargainIn, CancelIn, JoinRequestIn, JoinRequestOut, OTPVerifyIn
from app.ws.manager import manager

router = APIRouter(prefix="/rides", tags=["rides"])

def ride_to_out(r: Ride) -> RideOut:
    return RideOut(
        id=r.id, rider_id=r.rider_id, driver_id=r.driver_id,
        pickup_text=r.pickup_text, time_iso=r.time_iso, posted_price=r.posted_price,
        status=r.status.value, bargain_price=r.bargain_price,
        rider_confirmed_price=r.rider_confirmed_price, driver_confirmed_price=r.driver_confirmed_price,
        otp_verified=r.otp_verified,
        stops=[{"dropoff_text": s.dropoff_text, "order_index": s.order_index} for s in sorted(r.stops, key=lambda x: x.order_index)]
    )

@router.get("/me", response_model=list[RideOut])
def my_rides(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == UserRole.rider:
        rides = db.scalars(select(Ride).where(Ride.rider_id == user.id).order_by(Ride.id.desc())).all()
    elif user.role == UserRole.driver:
        rides = db.scalars(select(Ride).where(Ride.driver_id == user.id).order_by(Ride.id.desc())).all()
    else:
        rides = db.scalars(select(Ride).order_by(Ride.id.desc()).limit(100)).all()
    return [ride_to_out(r) for r in rides]


@router.get("/active", response_model=list[RideOut])
def active_rides_for_riders(user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    rides = db.scalars(
        select(Ride)
        .where(and_(Ride.status.notin_([RideStatus.completed, RideStatus.cancelled]), Ride.rider_id != user.id))
        .order_by(Ride.id.desc())
        .limit(100)
    ).all()
    return [ride_to_out(r) for r in rides]


@router.get("/available", response_model=list[RideOut])
def available_rides(user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    rides = db.scalars(select(Ride).where(Ride.status.in_([RideStatus.requested, RideStatus.bargaining]))).all()
    # show only rides without driver or assigned to current driver
    out = []
    for r in rides:
        if r.driver_id is None or r.driver_id == user.id:
            out.append(ride_to_out(r))
    return out

@router.post("", response_model=RideOut)
def create_ride(payload: RideCreateIn, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
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
    return ride_to_out(r)

@router.get("/{ride_id}", response_model=RideOut)
def get_ride(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    # basic access check
    if user.role == UserRole.rider and r.rider_id != user.id:
        raise HTTPException(403, "Forbidden")
    if user.role == UserRole.driver and r.driver_id not in (None, user.id) and r.status != RideStatus.requested:
        raise HTTPException(403, "Forbidden")
    return ride_to_out(r)

@router.post("/{ride_id}/driver/accept", response_model=RideOut)
async def driver_accept(ride_id: int, user: User = Depends(require_role(UserRole.driver)), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if r.status not in (RideStatus.requested, RideStatus.bargaining):
        raise HTTPException(400, "Ride not available")
    r.driver_id = user.id
    r.status = RideStatus.bargaining
    r.bargain_price = r.posted_price if r.bargain_price is None else r.bargain_price
    r.driver_confirmed_price = True
    r.rider_confirmed_price = False
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    return ride_to_out(r)

@router.post("/{ride_id}/bargain", response_model=RideOut)
async def bargain(ride_id: int, payload: BargainIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if r.status not in (RideStatus.bargaining, RideStatus.requested):
        raise HTTPException(400, "Cannot bargain now")
    if user.role == UserRole.driver:
        if r.driver_id not in (None, user.id):
            raise HTTPException(403, "Forbidden")
        r.driver_id = user.id
        r.status = RideStatus.bargaining
        r.bargain_price = payload.new_price
        r.driver_confirmed_price = True
        r.rider_confirmed_price = False
    elif user.role == UserRole.rider:
        if r.rider_id != user.id:
            raise HTTPException(403, "Forbidden")
        if r.bargain_price is None:
            raise HTTPException(400, "No bargain price set yet")
        # rider proposes a counter
        r.bargain_price = payload.new_price
        r.rider_confirmed_price = True
        r.driver_confirmed_price = False
        r.status = RideStatus.bargaining
    else:
        raise HTTPException(403, "Forbidden")
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    if r.driver_id:
        await manager.send_to_user(r.driver_id, {"type":"ride_update","ride_id":r.id})
    return ride_to_out(r)

@router.post("/{ride_id}/confirm_price", response_model=RideOut)
async def confirm_price(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if r.status != RideStatus.bargaining:
        raise HTTPException(400, "Not in bargaining")
    if user.role == UserRole.rider:
        if r.rider_id != user.id:
            raise HTTPException(403, "Forbidden")
        r.rider_confirmed_price = True
    elif user.role == UserRole.driver:
        if r.driver_id != user.id:
            raise HTTPException(403, "Forbidden")
        r.driver_confirmed_price = True
    else:
        raise HTTPException(403, "Forbidden")
    if r.rider_confirmed_price and r.driver_confirmed_price:
        r.status = RideStatus.confirmed
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    if r.driver_id:
        await manager.send_to_user(r.driver_id, {"type":"ride_update","ride_id":r.id})
    return ride_to_out(r)

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
    db.add(Cancellation(ride_id=r.id, by_user_id=user.id, reason=payload.reason))
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_update","ride_id":r.id})
    if r.driver_id:
        await manager.send_to_user(r.driver_id, {"type":"ride_update","ride_id":r.id})
    return {"status":"cancelled"}

@router.post("/{ride_id}/message", response_model=MessageOut)
async def send_message(ride_id: int, payload: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if user.role == UserRole.rider and r.rider_id != user.id:
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
    return MessageOut(id=m.id, sender_id=m.sender_id, content=m.content, created_at=m.created_at.isoformat())

@router.post("/{ride_id}/join", response_model=JoinRequestOut)
async def request_join(ride_id: int, payload: JoinRequestIn, user: User = Depends(require_role(UserRole.rider)), db: Session = Depends(get_db)):
    if payload.price < 8:
        raise HTTPException(400, "Joiner price must be minimum $8")
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if r.rider_id == user.id:
        raise HTTPException(400, "You are the primary rider")
    jr = JoinRequest(
        ride_id=ride_id,
        joiner_id=user.id,
        from_text=payload.from_text,
        to_text=payload.to_text,
        price=payload.price,
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
    event = {
        "type":"join_request",
        "join_request": {
            "id": jr.id, "ride_id": jr.ride_id, "joiner_id": jr.joiner_id,
            "from_text": jr.from_text, "to_text": jr.to_text, "price": jr.price,
            "created_at": jr.created_at.isoformat()
        }
    }
    if r.driver_id:
        await manager.send_to_user(r.driver_id, event)
    await manager.send_to_user(r.rider_id, event)
    return JoinRequestOut(
        id=jr.id, ride_id=jr.ride_id, joiner_id=jr.joiner_id,
        from_text=jr.from_text, to_text=jr.to_text, price=jr.price,
        status=jr.status.value, driver_decision=jr.driver_decision, rider_decision=jr.rider_decision,
        created_at=jr.created_at.isoformat()
    )

from app.models import Rating
from app.schemas import RatingIn


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
    return [join_to_out(jr) for jr in jrs]


@router.get("/{ride_id}/messages", response_model=list[MessageOut])
def list_messages(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    if user.role == UserRole.rider and r.rider_id != user.id:
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
        # wait for rider decision too
        jr.status = JoinRequestStatus.pending
    db.commit()
    await manager.send_to_user(ride.rider_id, {"type":"join_decision_update","join_request_id":jr.id})
    await manager.send_to_user(jr.joiner_id, {"type":"join_decision_update","join_request_id":jr.id})
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
    db.commit()
    await manager.send_to_user(r.rider_id, {"type":"ride_completed","ride_id":r.id})
    await manager.send_to_user(r.driver_id, {"type":"ride_completed","ride_id":r.id})
    return {"status":"completed"}

@router.post("/{ride_id}/rate", response_model=dict)
def rate_user(ride_id: int, payload: RatingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not r:
        raise HTTPException(404, "Ride not found")
    # both rider & driver can rate after completion
    if r.status != RideStatus.completed:
        raise HTTPException(400, "Ride not completed")
    if user.id not in [r.rider_id, r.driver_id]:
        raise HTTPException(403, "Forbidden")
    # only allow rating counterpart or joiner? keep simple
    rating = Rating(ride_id=ride_id, from_user_id=user.id, to_user_id=payload.to_user_id, stars=payload.stars, comment=payload.comment)
    db.add(rating)
    db.commit()
    return {"status":"submitted"}
