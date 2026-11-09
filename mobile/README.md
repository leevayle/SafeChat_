# SafeChat Frontend (React + Vite)

Works with the SafeChat **FastAPI** backend (`/api/v1`).

## Quick start

1. Start the backend on port **8000** (MongoDB + uvicorn).
2. In this folder:

```bash
npm install
npm run dev
```

Open http://localhost:5173

Vite proxies `/api` and `/health` to `http://localhost:8000`.

Optional: copy `.env.example` → `.env` and set `VITE_API_URL` if the API is on another host.

## Auth

- Register: username + display name + password (min 8)
- Login: username + password
- Tokens: access + refresh stored in `localStorage` (`sc_access`, `sc_refresh`)

## Features wired to backend

- Auth (register / login / logout / me)
- Profile update
- Contacts (list, request, remove, nickname)
- Private conversations + messages (send, history, read)
- Groups (list, create, basic ops)
- Status feed + create

Calls / typing / rings are soft-stubbed until backend WebSocket & signaling land.

## Theme

Brand colors and UI match the original SafeChat design (purple / orange / Nunito).


## Phone-first onboarding

New accounts follow this sequence: welcome → international phone number → SMS verification → profile setup → account. Development SMS mode displays the generated code in the verification screen. The backend is configured for Africa's Talking; switch the backend `SMS_MODE` to `production` and provide valid Africa's Talking credentials before enabling live SMS delivery. Existing users log in with their full international phone number and password.
