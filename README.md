# Midosoc — Zero-Trust Gateway for Autonomous AI Agents

**[📺 Watch the Hackathon Demo Video on YouTube](https://www.youtube.com/watch?v=9IYZJI6JA5E)**

**[🚀 Live Demo — Sign in with Google](https://midosoc-dashboard-693775682816.us-central1.run.app)**

Midosoc is a security middlebox that sits between autonomous AI agents (LangChain, AutoGPT, custom LLM tools, etc.) and the actions they want to execute. It enforces human-in-the-loop authorization for destructive operations using a real-time SOC analyst dashboard. Safe actions pass through instantly. Destructive actions are suspended—socket held open in memory—until a human approves or denies them through the dashboard, at which point an Auth0 M2M vault token is issued and returned to the agent.

---

## What It Does

1. An AI agent sends an action payload to the gateway (`POST /proxy/execute`)
2. The **Policy Engine** classifies the intent as `SAFE` or `DESTRUCTIVE`
   - Uses an LLM (OpenAI GPT-4o-mini, Anthropic Claude 3 Haiku, or local OpenClaw) when an API key is configured
   - Falls back to a static keyword heuristic (blocklist: `delete`, `drop`, `remove`, `transfer_funds`, `grant_admin`, `purge`, `destroy`) when no LLM key is present
3. `SAFE` → payload is instantly allowed through (HTTP 200)
4. `DESTRUCTIVE` → the agent's HTTP connection is **suspended** (Express response object stored in RAM). The request appears on the SOC Dashboard via SSE
5. A human analyst reviews the forensic dossier (confidence score, flagged markers, raw payload) and clicks **Approve** or **Deny** through a confirmation modal
6. On approval → the backend acquires an Auth0 M2M vault token via Client Credentials grant, releases the suspended socket with the token attached. The agent can then use that token to call a protected downstream API
7. On denial → the agent receives HTTP 403
8. Every decision (approve/deny) is persisted to a JSONL audit trail

---

## Architecture

```
┌──────────────────┐         ┌───────────────────────────┐         ┌─────────────────────┐
│                  │         │                           │         │                     │
│    AI Agent      │──POST──▶│   apps/proxy (Express)    │◀──SSE───│   apps/dashboard    │
│  (Python/JS/…)   │         │   :3001                   │         │   (Next.js) :3000   │
│                  │◀─200────│                           │─polling─▶│                     │
│                  │  or 403 │  ┌─────────────────────┐  │         └──────────┬──────────┘
└──────────────────┘         │  │ Policy Engine        │  │                   │
                             │  │ (LLM → heuristic)   │  │           Auth0 Universal Login
                             │  └─────────────────────┘  │           /auth/login, /logout
                             │  ┌─────────────────────┐  │                   │
                             │  │ In-Memory Queue      │  │           ┌──────▼──────┐
                             │  │ (100 max, 5min TTL)  │  │           │   Auth0     │
                             │  └─────────────────────┘  │           │   Tenant    │
                             │  ┌─────────────────────┐  │           └─────────────┘
                             │  │ Auth Middleware       │  │                 ▲
                             │  │ (JWT / ADMIN_SECRET) │  │                 │
                             │  └─────────────────────┘  │          M2M Client Creds
                             │  ┌─────────────────────┐  │          (on approve)
                             │  │ Token Cache (M2M)    │──┼─────────────────┘
                             │  └─────────────────────┘  │
                             │  ┌─────────────────────┐  │
                             │  │ Audit Log (JSONL)    │  │
                             │  └─────────────────────┘  │
                             └───────────────────────────┘
```

### End-to-End Flow (Destructive Action)

```
Agent                    Proxy (:3001)              Dashboard (:3000)           Auth0
  │                          │                           │                       │
  │──POST /proxy/execute────▶│                           │                       │
  │                          │──PolicyEngine.evaluate()  │                       │
  │                          │  (DESTRUCTIVE)            │                       │
  │                          │──queue.add(payload, res)  │                       │
  │   (socket suspended)     │──SSE: request:added──────▶│                       │
  │                          │                           │  Analyst sees card    │
  │                          │                           │  clicks Approve       │
  │                          │◀─POST /queue/approve/:id──│                       │
  │                          │──getVaultToken()─────────▶│──────────────────────▶│
  │                          │◀─M2M access token─────────│◀─────────────────────│
  │◀─200 + vault token───────│──SSE: request:approved───▶│                       │
  │                          │──audit.record()           │                       │
  │──POST /external/execute─▶│                           │                       │
  │  (with vault token)      │                           │                       │
  │◀─"Action executed"───────│                           │                       │
```

---

## Repository Structure

```
midosoc/
├── apps/
│   ├── proxy/                      # Node.js backend gateway (:3001)
│   │   ├── server.js               # Express app — routes, SSE, error handling
│   │   ├── policyEngine.js         # LLM classification + static keyword fallback
│   │   ├── queueManager.js         # In-memory queue (EventEmitter, TTL, max 100)
│   │   ├── authMiddleware.js       # Auth0 JWT verification + RBAC + dev bypass
│   │   ├── tokenCache.js           # M2M token acquisition + caching (5min pre-expiry)
│   │   ├── auditLog.js             # Append-only JSONL audit trail
│   │   ├── logger.js               # Pino structured logging (pretty dev, JSON prod)
│   │   ├── data/audit.jsonl        # Persistent decision log (auto-created)
│   │   ├── .env.example            # Backend env var template
│   │   └── tests/
│   │       ├── policy_engine.test.js   # 5 tests — heuristic classification
│   │       └── routes.test.js          # 9 tests — route integration tests
│   │
│   └── dashboard/                  # Next.js SOC analyst dashboard (:3000)
│       └── src/
│           ├── middleware.ts                # Auth0 middleware (Next.js middleware)
│           ├── app/
│           │   ├── page.tsx                # Main SOC dashboard page
│           │   ├── layout.tsx              # Root layout (Geist fonts, metadata)
│           │   ├── globals.css             # Tailwind + threat-pulse animation
│           │   └── api/proxy/
│           │       ├── [...path]/route.ts  # API proxy → backend (adds auth header)
│           │       └── queue/events/route.ts # SSE stream proxy
│           ├── components/soc/
│           │   ├── ForensicCard.tsx         # Threat card (payload, markers, approve/deny)
│           │   ├── ConfirmModal.tsx         # Styled confirmation dialog
│           │   ├── SOCHeader.tsx            # Header bar (status, user, clock)
│           │   ├── AgentSimulator.tsx       # Dev payload injection tool
│           │   ├── AuditLog.tsx             # Collapsible decision history
│           │   └── ToastNotification.tsx    # Action feedback toasts
│           ├── hooks/
│           │   ├── useQueuePolling.ts       # SSE + fallback polling
│           │   └── useAuthProfile.ts        # Auth0 session + login redirect
│           └── lib/
│               ├── auth0.ts                # Auth0Client instance
│               └── utils.ts                # cn() utility (clsx + tailwind-merge)
│
├── scripts/
│   └── simulator/
│       ├── autonomous_client.py    # Python agent: safe + destructive payloads
│       ├── safe_demo.py            # Quick safe payload demo
│       ├── destructive_demo.py     # Quick destructive payload demo
│       └── requirements.txt
│
├── docker-compose.yml              # proxy + dashboard containers
└── package.json                    # NPM workspaces root
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js 20, Express 5, Zod (schema validation), Pino (structured logging) |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui (base-ui) |
| **Auth** | Auth0 (`@auth0/nextjs-auth0` for dashboard, `jose` for backend JWT verification) |
| **LLM** | OpenAI GPT-4o-mini, Anthropic Claude 3 Haiku, or local OpenClaw (all optional) |
| **Real-time** | Server-Sent Events (SSE) with polling fallback |
| **Testing** | Jest 30, Supertest, Babel (ESM→CJS for `jose`) |
| **Infra** | Docker Compose, NPM Workspaces monorepo |

---

## API Endpoints (Backend — `:3001`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/proxy/execute` | None (rate-limited: 100/min/IP) | Main gateway. Classifies intent, allows or suspends |
| `GET` | `/queue` | `ADMIN_SECRET` or JWT + `view:queue` | Returns all pending requests |
| `GET` | `/queue/events` | `ADMIN_SECRET` or JWT + `view:queue` | SSE stream — pushes `request:added`, `request:approved`, `request:denied` events |
| `POST` | `/queue/approve/:id` | `ADMIN_SECRET` or JWT + `approve:requests` | Approves suspended request, acquires M2M vault token |
| `POST` | `/queue/deny/:id` | `ADMIN_SECRET` or JWT + `deny:requests` | Denies suspended request, agent receives 403 |
| `POST` | `/external/execute` | `ADMIN_SECRET` or JWT | Mock protected API — proves agent *uses* the vault token |
| `GET` | `/audit` | `ADMIN_SECRET` or JWT + `view:queue` | Last 50 decisions from JSONL audit log |
| `GET` | `/health` | None | `{ status, uptime, queueSize }` |

**Payload schema** (enforced by Zod): must contain an `action` field (string). All other fields are passed through.

---

## Authentication & Authorization

### In Development (default)

All authenticated endpoints accept `Authorization: Bearer local_dev_secret` (or whatever `ADMIN_SECRET` is set to). No Auth0 configuration needed to run locally.

The dashboard API proxy (`/api/proxy/[...path]`) automatically injects the `ADMIN_SECRET` as the bearer token when `NODE_ENV !== 'production'`.

### In Production

Two Auth0 applications are required:

1. **Regular Web Application** — for the dashboard. Users log in via Auth0 Universal Login. The `@auth0/nextjs-auth0` SDK handles session management. Routes provided: `/auth/login`, `/auth/logout`, `/auth/callback`, `/auth/profile`.

2. **Machine-to-Machine Application** — for the Token Vault. When a request is approved, the backend uses Client Credentials to acquire an M2M access token from Auth0. This token is cached in-memory with a grace period of 5 minutes before expiry (`tokenCache.js`).

**RBAC permissions** (enforced by `authMiddleware.js`):
- `view:queue` — read the pending queue and audit log
- `approve:requests` — approve destructive actions
- `deny:requests` — deny destructive actions

All permissions are bypassed when using `ADMIN_SECRET`.

---

## Prerequisites

- **Node.js** ≥ 20
- **Python** ≥ 3.10 (only for the simulator script)
- **Auth0 tenant** with two applications (optional for local dev)
- **LLM API key** (optional; the policy engine falls back to keyword heuristics)

---

## Environment Variables

### Backend (`apps/proxy/.env`)

Copy from `apps/proxy/.env.example`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH0_DOMAIN` | For production | — | Auth0 tenant domain (e.g. `dev-xxx.us.auth0.com`) |
| `AUTH0_CLIENT_ID` | For M2M tokens | — | M2M application Client ID |
| `AUTH0_CLIENT_SECRET` | For M2M tokens | — | M2M application Client Secret |
| `AUTH0_AUDIENCE` | For M2M tokens | — | Audience for the M2M token (e.g. `https://dev-xxx.us.auth0.com/api/v2/`) |
| `OPENAI_API_KEY` | No | — | Enables GPT-4o-mini policy evaluation |
| `ANTHROPIC_API_KEY` | No | — | Alternative: enables Claude 3 Haiku evaluation |
| `OPENCLAW_API_BASE` | No | — | Alternative: local OpenClaw LLM endpoint |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated CORS origins |
| `PORT` | No | `3001` | Server port |
| `ADMIN_SECRET` | No | `local_dev_secret` | Dev bypass token (skip JWT verification) |

**LLM priority**: OpenClaw/OpenAI → Anthropic → static heuristics. Only one LLM is used; the first configured wins.

### Frontend (`apps/dashboard/.env.local`)

Copy from `apps/dashboard/.env.example`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH0_DOMAIN` | Yes | — | Auth0 tenant domain |
| `AUTH0_CLIENT_ID` | Yes | — | Web application Client ID |
| `AUTH0_CLIENT_SECRET` | Yes | — | Web application Client Secret |
| `AUTH0_SECRET` | Yes | — | Random 32+ char string for session encryption (`openssl rand -hex 32`) |
| `APP_BASE_URL` | Yes | — | Dashboard URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001` | Backend gateway URL |
| `ADMIN_SECRET` | No | `local_dev_secret` | Must match the backend's value |

---

## Quick Start

### 1. Install dependencies

```bash
cd midosoc2
npm install
```

This installs all workspace dependencies (both `apps/proxy` and `apps/dashboard`).

> **Windows note**: On first install, you may need to explicitly install native platform binaries for Tailwind CSS. If the dashboard shows a 500 error about `lightningcss` or `@tailwindcss/oxide`, run:
> ```bash
> cd apps/dashboard
> npm install @tailwindcss/oxide-win32-x64-msvc lightningcss-win32-x64-msvc
> ```

### 2. Configure environment

```bash
# Backend
cp apps/proxy/.env.example apps/proxy/.env
# Edit: fill in Auth0 credentials and optionally an LLM API key

# Frontend
cp apps/dashboard/.env.example apps/dashboard/.env.local
# Edit: fill in Auth0 credentials, AUTH0_SECRET, APP_BASE_URL
```

For **local dev without Auth0 auth**, you can leave Auth0 credentials pointing to any valid Auth0 tenant — the dashboard needs them for the SDK to initialize — but all backend requests will use `ADMIN_SECRET` bypass.

### 3. Start the backend

```bash
cd apps/proxy
node server.js
# Midosoc gateway listening on http://localhost:3001
```

> **Important**: Run from the `apps/proxy` directory (or use `node apps/proxy/server.js` from root). The server loads `.env` relative to `server.js` using `__dirname`, so CWD does not matter.

### 4. Start the dashboard

```bash
cd apps/dashboard
npm run dev
# Ready on http://localhost:3000
```

### 5. Test the flow

Open http://localhost:3000 in a browser. Use the **Agent Simulator** panel on the left to inject a destructive payload (e.g. `delete_database`). A red forensic card will appear. Click **Approve via Auth0** or **Reject Drop**, confirm in the modal, and watch the toast notification.

### 6. Run the Python agent simulator (optional)

```bash
cd scripts/simulator
pip install requests
python autonomous_client.py
```

The simulator sends:
- `get_weather` → SAFE → allowed instantly (HTTP 200)
- `delete_database` → DESTRUCTIVE → suspended, waiting for dashboard action

After approving on the dashboard, the simulator receives the vault token and calls `/external/execute` to prove the Token Vault loop works end-to-end.

---

## Docker Compose

```bash
docker compose up --build
# Proxy on :3001, Dashboard on :3000
```

Both services use `node:20-alpine`. Env files are loaded from `apps/proxy/.env` and `apps/dashboard/.env.local` respectively. The dashboard runs in dev mode inside Docker.

---

## Connecting Your Own Agents

Have your agent POST to the MIDOSOC gateway instead of executing sensitive actions directly:

```python
import requests

MIDOSOC_GATEWAY = "http://localhost:3001/proxy/execute"

payload = {
    "agent_id": "my-agent",
    "action": "delete_user_data",       # Required field
    "target": "user_123",               # Pass-through (any extra fields are fine)
    "reasoning": "User requested account deletion"
}

# Set a high timeout — the socket hangs until a human approves/denies
response = requests.post(MIDOSOC_GATEWAY, json=payload, timeout=300)

if response.status_code == 200:
    result = response.json()
    if result["proxy_action"] == "allowed":
        # Safe action, proceed normally
        pass
    elif result["proxy_action"] == "step_up_approved":
        # Human approved — vault token is attached
        vault_token = result["auth0_vault_delegation"]
        # Use the token to call a protected downstream service
        requests.post("https://my-api.example.com/execute",
                       headers={"Authorization": f"Bearer {vault_token}"},
                       json=payload)
elif response.status_code == 403:
    # Human denied the action — do not proceed
    pass
```

**Requirements**: Payload must include an `action` field (string). All other fields are passed through to the dashboard for forensic display.

**Timeout**: Destructive payloads keep the HTTP connection open for up to 5 minutes (the queue TTL). Set your client timeout accordingly.

---

## Testing

```bash
cd apps/proxy
npm test
```

Runs **14 tests** across two suites:

- **`policy_engine.test.js`** (5 tests) — heuristic classification: safe payloads, destructive keywords, empty payloads, obfuscated/nested keywords, boundary conditions
- **`routes.test.js`** (9 tests) — integration tests: health check, payload validation (400), safe pass-through (200), destructive queueing, authenticated queue access, approve flow (200 + audit), deny flow (403 + audit), invalid ID (404), auth rejection (401)

> **Note**: Tests unset LLM API keys to force deterministic heuristic evaluation. The `jose` ESM library is transpiled to CJS via `babel.config.js`.

---

## How the Dashboard Works

The dashboard is a Next.js 16 app using the App Router. Key patterns:

1. **API Proxy**: All dashboard → backend requests go through `/api/proxy/[...path]/route.ts`. This server-side route injects the auth token (`ADMIN_SECRET` in dev, Auth0 access token in prod) and forwards to `http://localhost:3001`.

2. **SSE Proxy**: A dedicated route at `/api/proxy/queue/events/route.ts` proxies the SSE stream from the backend through Next.js.

3. **Real-time updates**: The `useQueuePolling` hook opens an `EventSource` to `/api/proxy/queue/events`. When SSE is connected, polling slows to 10s (backup). If SSE fails, fast polling (1.5s) takes over.

4. **Auth flow**: `src/middleware.ts` wires Auth0 middleware into Next.js. This enables `/auth/login`, `/auth/logout`, `/auth/callback`, `/auth/profile` routes. The `useAuthProfile` hook checks login state and shows a login overlay if not authenticated.

5. **UI components**: The dashboard renders a dark SOC-themed interface with ForensicCards (threat details + approve/deny), a ConfirmModal (styled replacement for `window.confirm`), an AgentSimulator (dev payload injection), an AuditLog (collapsible decision history), and toast notifications.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `Invalid ADMIN_SECRET provided and no Auth0 domain configured` (repeating in backend logs) | The dashboard is sending a token the backend doesn't recognize | Ensure `ADMIN_SECRET` matches in both `apps/proxy/.env` and `apps/dashboard/.env.local` |
| `JWT Verification failed: Invalid Compact JWS` | Dashboard sends an Auth0 opaque token that the backend can't verify as a JWT | Ensure the API proxy uses `ADMIN_SECRET` in dev mode (default behavior after latest fix) |
| Backend 500 on `/proxy/execute` | Usually a JSON parse error (PowerShell escaping) or missing `.env` file | Use a file for the payload (`-d @payload.json`), verify `.env` is loaded |
| Dashboard 500 with `lightningcss` error | Missing native binary (npm hoisting bug in monorepos on Windows) | `cd apps/dashboard && npm install @tailwindcss/oxide-win32-x64-msvc lightningcss-win32-x64-msvc` |
| Dashboard auth routes return 404 | Middleware file missing or misnamed | Ensure `src/middleware.ts` exists (not `proxy.ts`) |
| Jest fails with `jose` import error | ESM/CJS incompatibility | Ensure `babel.config.js` exists in `apps/proxy` |
| Dashboard shows "Gateway unreachable" | Backend not running on expected port | Start the proxy: `cd apps/proxy && node server.js` |
| SSE not connecting | Check network tab for `/api/proxy/queue/events` | Ensure backend is running, check CORS `ALLOWED_ORIGINS` includes dashboard URL |
| Audit log empty | No approve/deny decisions made | Approve or deny a request. File is at `apps/proxy/data/audit.jsonl` |

---

## Known Limitations

- **In-memory queue**: Pending requests live in RAM. A backend restart loses all suspended requests. Production use would need Redis or a database-backed queue.
- **Single-process**: No horizontal scaling. Queue state is per-process. A shared store and session affinity or pub/sub would be needed for multi-instance deployment.
- **5-minute TTL**: Suspended requests auto-expire after 5 minutes. The agent's HTTP connection will time out if no human acts in time.
- **No persistent SSE sessions**: If the dashboard disconnects from SSE, it falls back to polling. No missed-event replay.
- **Mock external API**: `/external/execute` is a mock endpoint for demo purposes. In production, the vault token would be used against real downstream services.

---

## Auth0 Setup (Production)

You need **two** Auth0 applications:

### 1. Regular Web Application (Dashboard)

- **Type**: Regular Web Application
- **Allowed Callback URLs**: `http://localhost:3000/auth/callback`
- **Allowed Logout URLs**: `http://localhost:3000`
- Copy Client ID / Secret into `apps/dashboard/.env.local`

### 2. Machine-to-Machine Application (Token Vault)

- **Type**: Machine to Machine
- **Authorized API**: Your Auth0 Management API (or a custom API)
- Copy Client ID / Secret into `apps/proxy/.env`

### 3. RBAC (optional, for role-based access)

1. Go to **Applications → APIs** → Select your API
2. Enable **"Enable RBAC"** and **"Add Permissions in the Access Token"**
3. Define permissions: `view:queue`, `approve:requests`, `deny:requests`
4. Create a role **"SOC Analyst"** and assign all 3 permissions
5. Assign the role to your user accounts

> Without RBAC configured, all authenticated routes fall back to `ADMIN_SECRET` bypass in dev mode.

---

## Scripts

### `scripts/simulator/autonomous_client.py`

A Python script that simulates an AI agent. Sends a safe request (instant pass-through) then a destructive request (suspends until dashboard action). On approval, it extracts the vault token and calls `/external/execute` to prove the token works.

```bash
cd scripts/simulator
pip install requests
python autonomous_client.py
```

### `scripts/simulator/safe_demo.py` / `destructive_demo.py`

Short single-purpose scripts for demo recording. `safe_demo.py` sends a safe payload and prints the instant response. `destructive_demo.py` sends a destructive payload, waits for human approval, then calls `/external/execute` with the vault token.

```bash
PROXY_URL=https://your-proxy-url ADMIN_SECRET=your-secret python3 scripts/simulator/destructive_demo.py
```

---

## License

ISC
