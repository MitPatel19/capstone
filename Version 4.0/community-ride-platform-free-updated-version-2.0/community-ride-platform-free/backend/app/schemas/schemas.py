from pydantic import BaseModel, Field
from typing import List, Optional, Literal

Role = Literal["rider","driver","admin"]

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    role: Role
    name: str
    email: str
    phone: str = ""
    status: str
    age: int
    is_student: bool
    rating_avg: float = 0.0
    billing_free_access: bool = False
    billing_access_status: str = "current"

class SignupRiderIn(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    phone: str = ""
    age: int = 18
    is_student: bool = False
    city_id: int

class SignupDriverIn(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    phone: str = ""
    age: int
    is_student: bool
    city_id: int

class LoginIn(BaseModel):
    email: str
    password: str
    role: Role

class ForgotPasswordIn(BaseModel):
    email: str

class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6)

class ResendVerificationIn(BaseModel):
    email: str

class RideStopIn(BaseModel):
    dropoff_text: str
    order_index: int

class RideCreateIn(BaseModel):
    pickup_text: str
    time_iso: str
    posted_price: float
    stops: List[RideStopIn] = []

class RideOut(BaseModel):
    id: int
    rider_id: int
    driver_id: Optional[int]
    pickup_text: str
    time_iso: str
    posted_price: float
    status: str
    bargain_price: Optional[float]
    rider_confirmed_price: bool
    driver_confirmed_price: bool
    otp_verified: bool
    otp_code: str = ""
    rider_name: str = ""
    rider_phone: str = ""
    rider_rating: float = 0.0
    driver_name: str = ""
    driver_phone: str = ""
    driver_rating: float = 0.0
    driver_vehicle: str = ""
    first_dropoff_text: str = ""
    accepted_joiner_count: int = 0
    total_joiner_price: float = 0.0
    primary_rider_discount_total: float = 0.0
    primary_rider_net_price: float = 0.0
    driver_join_bonus_total: float = 0.0
    driver_total_earnings: float = 0.0
    stops: List[RideStopIn] = []

class BargainIn(BaseModel):
    new_price: float
    driver_id: Optional[int] = None

class ConfirmPriceIn(BaseModel):
    driver_id: Optional[int] = None

class CancelIn(BaseModel):
    reason: str

class MessageIn(BaseModel):
    content: str

class MessageOut(BaseModel):
    id: int
    sender_id: int
    content: str
    created_at: str

class JoinRequestIn(BaseModel):
    from_text: str
    to_text: str
    price: float

class JoinRequestOut(BaseModel):
    id: int
    ride_id: int
    joiner_id: int
    from_text: str
    to_text: str
    price: float
    primary_rider_credit: float = 0.0
    driver_bonus: float = 0.0
    status: str
    driver_decision: Optional[bool]
    rider_decision: Optional[bool]
    created_at: str
    joiner_name: str = ""
    joiner_phone: str = ""
    joiner_rating: float = 0.0

class DriverOfferOut(BaseModel):
    id: int
    ride_id: int
    driver_id: int
    driver_name: str = ""
    driver_phone: str = ""
    driver_rating: float = 0.0
    driver_vehicle: str = ""
    latest_price: float
    rider_confirmed_price: bool
    driver_confirmed_price: bool
    status: str
    created_at: str
    updated_at: str

class RoutePointOut(BaseModel):
    sequence: int
    user_id: int
    user_name: str
    role: str
    point_type: str  # pickup | dropoff
    location_text: str

class OTPVerifyIn(BaseModel):
    otp: str

class RatingIn(BaseModel):
    to_user_id: int
    stars: int = Field(ge=1, le=5)
    comment: str = ""

class PlatformFeeOut(BaseModel):
    fee_per_ride: float

class PlatformFeeIn(BaseModel):
    fee_per_ride: float = Field(gt=0)

class BillItemOut(BaseModel):
    ride_id: int
    description: str
    amount: float

class BillOut(BaseModel):
    id: int
    month: str
    period_key: str = ""
    label: str = ""
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    subtotal: float = 0.0
    tax_rate: float = 0.0
    tax_name: str = ""
    tax_amount: float = 0.0
    total_due: float
    is_paid: bool
    is_waived: bool = False
    status: str = "accruing"
    payable_now: bool = False
    due_at: Optional[str] = None
    grace_expires_at: Optional[str] = None
    paid_at: Optional[str] = None
    waived_at: Optional[str] = None
    waiver_reason: str = ""
    currency: str = "cad"
    city_name: str = ""
    province_name: str = ""
    items: List[BillItemOut] = []

class PayBillOut(BaseModel):
    status: str
    bill_id: Optional[int] = None
    checkout_url: Optional[str] = None


class BillingSummaryOut(BaseModel):
    period_key: str
    label: str
    fee_per_ride: float
    completed_as_rider: int
    completed_as_driver: int
    subtotal: float
    tax_rate: float
    tax_name: str
    tax_amount: float
    total_due: float
    status: str
    city_name: str = ""
    province_name: str = ""
    currency: str = "cad"
    is_free: bool = False
    free_reason: str = ""


class BillingAccessOut(BaseModel):
    status: str
    message: str = ""
    has_outstanding_bill: bool = False
    has_locked_bill: bool = False
    days_left: Optional[int] = None
    global_free_mode: bool = False
    personal_free_access: bool = False
    stripe_ready: bool = False


class RidePaymentDeclarationIn(BaseModel):
    payment_method: Literal["cash", "interac", "etransfer", "card", "other"]
    note: str = ""


class RidePaymentDeclarationOut(BaseModel):
    ride_id: int
    payer_user_id: int
    payer_name: str = ""
    payee_user_id: int
    payee_name: str = ""
    amount: float
    payment_method: str = ""
    note: str = ""
    declared_at: Optional[str] = None
    completed_at: Optional[str] = None
    route_label: str = ""
    can_declare: bool = False
    status: str = "pending"


class ProfileOut(BaseModel):
    id: int
    role: Role
    name: str
    email: str
    phone: str = ""
    age: int
    is_student: bool
    status: str
    default_address: str = ""
    avatar_url: str = ""
    member_since: str = ""  # Month YYYY
    rating_avg: float = 0.0
    rating_count: int = 0
    vehicle_details: str = ""

class ProfileUpdateIn(BaseModel):
    name: str
    phone: str = ""
    default_address: str = ""
    vehicle_details: str = ""

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)

