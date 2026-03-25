from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.settings import settings
from app.models import (
    BillingLineItem,
    BillingMonth,
    BillingSettings,
    City,
    DriverCitySelection,
    JoinRequest,
    JoinRequestStatus,
    Notification,
    PlatformFee,
    Ride,
    RidePaymentDeclaration,
    RideStatus,
    User,
    UserBillingAccess,
    UserRole,
)
from app.schemas import BillItemOut, BillOut, BillingAccessOut, RidePaymentDeclarationOut

DEFAULT_BILLING_ANCHOR_DATE = "2024-01-01"
DEFAULT_CITY_PROVINCE = "Ontario"
DEFAULT_CITY_TAX_NAME = "HST"
DEFAULT_CITY_TAX_RATE = 13.0
BILLING_NOTIFICATION_KINDS = ("billing_due", "billing_locked")


@dataclass(frozen=True)
class BillingWindow:
    key: str
    start_date: date
    end_date: date

    @property
    def label(self) -> str:
        return f"{self.start_date.strftime('%b %d')} - {self.end_date.strftime('%b %d, %Y')}"

    @property
    def start_at(self) -> datetime:
        return datetime.combine(self.start_date, time.min)

    @property
    def end_at(self) -> datetime:
        return datetime.combine(self.end_date, time.max)


def money(value: float | int | None) -> float:
    return round(float(value or 0.0) + 1e-9, 2)


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def get_platform_fee_row(db: Session) -> PlatformFee:
    row = db.scalar(select(PlatformFee).order_by(PlatformFee.id.asc()))
    if row:
        return row
    row = PlatformFee(fee_per_ride=0.50)
    db.add(row)
    db.flush()
    return row


def get_billing_settings(db: Session) -> BillingSettings:
    row = db.scalar(select(BillingSettings).order_by(BillingSettings.id.asc()))
    if row:
        return row
    row = BillingSettings(
        global_free_mode=False,
        cycle_length_days=14,
        grace_period_days=7,
        billing_anchor_date=DEFAULT_BILLING_ANCHOR_DATE,
    )
    db.add(row)
    db.flush()
    return row


def get_user_billing_access(db: Session, user_id: int, *, create: bool = False) -> UserBillingAccess | None:
    row = db.scalar(select(UserBillingAccess).where(UserBillingAccess.user_id == user_id))
    if row or not create:
        return row
    row = UserBillingAccess(user_id=user_id, is_free_access=False, reason="")
    db.add(row)
    db.flush()
    return row


def parse_anchor_date(raw_value: str | None) -> date:
    try:
        return date.fromisoformat(raw_value or DEFAULT_BILLING_ANCHOR_DATE)
    except Exception:
        return date.fromisoformat(DEFAULT_BILLING_ANCHOR_DATE)


def current_billing_window(now: datetime | None = None, *, config: BillingSettings | None = None) -> BillingWindow:
    now = now or datetime.utcnow()
    config = config or BillingSettings(
        cycle_length_days=14,
        grace_period_days=7,
        billing_anchor_date=DEFAULT_BILLING_ANCHOR_DATE,
    )
    anchor = parse_anchor_date(config.billing_anchor_date)
    cycle_days = max(14, int(config.cycle_length_days or 14))
    today = now.date()
    cycle_index = (today - anchor).days // cycle_days
    start_date = anchor + timedelta(days=cycle_index * cycle_days)
    end_date = start_date + timedelta(days=cycle_days - 1)
    return BillingWindow(key=start_date.isoformat(), start_date=start_date, end_date=end_date)


def billing_window_for_datetime(dt: datetime, config: BillingSettings) -> BillingWindow:
    anchor = parse_anchor_date(config.billing_anchor_date)
    cycle_days = max(14, int(config.cycle_length_days or 14))
    day = dt.date()
    cycle_index = (day - anchor).days // cycle_days
    start_date = anchor + timedelta(days=cycle_index * cycle_days)
    end_date = start_date + timedelta(days=cycle_days - 1)
    return BillingWindow(key=start_date.isoformat(), start_date=start_date, end_date=end_date)


