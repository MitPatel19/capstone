# Mock Presentation Script

## Timing
- Mock session: Tuesday, April 14, 2026 at 12:30 PM
- Final presentation: Wednesday, April 15, 2026 at 8:00 AM
- Target length: 5 to 8 minutes for the mock, around 8 minutes if allowed in the final

## Opening
Good afternoon. Our project is the **Community Ride Coordination Platform**, a full-stack web platform designed to make local ride coordination safer, more organized, and more scalable for communities like Thunder Bay.

Most ride coordination in student or community settings still happens through informal group chats. That sounds simple, but in practice it creates problems with trust, pickup verification, pricing confusion, and poor coordination when multiple riders are involved.

## Slide Flow

### Slide 1
This project is not just a booking page. It is a role-based system with separate experiences for riders, drivers, and admins. It includes real-time updates, safety flows, and operational controls.

### Slide 2
Thunder Bay is a strong use case for this idea. Confederation College already describes its Thunder Bay campus as a transportation hub and gives full-time students U-Pass access to the city bus network. Lakehead also promotes public transit and carpooling. So the need for transportation alternatives already exists, but the coordination layer is still weak.

### Slide 3
We grounded the project in realistic local stories:
- an international student getting back from evening classes
- a placement student needing a reliable early-morning ride
- a driver already commuting with empty seats who wants a safer way to share a trip

These are the kinds of users this platform is meant to serve.

### Slide 4
The platform works across all three roles:
- Riders create requests, negotiate, join rides, and track status
- Drivers upload documents, wait for approval, then manage available and accepted rides
- Admins handle approvals, reports, billing, and city tax settings

### Slide 5
The strongest differentiators are:
- verified driver onboarding
- structured bargaining
- join-ride logic
- OTP pickup verification
- real-time notifications
- admin governance and billing

These features make the system feel much more trustworthy than a chat-based arrangement.

### Slide 6
From the rider perspective, the full journey is covered:
- create the ride
- negotiate a price
- allow shared riders
- verify pickup through OTP
- settle payment and feedback after the trip

That gives the project a complete product story, not just isolated screens.

### Slide 7
In terms of competition, our platform is positioned differently from big ride-hailing apps.

Uber and Lyft are excellent for polished on-demand transportation, but they are not built around local community coordination, admin approvals, or shared student workflows.

Informal chat groups are flexible, but they do not provide structure, verification, or governance.

Intercity carpool tools are closer in spirit, but they usually focus on larger planned trips rather than local shared mobility with admin control.

Our value is that we are purpose-built for trusted local coordination.

### Slide 8
One major strength of this project is that it already has a practical business and growth layer.

Right now, the project works using free services like OpenStreetMap. With investment, we could improve it significantly by adding:
- Google Maps or Mapbox for stronger routing and ETA accuracy
- Twilio for reliable OTP and SMS alerts
- full Stripe automation
- OCR and identity verification
- native mobile apps and live trip tracking

So this is not just a demo. It has a realistic path toward becoming a stronger market product.

### Slide 9
Technically, the platform uses:
- React, TypeScript, Vite, and Tailwind on the frontend
- FastAPI, SQLAlchemy, and Pydantic on the backend
- WebSocket updates for ride events and notifications
- SQLite for demo use, with PostgreSQL-ready deployment

That means the architecture is modular, modern, and expandable.

### Slide 10 / Closing
To conclude, this project starts with a real local problem and solves it with structure, trust, and strong product logic.

It is relevant to Thunder Bay, useful for student and community mobility, and strong enough technically to grow into something larger with funding and partnerships.

## Likely Questions

### Why not just use Uber or Lyft?
Because the problem we are solving is not only transportation. It is trusted local coordination, shared rides, admin oversight, and community-specific structure.

### What makes this different from a group chat?
Verification, OTP pickup, bargaining workflow, shared ride logic, admin approvals, reporting, and billing.

### What is the business potential?
It can start as a campus or community coordination platform and expand through partnerships, better routing, mobile apps, and automated payments.

### Why is Thunder Bay a good pilot market?
Because students and communities already rely on transit and carpooling alternatives, but coordination is still fragmented and trust-sensitive.

