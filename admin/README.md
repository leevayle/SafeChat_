# SafeChat Admin Portal (v2)

A rebuilt admin console for the SafeChat backend. It talks to the existing `/api/v1/admin/*` routes — **no backend changes are needed**.
It lives in its own folder, so your current `admin/` app is untouched and you can switch over when you're happy.

## 1. Update the backend (one small change)
The backend had no way to change a username, so the Account tab needs one new endpoint, `PATCH /api/v1/users/me/username` (password-confirmed, same rules as registration, written to the audit log for admins).
From your repo root: `git apply backend-username-change.patch` (it only touches `backend/app/api/v1/users/router.py`), then restart the backend.
Everything else in the portal works without it; only "Change username" needs it.

## 2. Run it
```bash
cd admin-portal
cp .env.example .env        # Windows: copy .env.example .env   — then set VITE_API_URL, e.g. http://localhost:8000
npm install
npm run dev                 # http://localhost:5174
```
Port 5174 is already in your backend `CORS_ORIGINS`, so it works with no config. Stop the old `admin/` dev server first (same port), or change the port in `package.json`.

Sign in with an account whose role is `ADMIN` or `SUPER_ADMIN` (create one with `backend/app/scripts/bootstrap_superadmin.py`).

## Deploy
```bash
VITE_API_URL=https://your-api.example.com npm run build   # outputs dist/ (static site)
```
Host `dist/` anywhere static, and add the portal's origin to the backend `CORS_ORIGINS`.

## What's in it → which endpoint
| Screen | Endpoints |
|---|---|
| Overview | `GET /admin/overview`, `GET /admin/health` (auto-refresh 30s) |
| Users | `GET /admin/users` · `PATCH /users/{id}/status?status=` · `PATCH /users/{id}/subscription` · `POST /users/{id}/revoke-sessions` · `POST /users/reset-password` · `POST /users/{id}/revoke-admin` |
| Access control | `GET/POST /admin/role-requests` · `POST /role-requests/{id}/approve｜reject` |
| Support inbox | `GET /admin/support/tickets` · `POST …/replies` · `PATCH …/status` |
| Reports | `GET /admin/reports` · `PATCH /admin/reports/{id}` |
| Payments | `GET /admin/payments` |
| Audit log | `GET /admin/audit` (paged in the browser and filtered by date; no backend change) |
| My account | `GET /auth/me` · `PATCH /users/me` · `PATCH /users/me/username` (new) · `POST /auth/change-password` · `GET/DELETE /users/me/sessions` · `POST /users/me/deactivate` · `GET /auth/username/check` |
| Backups | `GET /admin/backups[/scopes]` · `POST /admin/backups` · job polling · authenticated download · `DELETE` |
| Session | `POST /auth/login｜refresh｜logout`, `GET /auth/me`, `PUT/DELETE /admin/presence` |

Notes: every mutating action asks for a reason (the API requires 3–500 chars and stores it in the audit log). Superadmin-only actions (approve/reject admin, revoke admin) only appear for `SUPER_ADMIN`; the backend enforces them regardless.
Theme (light/dark) is saved in `localStorage` as `safechat-admin-theme`, the same key as the old admin.

## Audit log, export and print
- Date range defaults to **This week** (Monday → today). Presets: Today, This week, Last 7 days, This month, **Latest 50** (shows the dates those 50 rows span), or pick any From/To.
- **Export** → Excel (.xlsx), CSV, PDF or JSON, for everything in the selected range (not just the visible page). **Print** opens a clean landscape print layout.
- Exports neutralise spreadsheet-formula injection (cells starting with `= + - @`). Ranges are capped at the newest 3,000 entries; narrow the dates for older ones.
- Payments has the same Export / Print.

## Also included
Idle sign-out after 30 minutes, open-work count in the browser tab title, error boundary per screen, light/dark theme shared between the top bar and Account.

## Loading states
Every screen that fetches data shows a shimmering wireframe of its own layout first (real table headers stay visible; only the data cells shimmer), then fades in the real content. Filters and paging re-trigger it. The first load shows a skeleton of the whole app shell. Shimmer respects the OS "reduce motion" setting and has light and dark variants (tokens `--sk-base` / `--sk-shine` in `styles.css`).
To add one to a new screen: `<SkTable cols={[{ h: 'Name', kind: 'user' }, ...]} />` or compose `Sk` blocks inside `<Busy label="Loading …">` (see `src/ui.tsx`).