def ride_completed_at(ride: Ride) -> datetime:
    return ride.completed_at or ride.created_at


def ride_base_amount(ride: Ride) -> float:
    return money(ride.bargain_price if ride.bargain_price is not None else ride.posted_price)


def accepted_join_requests(db: Session, ride_id: int) -> list[JoinRequest]:
    return db.scalars(
        select(JoinRequest).where(
            JoinRequest.ride_id == ride_id,
            JoinRequest.status == JoinRequestStatus.accepted,
        )
    ).all()


def primary_rider_amount(ride: Ride, joins: list[JoinRequest]) -> float:
    credit_total = money(sum(float(j.primary_rider_credit or 0.0) for j in joins))
    return money(max(0.0, ride_base_amount(ride) - credit_total))


def get_approved_city_for_user(db: Session, user_id: int) -> City | None:
    selection = db.scalar(select(DriverCitySelection).where(DriverCitySelection.user_id == user_id))
    if not selection or not selection.approved_city_id:
        return None
    return db.scalar(select(City).where(City.id == selection.approved_city_id))


def resolve_city_tax_snapshot(bill: BillingMonth, city: City | None) -> tuple[str, str, str, float]:
    city_name = bill.city_name or (city.name if city else "")
    province_name = bill.province_name or (city.province_name if city else DEFAULT_CITY_PROVINCE)
    tax_name = bill.tax_name or (city.tax_name if city else DEFAULT_CITY_TAX_NAME)
    tax_rate = bill.tax_rate if bill.tax_rate else float(city.tax_rate if city else DEFAULT_CITY_TAX_RATE)
    return city_name, province_name, tax_name, float(tax_rate or 0.0)


def get_free_state(db: Session, user_id: int) -> tuple[bool, bool, str]:
    config = get_billing_settings(db)
    if config.global_free_mode:
        return True, False, "Global launch free mode"
    access = get_user_billing_access(db, user_id)
    if access and access.is_free_access:
        return True, True, access.reason or "Admin granted personal free access"
    return False, False, ""


