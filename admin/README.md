# SafeChat Admin Portal

Standalone administrator interface for the SafeChat API.

## Run locally

Start the backend on `http://localhost:8000`, then run:

```powershell
cd D:\safechat\admin
npm install
npm run dev
```

Open `http://localhost:5174`. The Vite development server proxies API calls to
the local backend. For a deployed portal, set `VITE_API_URL` to the backend
origin when building and configure that origin in the backend's `CORS_ORIGINS`.

## Access and controls

- Sign-in uses the regular SafeChat username/password endpoint. The portal
  refuses non-admin roles; every admin endpoint also checks the current
  database role on the server.
- Access tokens stay in memory and are not written to local storage. The
  backend's HttpOnly refresh cookie is used to renew the session.
- Admins can search users, review status and subscription details, deactivate
  or ban eligible accounts, reactivate accounts, and grant or revoke Premium.
- Support tickets submitted from the desktop Settings → Support screen appear
  in the admin inbox. New tickets are assigned round-robin to enabled admins
  with an active portal session. Assigned admins see only their own tickets;
  superadmins can see every ticket, its assignment history, and pending work.
  Tickets move through Pending, In progress, and Closed states. Replies remain
  visible on the user's existing support screen.
- Admin Settings provide system/light/dark themes and audited password resets
  for accounts below the acting admin's role. A generated temporary password
  is emailed to the user's account address and shown once for admin-side copying.
  Existing sessions are invalidated; the credential expires and forces a
  password change when used to sign in.
- The portal reports authenticated admin sessions as active for ticket
  assignment while their presence heartbeat is current.
- Payment records are read-only. Payment status must come from the payment
  provider flow, not a manual admin action. The existing M-Pesa API is still
  in demo mode and simulates successful payments; connect and verify real
  provider callbacks/status queries before using payment data in production.
- Admins can nominate users for the `ADMIN` role. Only a `SUPER_ADMIN` can
  approve or reject a nomination, or revoke an existing admin role. A role
  request cannot grant `SUPER_ADMIN`.
- Report dispositions and privileged changes are recorded in the system audit
  log.
- A first superadmin can be established once from the backend host with:

  ```powershell
  cd D:\safechat\backend
  python -m app.scripts.bootstrap_superadmin <username>
  ```

  This requires an existing active user, interactive confirmation, and no
  existing superadmin. Protect database access and the backend host accordingly.

The health panel reports API reachability and MongoDB ping status. Online user
counts reflect live WebSocket connections in the current backend process.
