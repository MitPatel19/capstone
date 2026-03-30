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
- Email: whatever you set in `ADMIN_EMAIL`
- Password: whatever you set in `ADMIN_PASSWORD`

## 2) Deploy on Railway

This repo now includes a root `Dockerfile` that:
- builds the Vite frontend
- runs the FastAPI backend
- serves the built frontend from the same Railway service

That means you can deploy this app as a **single Railway service** with one public domain.

### Recommended Railway setup

1. Push this repo to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. In the Railway service `Settings`, set `Root Directory` to the app folder.
4. For this repository layout, use:

```text
/Version 4.0/community-ride-platform-free-updated-version-2.0/community-ride-platform-free
```

5. Railway should then detect the `Dockerfile` inside that folder instead of trying to build from the top-level repo.
6. Add a public domain to the service.
7. Set the health check path to `/health`.

### Railway variables

Set these service variables in Railway:

```env
ENV=prod
SECRET_KEY=replace-with-a-long-random-secret
FRONTEND_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
CORS_ORIGINS=https://${{RAILWAY_PUBLIC_DOMAIN}}
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
ADMIN_NAME=Admin
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Community Ride Coordination Platform
SMTP_USE_TLS=true
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
BILLING_CURRENCY=cad
```

### Storage choice A: easiest demo deploy

Attach a Railway volume at `/app/backend/data` and set:

```env
DATABASE_URL=sqlite:////app/backend/data/app.db
UPLOAD_DIR=/app/backend/data/uploads
```

Use this if you want the fastest deployment with the least setup.

### Storage choice B: better long-term deploy

1. Add a Railway Postgres service to the same project.
2. Reference its connection string from your web service:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

3. Still attach a Railway volume for uploaded files and set:

```env
UPLOAD_DIR=/app/backend/data/uploads
```

Use this if you want a proper database instead of SQLite.

### Notes for this project

- You do **not** need `VITE_API_BASE` or `VITE_WS_BASE` for the Railway single-service setup, because the frontend now falls back to the same origin in production.
- If you use Stripe checkout or email verification, `FRONTEND_URL` must point to your Railway public domain.
- If your Railway deployment cannot reach SMTP, signup will no longer crash. The verification screen will show a fallback verification link for newly created accounts.
- Driver documents and report attachments are stored in `UPLOAD_DIR`, so use a volume unless you move uploads to object storage later.
- For a fresh Postgres deploy, the current schema will be created automatically on startup.

## Notes
- Location suggestions use **OpenStreetMap Nominatim** (free, no key).
- Navigation button opens **Google Maps** in a new tab.
- Stripe Connect integration can be added later. Currently: "Pay Now" just marks bill as paid.