def bill_status(bill: BillingMonth, now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    if bill.is_paid:
        return "paid"
    if bill.waived_at:
        return "waived"
    if not bill.period_end:
        return "accruing"
    if now <= bill.period_end:
        return "accruing"
    if bill.total_due <= 0:
        return "cleared"
    if bill.grace_expires_at and now <= bill.grace_expires_at:
        return "due"
    return "locked"


def bill_payable_now(bill: BillingMonth, now: datetime | None = None) -> bool:
    return bill_status(bill, now) in {"due", "locked"} and money(bill.total_due) > 0


def serialize_bill(bill: BillingMonth, now: datetime | None = None) -> BillOut:
    label = bill.month
    if bill.period_start and bill.period_end:
        label = BillingWindow(
            key=bill.month,
            start_date=bill.period_start.date(),
            end_date=bill.period_end.date(),
        ).label
    return BillOut(
        id=bill.id,
        month=label,
        period_key=bill.month,
        label=label,
        period_start=iso(bill.period_start),
        period_end=iso(bill.period_end),
        subtotal=money(bill.subtotal),
        tax_rate=float(bill.tax_rate or 0.0),
        tax_name=bill.tax_name or "",
        tax_amount=money(bill.tax_amount),
        total_due=money(bill.total_due),
        is_paid=bool(bill.is_paid),
        is_waived=bool(bill.waived_at),
        status=bill_status(bill, now),
        payable_now=bill_payable_now(bill, now),
        due_at=iso(bill.due_at),
        grace_expires_at=iso(bill.grace_expires_at),
        paid_at=iso(bill.paid_at),
        waived_at=iso(bill.waived_at),
        waiver_reason=bill.waiver_reason or "",
        currency=(bill.currency or settings.BILLING_CURRENCY or "cad").lower(),
        city_name=bill.city_name or "",
        province_name=bill.province_name or "",
        items=[
            BillItemOut(
                ride_id=item.ride_id,
                description=item.description,
                amount=money(item.amount),
            )
            for item in bill.items
        ],
    )


def user_billing_participations(db: Session, user_id: int) -> list[dict[str, Any]]:
    fee_amount = money(get_platform_fee_row(db).fee_per_ride)
    participations: list[dict[str, Any]] = []
    completed_rides = db.scalars(select(Ride).where(Ride.status == RideStatus.completed)).all()
    joined_ride_ids = {
        int(ride_id)
        for ride_id in db.scalars(
            select(JoinRequest.ride_id).where(
                JoinRequest.joiner_id == user_id,
                JoinRequest.status == JoinRequestStatus.accepted,
            )
        ).all()
    }
    for ride in completed_rides:
        if ride.rider_id == user_id:
            participations.append(
                {
                    "ride_id": ride.id,
                    "completed_at": ride_completed_at(ride),
                    "description": f"Platform fee (Primary rider) for ride #{ride.id}",
                    "amount": fee_amount,
                }
            )
        elif ride.id in joined_ride_ids:
            participations.append(
                {
                    "ride_id": ride.id,
                    "completed_at": ride_completed_at(ride),
                    "description": f"Platform fee (Joined rider) for ride #{ride.id}",
                    "amount": fee_amount,
                }
            )
        if ride.driver_id == user_id:
            participations.append(
                {
                    "ride_id": ride.id,
                    "completed_at": ride_completed_at(ride),
                    "description": f"Platform fee (Driver) for ride #{ride.id}",
                    "amount": fee_amount,
                }
            )
    return participations


def sync_user_bills(db: Session, user_id: int) -> list[BillingMonth]:
    now = datetime.utcnow()
    config = get_billing_settings(db)
    participations = user_billing_participations(db, user_id)
    current_window = current_billing_window(now, config=config)

    windows: dict[str, BillingWindow] = {current_window.key: current_window}
    grouped: dict[str, list[dict[str, Any]]] = {current_window.key: []}
    for row in participations:
        window = billing_window_for_datetime(row["completed_at"], config)
        windows[window.key] = window
        grouped.setdefault(window.key, []).append(row)

    city = get_approved_city_for_user(db, user_id)
    is_free, personal_free, free_reason = get_free_state(db, user_id)
    existing = {
        bill.month: bill
        for bill in db.scalars(select(BillingMonth).where(BillingMonth.user_id == user_id)).all()
    }

    for key, window in windows.items():
        bill = existing.get(key)
        if not bill:
            bill = BillingMonth(
                user_id=user_id,
                month=key,
                currency=(settings.BILLING_CURRENCY or "cad").lower(),
            )
            db.add(bill)
            db.flush()
            existing[key] = bill

        bill.period_start = window.start_at
        bill.period_end = window.end_at
        bill.due_at = window.end_at
        bill.grace_expires_at = window.end_at + timedelta(days=max(1, int(config.grace_period_days or 7)))

        city_name, province_name, tax_name, tax_rate = resolve_city_tax_snapshot(bill, city)
        bill.city_name = city_name
        bill.province_name = province_name
        bill.tax_name = tax_name
        bill.tax_rate = float(tax_rate)
        bill.currency = (bill.currency or settings.BILLING_CURRENCY or "cad").lower()

        for item in list(bill.items):
            db.delete(item)
        db.flush()

        subtotal = 0.0
        for row in grouped.get(key, []):
            amount = money(row["amount"])
            subtotal += amount
            bill.items.append(
                BillingLineItem(
                    bill_id=bill.id,
                    ride_id=row["ride_id"],
                    description=row["description"],
                    amount=amount,
                )
            )

        bill.subtotal = money(subtotal)
        bill.tax_amount = money(bill.subtotal * (float(bill.tax_rate or 0.0) / 100.0))

        if bill.is_paid and not bill.paid_at:
            bill.paid_at = now

        if is_free and not bill.is_paid:
            if not bill.waived_at:
                bill.waived_at = now
            reason_prefix = "Admin granted personal free access" if personal_free else "Global launch free mode"
            bill.waiver_reason = free_reason or reason_prefix
            bill.total_due = 0.0
        elif bill.waived_at and not bill.is_paid:
            bill.total_due = 0.0
        else:
            bill.total_due = money(bill.subtotal + bill.tax_amount)

    for bill in list(existing.values()):
        if bill.month == current_window.key:
            continue
        if money(bill.subtotal) > 0 or bill.is_paid or bill.waived_at:
            continue
        if bill.period_end and bill.period_end < now:
            db.delete(bill)

    db.commit()
    return db.scalars(
        select(BillingMonth).where(BillingMonth.user_id == user_id).order_by(BillingMonth.period_start.desc(), BillingMonth.id.desc())
    ).all()


def latest_due_bill(bills: list[BillingMonth], now: datetime | None = None) -> BillingMonth | None:
    now = now or datetime.utcnow()
    due_bills = [bill for bill in bills if bill_status(bill, now) in {"due", "locked"} and money(bill.total_due) > 0]
    if not due_bills:
        return None
    due_bills.sort(key=lambda bill: bill.period_end or datetime.min)
    return due_bills[0]


def build_access_state(db: Session, user_id: int) -> BillingAccessOut:
    bills = sync_user_bills(db, user_id)
    config = get_billing_settings(db)
    _, personal_free, _ = get_free_state(db, user_id)
    due_bill = latest_due_bill(bills)
    stripe_ready = bool(settings.STRIPE_SECRET_KEY)
    if not due_bill:
        return BillingAccessOut(
            status="current",
            message="Your billing is in good standing.",
            global_free_mode=config.global_free_mode,
            personal_free_access=personal_free,
            stripe_ready=stripe_ready,
        )

    current_status = bill_status(due_bill)
    days_left = None
    if due_bill.grace_expires_at:
        days_left = max(0, (due_bill.grace_expires_at.date() - datetime.utcnow().date()).days)

    if current_status == "locked":
        return BillingAccessOut(
            status="locked",
            message="Your billing is overdue. Pay your outstanding bill to continue using the app.",
            has_outstanding_bill=True,
            has_locked_bill=True,
            days_left=0,
            global_free_mode=config.global_free_mode,
            personal_free_access=personal_free,
            stripe_ready=stripe_ready,
        )

    return BillingAccessOut(
        status="warning",
        message=f"Pay your bill within {days_left or 0} day(s) or app access will be paused.",
        has_outstanding_bill=True,
        has_locked_bill=False,
        days_left=days_left,
        global_free_mode=config.global_free_mode,
        personal_free_access=personal_free,
        stripe_ready=stripe_ready,
    )


def ensure_user_billing_access(db: Session, user: User):
    if user.role == UserRole.admin:
        return
    access = build_access_state(db, user.id)
    if access.has_locked_bill:
        raise HTTPException(403, access.message)


def ensure_user_can_change_city(db: Session, user: User):
    if user.role == UserRole.admin:
        return
    bills = sync_user_bills(db, user.id)
    blocking = [bill for bill in bills if bill_status(bill) in {"due", "locked"} and money(bill.total_due) > 0]
    if blocking:
        raise HTTPException(403, "Please pay all closed bi-weekly bills before changing your city.")


def upsert_billing_notification(db: Session, user_id: int, kind: str, title: str, body: str):
    existing = db.scalar(
        select(Notification)
        .where(Notification.user_id == user_id, Notification.kind == kind)
        .order_by(Notification.created_at.desc())
    )
    if existing:
        existing.title = title
        existing.body = body
        existing.action_path = "/billing"
        existing.is_read = False
        return
    db.add(
        Notification(
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            action_path="/billing",
            is_read=False,
        )
    )


def clear_billing_notifications(db: Session, user_id: int):
    rows = db.scalars(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.kind.in_(BILLING_NOTIFICATION_KINDS),
        )
    ).all()
    for row in rows:
        row.is_read = True


