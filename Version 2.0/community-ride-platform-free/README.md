# Community Ride Coordination Platform (Free Version)

This is a **free** (no paid APIs required) working full-stack demo for:
- Rider / Driver / Admin roles
- Driver signup with document upload + admin approval
- Ride request with multi-stop drop-offs
- Bargaining (both sides must confirm)
- Join ride requests as **popups** (real-time via WebSocket)
- Cancellation with reason
- OTP pickup flow (demo: driver generates OTP, rider receives, driver verifies)
- In-app **Monthly Bill** (placeholder payment, no Stripe auto-charge yet)
- Platform fee per ride applies to **both** rider and driver

## 1) Run locally (recommended)

### Backend
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Now open: http://localhost:5173

Admin seeded:
- Email: **pmit9114@gmail.com**
- Password: **Mit@2020**

## 2) Free deployment (simple)

### Option A (Free): Render (backend) + Vercel (frontend)
- Deploy backend on Render (free web service). Set `DATABASE_URL` to SQLite or free Postgres (Neon/Supabase).
- Deploy frontend on Vercel. Set env:
  - `VITE_API_BASE=https://<your-backend-url>`
  - `VITE_WS_BASE=wss://<your-backend-url>`

### Option B (Free): Railway / Fly.io alternatives
Any platform that can run:
- `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- `npm run build` + static hosting

## Notes
- Location suggestions use **OpenStreetMap Nominatim** (free, no key).
- Navigation button opens **Google Maps** in a new tab.
- Stripe Connect integration can be added later. Currently: "Pay Now" just marks bill as paid.