class MetricsOut(BaseModel):
    # Rider
    active_rides: int = 0
    total_rides: int = 0
    rating_avg: float = 0.0
    # Driver
    accepted_rides: int = 0
    todays_earnings: float = 0.0
    total_driver_rides: int = 0

class RiderStatsOut(BaseModel):
    total_rides: int
    rides_this_month: int
    favorite_route: str

class DriverDocsOut(BaseModel):
    approval_status: str
    reviewed_at: Optional[str] = None
    review_note: str = ""
    docs_status: str = "up_to_date"
    docs_updated_at: Optional[str] = None
    license_expiry_date: Optional[str] = None
    license_expiry_status: str = "unknown"
    license_expiry_source: str = "manual"


class CityOut(BaseModel):
    id: int
    name: str
    is_active: bool = True
    province_name: str = "Ontario"
    tax_name: str = "HST"
    tax_rate: float = 13.0


class CityIn(BaseModel):
    name: str
    province_name: str = "Ontario"
    tax_name: str = "HST"
    tax_rate: float = Field(default=13.0, ge=0)


class CityTaxUpdateIn(BaseModel):
    province_name: str = "Ontario"
    tax_name: str = "HST"
    tax_rate: float = Field(default=13.0, ge=0)


class DriverCityOut(BaseModel):
    approved_city_id: Optional[int] = None
    approved_city_name: str = ""
    pending_city_id: Optional[int] = None
    pending_city_name: str = ""
    approval_status: str = "none"
    reviewed_at: Optional[str] = None


class DriverCitySelectIn(BaseModel):
    city_id: int


class RiderDefaultRouteOut(BaseModel):
    pickup_text: str = ""
    dropoff_text: str = ""
    updated_at: Optional[str] = None


class RiderDefaultRouteIn(BaseModel):
    pickup_text: str = ""
    dropoff_text: str = ""


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: str
    action_path: str = ""
    is_read: bool
    created_at: str


class AuthActionOut(BaseModel):
    status: str
    message: str
    email_sent: bool = False
    debug_url: Optional[str] = None


class AdminBillingSettingsIn(BaseModel):
    fee_per_ride: float = Field(gt=0)
    global_free_mode: bool = False
    cycle_length_days: int = Field(default=14, ge=14, le=14)
    grace_period_days: int = Field(default=7, ge=1, le=30)
    billing_anchor_date: str = "2024-01-01"


class AdminBillingSettingsOut(BaseModel):
    fee_per_ride: float
    global_free_mode: bool
    cycle_length_days: int
    grace_period_days: int
    billing_anchor_date: str
    stripe_ready: bool = False
    currency: str = "cad"


class UserBillingAccessOut(BaseModel):
    user_id: int
    is_free_access: bool = False
    reason: str = ""
    updated_at: Optional[str] = None


class UserBillingAccessIn(BaseModel):
    is_free_access: bool
    reason: str = ""


class AdminBillOverviewOut(BaseModel):
    bill_id: int
    user_id: int
    user_name: str
    user_email: str
    role: str
    period_label: str
    status: str
    subtotal: float
    tax_amount: float
    total_due: float
    is_paid: bool
    is_waived: bool = False
    city_name: str = ""
    payment_provider: str = ""
    payment_reference: str = ""
    due_at: Optional[str] = None
    grace_expires_at: Optional[str] = None
    paid_at: Optional[str] = None


class SupportReportOut(BaseModel):
    id: int
    target_type: str
    status: str
    category: str
    subject: str
    description: str
    reporter_user_id: int
    reporter_name: str = ""
    reported_user_id: Optional[int] = None
    reported_name: str = ""
    ride_id: Optional[int] = None
    attachment_url: str = ""
    admin_note: str = ""
    created_at: str
    updated_at: str
    resolved_at: Optional[str] = None


class SupportReportUpdateIn(BaseModel):
    status: str
    admin_note: str = ""