def sync_billing_notifications(db: Session, user_id: int):
    access = build_access_state(db, user_id)
    clear_billing_notifications(db, user_id)
    if access.has_locked_bill:
        upsert_billing_notification(
            db,
            user_id,
            "billing_locked",
            "Billing overdue",
            "Pay your outstanding bill now. App access is paused until your bill is paid.",
        )
    elif access.has_outstanding_bill:
        upsert_billing_notification(
            db,
            user_id,
            "billing_due",
            "Bi-weekly bill due",
            f"Pay your bill within {access.days_left or 0} day(s) or you will no longer be able to use the app.",
        )
    db.commit()


def mark_bill_paid(
    db: Session,
    bill: BillingMonth,
    *,
    provider: str,
    reference: str,
    payment_intent_id: str = "",
):
    bill.is_paid = True
    bill.paid_at = datetime.utcnow()
    bill.payment_provider = provider
    bill.payment_reference = reference
    if payment_intent_id:
        bill.stripe_payment_intent_id = payment_intent_id
    db.commit()
    db.refresh(bill)


def stripe_ready() -> bool:
    return bool(settings.STRIPE_SECRET_KEY)


def load_stripe():
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe is not configured yet. Add your Stripe secret key in the backend .env file.")
    try:
        import stripe  # type: ignore
    except ImportError as exc:
        raise HTTPException(503, "Stripe SDK is not installed in the backend environment.") from exc
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def create_checkout_session_for_bill(db: Session, bill: BillingMonth, user: User) -> str:
    sync_user_bills(db, user.id)
    db.refresh(bill)
    status = bill_status(bill)
    if bill.user_id != user.id:
        raise HTTPException(404, "Bill not found")
    if bill.is_paid:
        raise HTTPException(400, "This bill is already paid.")
    if bill.waived_at or money(bill.total_due) <= 0:
        raise HTTPException(400, "This bill does not need payment.")
    if status == "accruing":
        raise HTTPException(400, "This bi-weekly bill can be paid after the billing period closes.")

    stripe = load_stripe()
    label = serialize_bill(bill).label or bill.month
    line_items: list[dict[str, Any]] = []
    if money(bill.subtotal) > 0:
        line_items.append(
            {
                "price_data": {
                    "currency": (bill.currency or settings.BILLING_CURRENCY or "cad").lower(),
                    "product_data": {
                        "name": "Community Ride platform fees",
                        "description": f"Bi-weekly platform fees for {label}",
                    },
                    "unit_amount": int(round(money(bill.subtotal) * 100)),
                },
                "quantity": 1,
            }
        )
    if money(bill.tax_amount) > 0:
        line_items.append(
            {
                "price_data": {
                    "currency": (bill.currency or settings.BILLING_CURRENCY or "cad").lower(),
                    "product_data": {
                        "name": bill.tax_name or "Sales tax",
                        "description": f"{money(bill.tax_rate)}% tax for {bill.city_name or 'selected city'}",
                    },
                    "unit_amount": int(round(money(bill.tax_amount) * 100)),
                },
                "quantity": 1,
            }
        )

    success_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}/payment-confirmation"
        f"?session_id={{CHECKOUT_SESSION_ID}}&bill_id={bill.id}"
    )
    cancel_url = f"{settings.FRONTEND_URL.rstrip('/')}/billing"
    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=line_items,
        success_url=success_url,
        cancel_url=cancel_url,
        customer_email=user.email,
        client_reference_id=str(bill.id),
        metadata={
            "bill_id": str(bill.id),
            "user_id": str(user.id),
            "period_key": bill.month,
        },
    )

    bill.payment_provider = "stripe"
    bill.payment_reference = session.id
    bill.stripe_session_id = session.id
    db.commit()
    return str(session.url)


