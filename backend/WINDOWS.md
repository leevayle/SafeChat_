# SafeChat Backend – Windows Setup (No Docker)

You do **not** need Docker. Follow these steps on Windows 10/11 with PowerShell.

---

## 1. Install Python 3.12+

1. Download from https://www.python.org/downloads/
2. **Important**: during install check ✅ **Add python.exe to PATH**
3. Open a **new** PowerShell and verify:

```powershell
python --version
# should show Python 3.12.x or 3.13.x
```

---

## 2. Get MongoDB (choose one – both free)

### Option A – MongoDB Atlas (easiest, recommended)

1. Go to https://www.mongodb.com/cloud/atlas and create a free account
2. Create a free **M0** cluster (no credit card required for free tier)
3. Database Access → Add user (username + password)
4. Network Access → Add IP Address → `0.0.0.0/0` (or your current IP)
5. Click **Connect** → Drivers → copy the connection string  
   Example:  
   `mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. You will put this string into `.env` later

### Option B – Local MongoDB Community

1. Download installer: https://www.mongodb.com/try/download/community  
   (Windows, MSI, current version)
2. Install with default settings (it can install as a Windows Service)
3. Default connection will be `mongodb://localhost:27017`

---

## 3. Run the backend

Open PowerShell in the `safechat-backend` folder:

```powershell
# Create + activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Create config file
copy .env.example .env
```

**Edit `.env`** with Notepad (or any editor):

```powershell
notepad .env
```

Change at least these lines:

```env
SECRET_KEY=put-a-long-random-string-here-at-least-32-characters
MONGODB_URI=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
# or for local MongoDB:
# MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=safechat
```

Save and close.

Start the server:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use the helper script:

```powershell
.\scripts\start-windows.ps1
```

---

## 4. Verify it works

Open in browser:

- Health: http://localhost:8000/health
- Swagger UI: http://localhost:8000/docs

You can register a user directly in Swagger:

1. Expand `POST /api/v1/auth/register`
2. Click **Try it out**
3. Fill username, display_name, password
4. Execute → you should get `success: true`

Then try `POST /api/v1/auth/login` with the same credentials.

---

## Common Windows issues

| Problem | Fix |
|---------|-----|
| `python` not found | Re-install Python and tick “Add to PATH”, then open a **new** PowerShell |
| `Activate.ps1` cannot be loaded | Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Mongo connection timeout | Check Atlas Network Access (IP whitelist) and username/password |
| Port 8000 already in use | Change port: `uvicorn app.main:app --reload --port 8001` |

---

## Optional: Redis

Redis is **not required** for the current auth/messaging foundation.  
Presence and rate-limiting fall back to in-memory when `REDIS_URL` is empty.
