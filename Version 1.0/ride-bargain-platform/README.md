# Ride Bargain Platform (No Maps, WhatsApp Alternative)

This is a **simple, professional MVP** for your idea: a platform where **Drivers post offers**, **Riders post requests**, and both sides can **bargain safely inside the app** (no WhatsApp while driving).

✅ Includes:
- JWT Authentication (Register / Login)
- Driver **Offers** list shows **driver display names**
- Rider **Requests** list shows rider display names
- **Bargaining** using + / - buttons (0.50 increments)
- Simple in-app chat per negotiation
- Manual ETA: driver enters “minutes away” (no map)
- Cash payment **direct to driver** (no payment gateway)
- Platform fee logic: **$0.50 from rider and $0.50 from driver** when ride is finished (manual mark-paid)

---

## 1) Requirements
- **Node.js 18+** (recommended Node 20)
- npm (comes with Node)

---

## 2) Run it locally (Windows / Mac)

### A) Start the API (Server)
1. Open Terminal/PowerShell in:
   `ride-bargain-platform/server`
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) create `.env` from the example:
   - Copy `/.env.example` to `/.env`
4. Start the server:
   ```bash
   npm run dev
   ```
5. API will run on:
   - `http://localhost:4000`

### B) Start the Web App (Client)
1. Open a **second** Terminal/PowerShell in:
   `ride-bargain-platform/client`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the frontend:
   ```bash
   npm run dev
   ```
4. Open:
   - `http://localhost:5173`

---

## 3) How to use (demo flow)
1. Register two accounts:
   - one as **Driver**, one as **Rider** (role is not enforced in MVP; any user can post both)
2. Driver posts an **Offer**.
3. Rider posts a **Request**.
4. Go to **Bargaining** tab:
   - Create a negotiation by selecting an offer + request
   - Use **+ / -** to change price
   - Either side can **Accept**
5. After accepting:
   - Click **Start Ride** then **Finish Ride**
   - This creates platform fees: **$0.50 driver + $0.50 rider**
6. Go to **Platform Fees** tab:
   - Mark as paid manually (simulate cash/e-transfer to you)

---

## 4) Where the data is stored
- SQLite file: `server/data.sqlite`

Delete it to reset everything.

---

## 5) Next upgrades (easy to add)
- Edit Offer/Request instead of reposting
- Driver “online/offline” toggle
- Phone number verification
- Reporting/blocking users
- Admin dashboard to reconcile fees
- Optional location (if you ever want) but **not required** for your assignment

---

## Project structure
- `server/` Express API + SQLite
- `client/` React (Vite)