def _mark_paid_from_checkout_session(db: Session, bill: BillingMonth, session: Any, session_id: str) -> BillingMonth:
    metadata = getattr(session, "metadata", {}) or {}
    bill_id = metadata.get("bill_id")
    if bill_id and str(bill_id) != str(bill.id):
        raise HTTPException(400, "Stripe session does not belong to this bill.")
    if getattr(session, "payment_status", "") != "paid":
        raise HTTPException(400, "Stripe payment is not marked as paid yet.")
    if bill.is_paid:
        return bill
    payment_intent = getattr(session, "payment_intent", None)
    payment_intent_id = getattr(payment_intent, "id", "") if payment_intent is not None else ""
    mark_bill_paid(
        db,
        bill,
        provider="stripe",
        reference=str(getattr(session, "id", session_id)),
        payment_intent_id=str(payment_intent_id or ""),
    )
    return bill


def confirm_checkout_session(db: Session, session_id: str) -> BillingMonth:
    stripe = load_stripe()
    session = stripe.checkout.Session.retrieve(session_id, expand=["payment_intent"])
    metadata = getattr(session, "metadata", {}) or {}
    bill_id = metadata.get("bill_id")
    if not bill_id:
        raise HTTPException(400, "Stripe session is missing bill metadata.")
    bill = db.scalar(select(BillingMonth).where(BillingMonth.id == int(bill_id)))
    if not bill:
        raise HTTPException(404, "Bill not found")
    return _mark_paid_from_checkout_session(db, bill, session, session_id)


