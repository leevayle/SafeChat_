# SafeChat Backend

Secure, modular, API-first real-time messaging backend for SafeChat.

**Stack:** Python 3.12 · FastAPI · MongoDB (Motor) · Argon2id · JWT · WebSockets (planned) · Redis (optional)

## Current Status (Phase 1–3 complete)

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Architecture & DB design | ✅ | Collections, indexes, modular layout |
| 2. Project structure & config | ✅ | Docker, env, requirements |
| 3. Auth & DB connectivity | ✅ | Register, login, refresh, logout, /me, password change |
| 4. Users / Contacts / Messaging | 🔄 Next | Schemas & services ready to extend |
| 5–13 | ⏳ | Groups, statuses, WS, calls, moderation, media, archives, tests, docs |

This foundation is runnable locally. Subsequent modules follow the same patterns (schemas → repositories/services → routers).

## Quick Start (Local)

**Windows users (no Docker):** see the full guide → [WINDOWS.md](WINDOWS.md)

### Prerequisites
- Python 3.12+
- MongoDB (local **or** free MongoDB Atlas – recommended)
- Optional: Redis

### Windows PowerShell (recommended path)

```powershell
cd D:\safechat-backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
copy .env.example .env
notepad .env          # set SECRET_KEY + MONGODB_URI (Atlas or local)

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or one-shot helper:

```powershell
.\scripts\start-windows.ps1
```

API: http://localhost:8000  
Swagger: http://localhost:8000/docs  
Health: http://localhost:8000/health

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env → MONGODB_URI
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker (optional – only if Docker Desktop is installed)

```bash
docker compose up -d --build
```

## Implemented Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login + tokens |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Revoke session |
| GET | `/api/v1/auth/me` | Current user (Bearer) |
| POST | `/api/v1/auth/change-password` | Change password |

All responses follow:

```json
{"success": true, "message": "...", "data": {}}
```

or

```json
{"success": false, "message": "...", "error_code": "...", "details": null}
```

## Security Notes (current)

- Passwords: Argon2id (passlib)
- Access tokens: short-lived JWT (15 min default)
- Refresh tokens: rotated, stored as SHA-256 hashes, device-bound sessions
- Account status enforced on login and token validation
- Indexes created on startup for uniqueness and performance

## Project Layout

```
safechat-backend/
├── app/
│   ├── main.py
│   ├── core/          # config, security, database, permissions, exceptions
│   ├── api/v1/        # versioned routers
│   ├── models/        # document shapes
│   ├── schemas/       # request/response validation
│   ├── services/      # business logic
│   ├── repositories/  # (extend)
│   ├── websocket/     # (Phase 6)
│   └── ...
├── tests/
├── docs/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

## Next Steps for Contributors / Continuation

1. Implement `app/api/v1/users` and profile update endpoints.
2. Contacts + contact_requests collections & APIs.
3. Conversations + messages with cursor pagination and idempotency.
4. WebSocket manager (presence, typing, new message events) with Redis pub/sub fallback to in-memory.
5. Groups, statuses (TTL), call signaling, moderation actions.
6. Background log archiving, media storage abstraction.
7. Full pytest suite + security tests.
8. Expand docs/ and finalize ZIP packaging.

## License / Notes

Built for the SafeChat project (https://github.com/leevayle/SafeChat_).  
Keep it free, simple, and inspired by WhatsApp / Signal / Telegram patterns without paid dependencies for core local development.

## Phone verification (Africa's Talking)

New registrations must verify an E.164 phone number before account creation. Configure:

```env
SMS_MODE=development
AFRICASTALKING_USERNAME=sandbox
AFRICASTALKING_API_KEY=
AFRICASTALKING_SENDER_ID=
OTP_EXPIRE_MINUTES=5
OTP_RESEND_SECONDS=60
OTP_MAX_ATTEMPTS=5
```

In development mode, SMS delivery is simulated and the generated OTP is returned only to the development client. Do not deploy with `APP_ENV=production` and `SMS_MODE=development`. For real delivery, set `SMS_MODE=production`, configure the Africa's Talking username/API key (and an approved sender ID if required), and use the correct account environment. The backend calls Africa's Talking's sandbox endpoint when the username is `sandbox`, otherwise its production endpoint.

Registration endpoints:
- `POST /api/v1/auth/phone/send-code` with `{ "phone_number": "+2547..." }`
- `POST /api/v1/auth/phone/verify-code` with `{ "phone_number": "+2547...", "code": "123456" }`
- `POST /api/v1/auth/register` requires the `registration_token` returned by verification.

Codes expire after five minutes by default, have a 60-second resend cooldown and five verification attempts. OTP values are stored as keyed hashes. Existing users sign in with their phone number and password.
