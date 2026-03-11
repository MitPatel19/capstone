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

class SignupRiderIn(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    phone: str = ""
    age: int = 18
    is_student: bool = False

class SignupDriverIn(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    phone: str = ""
    age: int
    is_student: bool

class LoginIn(BaseModel):
    email: str
    password: str
    role: Role

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
    stops: List[RideStopIn] = []

class BargainIn(BaseModel):
    new_price: float

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
    status: str
    driver_decision: Optional[bool]
    rider_decision: Optional[bool]
    created_at: str

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
    total_due: float
    is_paid: bool
    items: List[BillItemOut] = []

class PayBillOut(BaseModel):
    status: str


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

class ProfileUpdateIn(BaseModel):
    name: str
    phone: str = ""
    default_address: str = ""

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