def verify_bill_payment(db: Session, bill: BillingMonth) -> BillingMonth:
    if bill.is_paid:
        return bill
    session_id = (bill.stripe_session_id or bill.payment_reference or "").strip()
    if not session_id:
        raise HTTPException(400, "No Stripe checkout session was found for this bill yet. Start the payment first.")
    stripe = load_stripe()
    session = stripe.checkout.Session.retrieve(session_id, expand=["payment_intent"])
    return _mark_paid_from_checkout_session(db, bill, session, session_id)


def handle_stripe_webhook(db: Session, payload: bytes, signature: str | None) -> str:
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(503, "Stripe webhook secret is not configured.")
    stripe = load_stripe()
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=signature or "",
            secret=settings.STRIPE_WEBHOOK_SECRET,
        )
    except Exception as exc:
        raise HTTPException(400, "Invalid Stripe webhook signature.") from exc

    event_type = str(event.get("type", ""))
    if event_type not in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
        return event_type

    session = event.get("data", {}).get("object", {})
    metadata = session.get("metadata", {}) or {}
    bill_id = metadata.get("bill_id")
    if not bill_id:
        return event_type

    bill = db.scalar(select(BillingMonth).where(BillingMonth.id == int(bill_id)))
    if not bill:
        return event_type
    if session.get("payment_status") != "paid":
        return event_type

    mark_bill_paid(
        db,
        bill,
        provider="stripe",
        reference=str(session.get("id", "")),
        payment_intent_id=str(session.get("payment_intent", "")),
    )
    return event_type


def payment_method_label(value: str) -> str:
    labels = {
        "cash": "Cash",
        "interac": "Interac",
        "etransfer": "E-Transfer",
        "card": "Card",
        "other": "Other",
    }
    return labels.get((value or "").lower(), value or "")


def expected_payment_rows_for_ride(db: Session, ride: Ride) -> list[dict[str, Any]]:
    if ride.status != RideStatus.completed or not ride.driver_id:
        return []

    joins = accepted_join_requests(db, ride.id)
    driver = db.scalar(select(User).where(User.id == ride.driver_id))
    primary_user = db.scalar(select(User).where(User.id == ride.rider_id))
    route_target = ""
    if ride.stops:
        route_target = sorted(ride.stops, key=lambda stop: stop.order_index)[0].dropoff_text
    primary_route = f"{ride.pickup_text} to {route_target or 'Destination'}"
    rows: list[dict[str, Any]] = [
        {
            "ride_id": ride.id,
            "payer_user_id": ride.rider_id,
            "payer_name": primary_user.name if primary_user else "Rider",
            "payee_user_id": ride.driver_id,
            "payee_name": driver.name if driver else "Driver",
            "amount": primary_rider_amount(ride, joins),
            "route_label": primary_route,
            "completed_at": ride_completed_at(ride),
        }
    ]
    for join in joins:
        joiner = db.scalar(select(User).where(User.id == join.joiner_id))
        rows.append(
            {
                "ride_id": ride.id,
                "payer_user_id": join.joiner_id,
                "payer_name": joiner.name if joiner else "Joined rider",
                "payee_user_id": ride.driver_id,
                "payee_name": driver.name if driver else "Driver",
                "amount": money(join.price),
                "route_label": f"{join.from_text} to {join.to_text}",
                "completed_at": ride_completed_at(ride),
            }
        )
    return rows


