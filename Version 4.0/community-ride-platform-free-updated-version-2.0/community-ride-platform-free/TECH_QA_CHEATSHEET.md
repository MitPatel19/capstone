# Capstone Tech Q&A Cheat Sheet

This file is a short, presentation-friendly guide to the technologies, tools, techniques, and concepts used in the project.

## 1. Frontend

### React
- React is the frontend library used to build the user interface.
- It helps us create reusable components like dashboards, cards, forms, and ride detail screens.
- We used it because it makes a multi-page role-based application easier to manage.

### TypeScript
- TypeScript is JavaScript with type checking.
- It helps catch errors earlier and makes the code easier to understand in a larger project.
- We used it to make API responses, ride objects, user roles, and state handling safer.

### Vite
- Vite is the frontend build tool and development server.
- It gives very fast local development and efficient production builds.
- We used it because it is simple, modern, and works very well with React and TypeScript.

### Tailwind CSS
- Tailwind CSS is a utility-first CSS framework.
- It helped us build the UI quickly with consistent spacing, layout, colors, and responsiveness.
- We used it to make the interface clean and mobile-friendly without writing large custom CSS files.

### React Router
- React Router handles navigation between pages like login, rider dashboard, driver dashboard, billing, and admin dashboard.
- It lets us create protected routes for different user roles.

### Axios
- Axios is used for frontend-to-backend API communication.
- It sends requests to the FastAPI backend for login, rides, billing, reports, and admin actions.

## 2. Backend

### FastAPI
- FastAPI is the backend web framework.
- It is fast, clean, and good for building structured APIs.
- We used it to create endpoints for authentication, rides, billing, admin actions, and reports.

### Pydantic
- Pydantic is used for data validation and schema management.
- It checks request and response data so the API stays structured and reliable.
- We used it for things like user models, ride models, billing outputs, and validation logic.

### SQLAlchemy
- SQLAlchemy is the ORM used for database access.
- ORM means we interact with Python objects instead of writing raw SQL everywhere.
- We used it to manage users, rides, join requests, billing records, reports, and notifications.

### Uvicorn
- Uvicorn is the ASGI server that runs the FastAPI app.
- It is used during local development and deployment to serve the backend.

## 3. Database and Storage

### SQLite
- SQLite is the default database in the demo version.
- It is lightweight, easy to set up, and useful for fast local testing.
- We used it for quick development and demonstration.

### PostgreSQL readiness
- The project is designed so it can move to PostgreSQL in production.
- PostgreSQL is better for larger, multi-user, real-world deployments.

### File Upload Storage
- Driver documents and report attachments are uploaded and stored in the backend upload directory.
- This supports trust, verification, and issue handling.

## 4. Authentication and Security

### JWT Authentication
- JWT stands for JSON Web Token.
- It is used to keep users logged in securely after they authenticate.
- We used JWT so the frontend can send a token with requests and the backend can verify identity and role.

### Role-Based Access Control
- The system has three main roles: rider, driver, and admin.
- Each role sees different pages and can perform different actions.
- This helps security, clarity, and proper system control.

### OTP Pickup Verification
- OTP stands for one-time password.
- It is used at pickup so the rider and driver can verify the ride before it begins.
- This is one of our safety-focused features.

## 5. Real-Time Features

### WebSocket
- WebSocket enables real-time communication between frontend and backend.
- We used it for live ride updates, notifications, join requests, OTP events, and chat-like interactions.
- This makes the system feel dynamic instead of requiring constant refreshes.

### Notifications
- Notifications are stored and shown in the UI for important actions like new join requests or billing reminders.
- This helps users stay informed without searching through pages.

## 6. Maps and External Services

### OpenStreetMap Nominatim
- Nominatim is used for free location suggestions.
- We chose it because it avoids paid API costs during the demo version.
- It is a good low-cost choice for early-stage development.

### Google Maps Navigation
- The system can open Google Maps for route navigation.
- This lets us use a familiar navigation experience without building our own map routing interface.

### Stripe
- Stripe is included for billing and payment confirmation support.
- In the current version, it supports payment-related flow and can be expanded into fuller automation later.

## 7. Deployment and DevOps

### Railway
- Railway is the recommended deployment platform for this project.
- It is simple for full-stack deployment and supports environment variables, Docker, volumes, and databases.

### Docker
- Docker is used to package the frontend and backend together.
- It helps create a consistent deployment environment.
- In this project, the built frontend and FastAPI backend can run as one service.

### Environment Variables
- Environment variables store sensitive or changeable settings like admin credentials, secret keys, Stripe keys, CORS origins, and database URLs.
- This keeps configuration separate from code.

## 8. Product Techniques Used

### Role-Based Product Design
- We designed different flows for riders, drivers, and admins instead of giving all users the same interface.
- This makes the platform more realistic and easier to use.

### Shared Ride Coordination
- The system supports join requests so a ride can include additional riders.
- This improves affordability and supports community-style carpooling.

### Structured Bargaining
- Instead of random chat negotiation, the platform uses a controlled bargaining flow where both sides confirm the final price.

### Admin Governance
- Admin tools are included for approvals, reports, city tax control, and billing configuration.
- This makes the project more than a basic booking app.

### Billing Logic
- The platform tracks per-ride fees, billing periods, due states, and city tax rules.
- This shows business logic, not just UI logic.

## 9. Why These Choices Make Sense

### Why React + FastAPI?
- React is strong for dynamic user interfaces.
- FastAPI is strong for clean and fast backend APIs.
- Together they create a modern, scalable full-stack stack.

### Why TypeScript?
- TypeScript reduces mistakes and improves maintainability.
- It is especially useful in multi-role applications with many data models.

### Why SQLite first?
- SQLite keeps the project easy to run and demo.
- It lowers setup complexity while still allowing future migration to PostgreSQL.

### Why free map services first?
- We wanted a working prototype without forcing paid API costs.
- That made the project more accessible and practical during development.

## 10. Quick Answer Lines

### What is the tech stack?
- React, TypeScript, Vite, Tailwind CSS on the frontend; FastAPI, Pydantic, SQLAlchemy, and SQLite on the backend; WebSocket for real-time updates.

### What makes the system more than a CRUD app?
- Real-time events, role-based flows, OTP verification, shared ride logic, admin approvals, and billing logic.

### Why is the architecture good?
- It is modular, role-aware, deployment-ready, and easy to extend with PostgreSQL, better payments, or mobile apps later.

### What can be improved in the future?
- Better maps and ETA tools, full payment automation, native apps, OCR document checks, and smarter ride matching.

