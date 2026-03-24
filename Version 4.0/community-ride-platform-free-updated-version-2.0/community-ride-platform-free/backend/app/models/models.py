from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, Enum, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
import enum
from app.db.session import Base

class UserRole(str, enum.Enum):
    rider = "rider"
    driver = "driver"
    admin = "admin"

class AccountStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"

class DriverApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class SupportReportTargetType(str, enum.Enum):
    ride = "ride"
    user = "user"
    system = "system"


class SupportReportStatus(str, enum.Enum):
    open = "open"
    in_review = "in_review"
    resolved = "resolved"
    dismissed = "dismissed"

class RideStatus(str, enum.Enum):
    requested = "requested"
    bargaining = "bargaining"
    confirmed = "confirmed"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    is_student: Mapped[bool] = mapped_column(Boolean, default=False)
    age: Mapped[int] = mapped_column(Integer, default=18)

    status: Mapped[AccountStatus] = mapped_column(Enum(AccountStatus), default=AccountStatus.active)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verification_token_hash: Mapped[str] = mapped_column(String(255), default="")
    email_verification_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    password_reset_token_hash: Mapped[str] = mapped_column(String(255), default="")
    password_reset_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    driver_profile: Mapped["DriverProfile"] = relationship(back_populates="user", uselist=False)
    ratings_received: Mapped[list["Rating"]] = relationship(back_populates="to_user", foreign_keys="Rating.to_user_id")
    ratings_given: Mapped[list["Rating"]] = relationship(back_populates="from_user", foreign_keys="Rating.from_user_id")

class DriverProfile(Base):
    __tablename__ = "driver_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    approval_status: Mapped[DriverApprovalStatus] = mapped_column(Enum(DriverApprovalStatus), default=DriverApprovalStatus.pending)
    license_path: Mapped[str] = mapped_column(String(512), default="")
    id_path: Mapped[str] = mapped_column(String(512), default="")
    insurance_path: Mapped[str] = mapped_column(String(512), default="")
    license_expiry_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    license_expiry_status: Mapped[str] = mapped_column(String(40), default="unknown")  # unknown | valid | expiring_soon | expired
    license_expiry_source: Mapped[str] = mapped_column(String(40), default="manual")  # manual | extracted
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_note: Mapped[str] = mapped_column(String(255), default="")

    user: Mapped[User] = relationship(back_populates="driver_profile")

class Ride(Base):
    __tablename__ = "rides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rider_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    pickup_text: Mapped[str] = mapped_column(String(255))
    time_iso: Mapped[str] = mapped_column(String(40))
    posted_price: Mapped[float] = mapped_column(Float, default=0.0)

    status: Mapped[RideStatus] = mapped_column(Enum(RideStatus), default=RideStatus.requested, index=True)

    bargain_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    rider_confirmed_price: Mapped[bool] = mapped_column(Boolean, default=False)
    driver_confirmed_price: Mapped[bool] = mapped_column(Boolean, default=False)

    otp_code: Mapped[str] = mapped_column(String(10), default="")
    otp_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    stops: Mapped[list["RideStop"]] = relationship(back_populates="ride", cascade="all, delete-orphan")
    messages: Mapped[list["Message"]] = relationship(back_populates="ride", cascade="all, delete-orphan")
    cancellations: Mapped[list["Cancellation"]] = relationship(back_populates="ride", cascade="all, delete-orphan")
    join_requests: Mapped[list["JoinRequest"]] = relationship(back_populates="ride", cascade="all, delete-orphan")
    offers: Mapped[list["RideOffer"]] = relationship(back_populates="ride", cascade="all, delete-orphan")

class RideStop(Base):
    __tablename__ = "ride_stops"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id"), index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    dropoff_text: Mapped[str] = mapped_column(String(255))
    ride: Mapped[Ride] = relationship(back_populates="stops")

class JoinRequestStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    ignored = "ignored"