def serialize_declaration_row(row: dict[str, Any], declaration: RidePaymentDeclaration | None, *, can_declare: bool) -> RidePaymentDeclarationOut:
    method = declaration.payment_method if declaration else ""
    return RidePaymentDeclarationOut(
        ride_id=int(row["ride_id"]),
        payer_user_id=int(row["payer_user_id"]),
        payer_name=row.get("payer_name", ""),
        payee_user_id=int(row["payee_user_id"]),
        payee_name=row.get("payee_name", ""),
        amount=money(row.get("amount", 0.0)),
        payment_method=payment_method_label(method),
        note=declaration.note if declaration else "",
        declared_at=iso(declaration.declared_at) if declaration else None,
        completed_at=iso(row.get("completed_at")),
        route_label=row.get("route_label", ""),
        can_declare=can_declare,
        status="declared" if declaration and declaration.declared_at else "pending",
    )


def list_payment_declarations_for_user(db: Session, user: User) -> list[RidePaymentDeclarationOut]:
    completed_rides = db.scalars(select(Ride).where(Ride.status == RideStatus.completed).order_by(Ride.completed_at.desc(), Ride.id.desc())).all()
    declarations = {
        (row.ride_id, row.payer_user_id): row
        for row in db.scalars(select(RidePaymentDeclaration)).all()
    }
    out: list[RidePaymentDeclarationOut] = []
    for ride in completed_rides:
        rows = expected_payment_rows_for_ride(db, ride)
        if user.role == UserRole.driver and ride.driver_id != user.id:
            continue
        for row in rows:
            if user.role != UserRole.driver and int(row["payer_user_id"]) != user.id:
                continue
            declaration = declarations.get((int(row["ride_id"]), int(row["payer_user_id"])))
            out.append(
                serialize_declaration_row(
                    row,
                    declaration,
                    can_declare=user.role != UserRole.driver,
                )
            )
    out.sort(
        key=lambda row: (
            row.completed_at or "",
            row.ride_id,
            row.payer_user_id,
        ),
        reverse=True,
    )
    return out


def declare_payment_for_ride(
    db: Session,
    user: User,
    ride_id: int,
    *,
    payment_method: str,
    note: str = "",
) -> RidePaymentDeclarationOut:
    ride = db.scalar(select(Ride).where(Ride.id == ride_id))
    if not ride:
        raise HTTPException(404, "Ride not found")
    if ride.status != RideStatus.completed or not ride.driver_id:
        raise HTTPException(400, "Payment can only be declared after a ride is completed.")

    expected = [row for row in expected_payment_rows_for_ride(db, ride) if int(row["payer_user_id"]) == user.id]
    if not expected:
        raise HTTPException(403, "You are not a payer on this completed ride.")
    row = expected[0]

    declaration = db.scalar(
        select(RidePaymentDeclaration).where(
            RidePaymentDeclaration.ride_id == ride_id,
            RidePaymentDeclaration.payer_user_id == user.id,
        )
    )
    now = datetime.utcnow()
    if not declaration:
        declaration = RidePaymentDeclaration(
            ride_id=ride_id,
            payer_user_id=user.id,
            payee_user_id=int(row["payee_user_id"]),
            declared_by_user_id=user.id,
        )
        db.add(declaration)

    declaration.payee_user_id = int(row["payee_user_id"])
    declaration.declared_by_user_id = user.id
    declaration.amount = money(row["amount"])
    declaration.payment_method = payment_method.lower().strip()
    declaration.note = (note or "").strip()
    declaration.declared_at = now
    declaration.updated_at = now
    db.commit()
    db.refresh(declaration)
    return serialize_declaration_row(row, declaration, can_declare=True)
