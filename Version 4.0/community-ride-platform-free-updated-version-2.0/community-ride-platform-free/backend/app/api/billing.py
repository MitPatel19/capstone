from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from datetime import datetime

from app.db.session import get_db
from app.core.auth import get_current_user, require_role
from app.models import User, UserRole, Ride, RideStatus, JoinRequest, JoinRequestStatus, PlatformFee, BillingMonth, BillingLineItem
from app.schemas import BillOut, BillItemOut, PayBillOut
from app.services.utils import month_str

router = APIRouter(prefix="/billing", tags=["billing"])

@router.get("/summary", response_model=dict)
def my_month_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = month_str()
    fee = db.scalar(select(PlatformFee).order_by(PlatformFee.id.asc()))
    fee_amt = fee.fee_per_ride if fee else 0.5
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
    for r in rides:
        if r.created_at.strftime("%Y-%m") != m:
            continue
        if r.rider_id == user.id or r.id in joined_ride_ids:
            rider_count += 1
        if r.driver_id == user.id:
            driver_count += 1
    total_fee = round((rider_count + driver_count) * fee_amt, 2)
    return {
        "month": m,
        "fee_per_ride": fee_amt,
        "completed_as_rider": rider_count,
        "completed_as_driver": driver_count,
        "total_due": total_fee
    }


def ensure_bill_for_user(db: Session, user_id: int, month: str) -> BillingMonth:
    bill = db.scalar(select(BillingMonth).where(and_(BillingMonth.user_id==user_id, BillingMonth.month==month)))
    if bill:
        return bill
    bill = BillingMonth(user_id=user_id, month=month, total_due=0.0, is_paid=False)
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill

def compute_and_attach_items(db: Session, bill: BillingMonth):
    # Recompute items each time (keeps bills up-to-date as rides complete)
    if bill.items:
        for it in list(bill.items):
            db.delete(it)
        db.commit()
        db.refresh(bill)
    fee = db.scalar(select(PlatformFee).order_by(PlatformFee.id.asc()))
    fee_amt = fee.fee_per_ride if fee else 0.5
    joined_ride_ids = set(
        db.scalars(
            select(JoinRequest.ride_id).where(
                JoinRequest.joiner_id == bill.user_id,
                JoinRequest.status == JoinRequestStatus.accepted,
            )
        ).all()
    )

    # Completed rides for that month where user was rider or driver
    start_month = bill.month + "-01"
    rides = db.scalars(select(Ride).where(Ride.status == RideStatus.completed)).all()

    total = 0.0
    for r in rides:
        # naive month check based on created_at (demo). In production use completed_at.
        if r.created_at.strftime("%Y-%m") != bill.month:
            continue
        if r.rider_id == bill.user_id:
            amt = fee_amt
            bill.items.append(BillingLineItem(ride_id=r.id, description=f"Platform fee (Rider) for ride #{r.id}", amount=amt))
            total += amt
        elif r.id in joined_ride_ids:
            amt = fee_amt
            bill.items.append(BillingLineItem(ride_id=r.id, description=f"Platform fee (Joined Rider) for ride #{r.id}", amount=amt))
            total += amt
        if r.driver_id == bill.user_id:
            amt = fee_amt
            bill.items.append(BillingLineItem(ride_id=r.id, description=f"Platform fee (Driver) for ride #{r.id}", amount=amt))
            total += amt

    bill.total_due = round(total, 2)
    db.commit()

@router.get("/me", response_model=BillOut)
def my_current_bill(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = month_str()
    bill = ensure_bill_for_user(db, user.id, m)
    compute_and_attach_items(db, bill)
    db.refresh(bill)
    return BillOut(
        id=bill.id, month=bill.month, total_due=bill.total_due, is_paid=bill.is_paid,
        items=[BillItemOut(ride_id=i.ride_id, description=i.description, amount=i.amount) for i in bill.items]
    )

@router.get("/history", response_model=list[BillOut])
def my_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bills = db.scalars(select(BillingMonth).where(BillingMonth.user_id==user.id).order_by(BillingMonth.month.desc())).all()
    out=[]
    for b in bills:
        compute_and_attach_items(db, b)
        db.refresh(b)
        out.append(BillOut(id=b.id, month=b.month, total_due=b.total_due, is_paid=b.is_paid,
                           items=[BillItemOut(ride_id=i.ride_id, description=i.description, amount=i.amount) for i in b.items]))
    return out

@router.post("/{bill_id}/pay", response_model=PayBillOut)
def pay_bill(bill_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = db.scalar(select(BillingMonth).where(BillingMonth.id==bill_id))
    if not b or b.user_id != user.id:
        raise HTTPException(404, "Bill not found")
    b.is_paid = True
    db.commit()
    return PayBillOut(status="paid (placeholder)")

@router.post("/admin/generate")
def generate_month(month: str, user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    # Ensure bill exists for every active user and compute items
    users = db.scalars(select(User)).all()
    for u in users:
        b = ensure_bill_for_user(db, u.id, month)
        compute_and_attach_items(db, b)
    return {"status":"generated", "month": month}
