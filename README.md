# SafeChat

Modern React chat app UI + JSON-file backend.

## Features

- Phone onboarding + profile setup (matches design)
- Login / register with session tokens
- 1:1 messaging (persisted in `server/db/messages.json`)
- Groups create / join / chat
- Status updates (24h)
- Calls log + simulated call UI
- Settings, wallpapers, read receipts
- Responsive centered column (WhatsApp Web style)

## Quick start

```bash
npm install
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3001  

### Demo accounts

Log in with username: `amina`, `brian`, `daisy`, `chen`, `emeka`, `fatma`, `joel`, `liam`

Or register a new phone number.

## Data

JSON files under `server/db/`:

| File | Purpose |
|------|---------|
| users.json | Accounts |
| messages.json | DM threads |
| groups.json | Groups + messages |
| status.json | Status updates |
| calls.json | Call history |
| sessions.json | Auth tokens |

## Scripts

- `npm run dev` — API + Vite together
- `npm run server` — API only
- `npm run client` — Vite only
- `npm run build` — production build
