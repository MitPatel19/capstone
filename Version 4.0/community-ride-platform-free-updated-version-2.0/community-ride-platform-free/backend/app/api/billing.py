from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.rides import ride_to_out
from app.core.auth import get_current_user, require_role
from app.db.session import get_db
from app.models import BillingMonth, JoinRequest, JoinRequestStatus, Ride, RideStatus, User, UserRole
from app.schemas import (
    BillingAccessOut,
    BillingSummaryOut,
    BillOut,
    PayBillOut,
    RideOut,
    RidePaymentDeclarationIn,
    RidePaymentDeclarationOut,
)
from app.services.billing import (
    bill_status,
    build_access_state,
    confirm_checkout_session,
    create_checkout_session_for_bill,
    current_billing_window,
    declare_payment_for_ride,
    get_billing_settings,
    get_free_state,
    get_platform_fee_row,
    handle_stripe_webhook,
    list_payment_declarations_for_user,
    serialize_bill,
    sync_billing_notifications,
    sync_user_bills,
    verify_bill_payment,
)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/rides", response_model=list[RideOut])
def billing_rides(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sync_user_bills(db, user.id)
    rides = db.scalars(select(Ride).where(Ride.status == RideStatus.completed).order_by(Ride.completed_at.desc(), Ride.id.desc())).all()
    joined_ride_ids = set(
        db.scalars(
            select(JoinRequest.ride_id).where(
                JoinRequest.joiner_id == user.id,
                JoinRequest.status == JoinRequestStatus.accepted,
            )
        ).all()
    )

    if user.role == UserRole.driver:
        relevant = [ride for ride in rides if ride.driver_id == user.id]
    elif user.role == UserRole.rider:
        relevant = [ride for ride in rides if ride.rider_id == user.id or ride.id in joined_ride_ids]
    else:
        relevant = rides
    return [ride_to_out(ride, db) for ride in relevant]


@router.get("/me", response_model=BillOut)
def my_current_bill(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bills = sync_user_bills(db, user.id)
    current_key = current_billing_window(datetime.utcnow(), config=get_billing_settings(db)).key
    bill = next((row for row in bills if row.month == current_key), None)
    if not bill:
        raise HTTPException(404, "Current bill not found")
    sync_billing_notifications(db, user.id)
    return serialize_bill(bill)


@router.get("/history", response_model=list[BillOut])
def my_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bills = sync_user_bills(db, user.id)
    sync_billing_notifications(db, user.id)
    return [serialize_bill(bill) for bill in bills]


@router.get("/summary", response_model=BillingSummaryOut)
def current_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bills = sync_user_bills(db, user.id)
    config = get_billing_settings(db)
    fee = get_platform_fee_row(db).fee_per_ride
    current_window = current_billing_window(datetime.utcnow(), config=config)
    bill = next((row for row in bills if row.month == current_window.key), None)
    if not bill:
        raise HTTPException(404, "Current bill not found")

    rides = db.scalars(select(Ride).where(Ride.status == RideStatus.completed)).all()
    joined_ride_ids = set(
        db.scalars(
            select(JoinRequest.ride_id).where(
                JoinRequest.joiner_id == user.id,
                JoinRequest.status == JoinRequestStatus.accepted,
            )
        ).all()
    )
    rider_count = 0
    driver_count = 0
    for ride in rides:
        ride_window = current_billing_window(ride.completed_at or ride.created_at, config=config)
        if ride_window.key != current_window.key:
            continue
        if ride.rider_id == user.id or ride.id in joined_ride_ids:
            rider_count += 1
        if ride.driver_id == user.id:
            driver_count += 1

    _, _, free_reason = get_free_state(db, user.id)
    return BillingSummaryOut(
        period_key=current_window.key,
        label=current_window.label,
        fee_per_ride=fee,
        completed_as_rider=rider_count,
        completed_as_driver=driver_count,
        subtotal=float(bill.subtotal or 0.0),
        tax_rate=float(bill.tax_rate or 0.0),
        tax_name=bill.tax_name or "",
        tax_amount=float(bill.tax_amount or 0.0),
        total_due=float(bill.total_due or 0.0),
        status=bill_status(bill),
        city_name=bill.city_name or "",
        province_name=bill.province_name or "",
        currency=bill.currency or "cad",
        is_free=bool(bill.waived_at),
        free_reason=bill.waiver_reason or free_reason,
    )


@router.get("/access", response_model=BillingAccessOut)
def access_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sync_billing_notifications(db, user.id)
    return build_access_state(db, user.id)


@router.get("/declarations", response_model=list[RidePaymentDeclarationOut])
def payment_declarations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_payment_declarations_for_user(db, user)


@router.post("/declarations/{ride_id}", response_model=RidePaymentDeclarationOut)
def declare_payment(
    ride_id: int,
    payload: RidePaymentDeclarationIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return declare_payment_for_ride(
        db,
        user,
        ride_id,
        payment_method=payload.payment_method,
        note=payload.note,
    )


@router.post("/{bill_id}/pay", response_model=PayBillOut)
def pay_bill(bill_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bill = db.scalar(select(BillingMonth).where(BillingMonth.id == bill_id))
    if not bill or bill.user_id != user.id:
        raise HTTPException(404, "Bill not found")
    checkout_url = create_checkout_session_for_bill(db, bill, user)
    return PayBillOut(status="checkout_created", bill_id=bill.id, checkout_url=checkout_url)


@router.get("/checkout/confirm", response_model=BillOut)
def confirm_checkout(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bill = confirm_checkout_session(db, session_id)
    if bill.user_id != user.id and user.role != UserRole.admin:
        raise HTTPException(403, "Forbidden")
    sync_billing_notifications(db, bill.user_id)
    return serialize_bill(bill)


@router.post("/{bill_id}/verify-payment", response_model=BillOut)
def verify_payment(
    bill_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bill = db.scalar(select(BillingMonth).where(BillingMonth.id == bill_id))
    if not bill or bill.user_id != user.id:
        raise HTTPException(404, "Bill not found")
    bill = verify_bill_payment(db, bill)
    sync_billing_notifications(db, bill.user_id)
    return serialize_bill(bill)


@router.post("/stripe/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    payload = await request.body()
    event_type = handle_stripe_webhook(db, payload, stripe_signature)
    return {"status": "ok", "event_type": event_type}


@router.post("/admin/generate")
def generate_bills(user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    members = db.scalars(select(User).where(User.role != UserRole.admin)).all()
    for member in members:
        sync_user_bills(db, member.id)
        sync_billing_notifications(db, member.id)
    return {"status": "generated"}
