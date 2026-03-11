# Community Ride Coordination Platform (Backend)

## Quick start (Windows / macOS / Linux)

1) Create venv + install
```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

2) Create `.env`
```bash
copy .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
# or: cp .env.example .env
```

3) Run API
```bash
uvicorn app.main:app --reload --port 8000
```

Health check: http://localhost:8000/health

Admin seeded:
- Email: pmit9114@gmail.com
- Password: Mit@2020

Notes:
- Uses SQLite by default (`DATABASE_URL=sqlite:///./app.db`) for easy/free local runs.
- For Postgres, set DATABASE_URL and redeploy.