class JoinRequest(Base):
    __tablename__ = "join_requests"
    __table_args__ = (
        UniqueConstraint("ride_id", "joiner_id", name="uq_joinreq_ride_joiner"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id"), index=True)
    joiner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    from_text: Mapped[str] = mapped_column(String(255), default="")
    to_text: Mapped[str] = mapped_column(String(255), default="")
    price: Mapped[float] = mapped_column(Float, default=8.0)
    primary_rider_credit: Mapped[float] = mapped_column(Float, default=0.0)
    driver_bonus: Mapped[float] = mapped_column(Float, default=0.0)

    status: Mapped[JoinRequestStatus] = mapped_column(Enum(JoinRequestStatus), default=JoinRequestStatus.pending)

    driver_decision: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    rider_decision: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ride: Mapped[Ride] = relationship(back_populates="join_requests")


class RideOfferStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class RideOffer(Base):
    __tablename__ = "ride_offers"
    __table_args__ = (
        UniqueConstraint("ride_id", "driver_id", name="uq_offer_ride_driver"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id"), index=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    latest_price: Mapped[float] = mapped_column(Float, default=0.0)
    rider_confirmed_price: Mapped[bool] = mapped_column(Boolean, default=False)
    driver_confirmed_price: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[RideOfferStatus] = mapped_column(Enum(RideOfferStatus), default=RideOfferStatus.pending, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ride: Mapped[Ride] = relationship(back_populates="offers")

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ride: Mapped[Ride] = relationship(back_populates="messages")

class Rating(Base):
    __tablename__ = "ratings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id"), index=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    stars: Mapped[int] = mapped_column(Integer, default=5)
    comment: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    from_user: Mapped["User"] = relationship(foreign_keys=[from_user_id], back_populates="ratings_given")
    to_user: Mapped["User"] = relationship(foreign_keys=[to_user_id], back_populates="ratings_received")

class Cancellation(Base):
    __tablename__ = "cancellations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id"), index=True)
    by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reason: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ride: Mapped[Ride] = relationship(back_populates="cancellations")

class PlatformFee(Base):
    __tablename__ = "platform_fee"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fee_per_ride: Mapped[float] = mapped_column(Float, default=0.50)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class BillingMonth(Base):
    __tablename__ = "billing_months"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    month: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    total_due: Mapped[float] = mapped_column(Float, default=0.0)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    items: Mapped[list["BillingLineItem"]] = relationship(back_populates="bill", cascade="all, delete-orphan")

class BillingLineItem(Base):
    __tablename__ = "billing_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("billing_months.id"), index=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id"), index=True)
    description: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Float, default=0.0)

    bill: Mapped[BillingMonth] = relationship(back_populates="items")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    default_address: Mapped[str] = mapped_column(String(255), default="")
    avatar_path: Mapped[str] = mapped_column(String(512), default="")

    # Optional driver doc reupload tracking
    docs_status: Mapped[str] = mapped_column(String(40), default="up_to_date")  # up_to_date | pending_review
    docs_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class DriverVehicle(Base):
    __tablename__ = "driver_vehicles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    vehicle_details: Mapped[str] = mapped_column(String(255), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class City(Base):
    __tablename__ = "cities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DriverCitySelection(Base):
    __tablename__ = "driver_city_selections"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    approved_city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"), nullable=True)
    pending_city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"), nullable=True)
    approval_status: Mapped[str] = mapped_column(String(40), default="none")  # none | pending | approved | rejected
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    approved_city: Mapped["City"] = relationship(foreign_keys=[approved_city_id])
    pending_city: Mapped["City"] = relationship(foreign_keys=[pending_city_id])


class RiderDefaultRoute(Base):
    __tablename__ = "rider_default_routes"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    pickup_text: Mapped[str] = mapped_column(String(255), default="")
    dropoff_text: Mapped[str] = mapped_column(String(255), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(String(500))
    action_path: Mapped[str] = mapped_column(String(255), default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SupportReport(Base):
    __tablename__ = "support_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reporter_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    target_type: Mapped[SupportReportTargetType] = mapped_column(Enum(SupportReportTargetType), index=True)
    status: Mapped[SupportReportStatus] = mapped_column(Enum(SupportReportStatus), default=SupportReportStatus.open, index=True)
    category: Mapped[str] = mapped_column(String(80), default="general")
    subject: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    ride_id: Mapped[int | None] = mapped_column(ForeignKey("rides.id"), nullable=True, index=True)
    reported_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    attachment_path: Mapped[str] = mapped_column(String(512), default="")
    admin_note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
