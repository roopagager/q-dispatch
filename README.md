# Q-Dispatch

AI-powered hospital insurance claim dispatch platform — **Quantum AI Ltd.** ([quantumai.co.uk](https://quantumai.co.uk))

Q-Dispatch automates the cashless insurance claim lifecycle at a private hospital billing counter across four stages:

1. **Packet Assembly & Pre-Audit** — a clerk enters the patient details and itemised bill; an AI auditor (Claude) validates every line item before submission and blocks dispatch on hard errors.
2. **Instant Claim Dispatch** — the validated bill is converted to an NHCX-style claim email and sent to the insurer/TPA over SMTP, with a unique tracking token generated and inbox surveillance armed.
3. **Smart Inbox Surveillance** — a poller checks the reply inbox over IMAP every 90 seconds; when a reply quoting the tracking token arrives, Claude parses the decision (approved / partial / rejected / more-info), amounts, deductions and document requests.
4. **Automated Counter Clearance** — the patient copay (`total − approved`) is pushed to the checkout screen, and the Quantum AI **0.5% service fee** is logged to the hospital's monthly invoice. The fee is a **hospital charge** — it is never added to or shown to the patient.

## Tech stack

| | |
|---|---|
| Runtime | Node.js 20 + TypeScript (CommonJS) |
| Framework | Express 4 |
| Database | SQLite via `better-sqlite3` (PostgreSQL-ready schema) |
| AI | Anthropic Claude — `claude-sonnet-4-6` |
| Email out | Nodemailer (SMTP) |
| Email in | `node-imap` |
| Scheduler | `node-cron` (poll every 90 s) |
| Auth | Session cookies (`cookie-parser`) |
| Frontend | Single `public/index.html`, vanilla JS, no build step |
| Deploy | Railway.app (reads `PORT` from the environment) |

## Local development

```bash
cp .env.example .env      # then fill in real credentials
npm install
npm run dev               # ts-node, http://localhost:3000
```

Or run the compiled build:

```bash
npm run build
npm start
```

On first start with an empty database the app seeds one demo claim (Ramesh Nair,
with intentional audit issues) so the full pipeline can be exercised immediately.

### Default login

Set `LOGIN_USER` / `LOGIN_PASS` in `.env`. The defaults in `.env.example` are
`qdispatch_admin` / `ChangeThisPassword123` — **change them before deploying.**

## Environment variables

See [`.env.example`](.env.example) for the full list — Anthropic key, SMTP and
IMAP credentials, per-insurer claim email addresses, the app login, the session
secret, and the `QAI_FEE_RATE` (default `0.005`).

On Railway these are injected by the platform; locally they are read from `.env`.

## Deploy to Railway

`railway.toml` is preconfigured:

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "node dist/index.js"
```

Add the environment variables from `.env.example` in the Railway dashboard and
deploy. The SQLite file lives under `data/` (gitignored); mount a Railway volume
at `/app/data` if you need it to survive redeploys.

## Demo flow without live email/AI keys

The **Simulate TPA Reply** panel (Stage 3) lets you paste a raw insurer reply
and have it parsed instantly — no IMAP round-trip required. A realistic sample
reply is pre-filled for the selected claim.

## API reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/login` | Login page |
| `POST` | `/api/auth/login` | Authenticate, set session cookie |
| `POST` | `/api/auth/logout` | Clear session |
| `POST` | `/api/claims` | Create a claim (DRAFT) with bill items |
| `GET` | `/api/claims` | List claims (newest first) |
| `GET` | `/api/claims/:id` | Full claim with items + audit log |
| `POST` | `/api/audit/:claimId` | Run the AI pre-audit (→ AUDITED) |
| `POST` | `/api/dispatch/:claimId` | Dispatch the claim (→ DISPATCHED) |
| `POST` | `/api/simulate-reply/:claimId` | Inject + parse a TPA reply (→ REPLIED) |
| `POST` | `/api/clear/:claimId` | Counter clearance + ledger (→ CLEARED) |
| `GET` | `/api/ledger` | All ledger entries |
| `GET` | `/api/ledger/summary` | Pending / this-month fee summary |
| `GET` | `/api/ledger/invoices` | Monthly invoice rollups |
| `GET` | `/api/health` | Health + last inbox poll time |

All `/api/*` routes (except login) require a valid session cookie.

---

© 2025 Quantum AI Ltd.
