# OneVoice Portal

A meeting and follow-up application with a private Admin workspace and an editable
recruiter demo. HR records concerns, assigns responsible people, links email
conversations, and reviews summaries and draft follow-up emails.

## Current functionality

- Password-free demo: each visitor gets a separate fictional dataset for 12 hours.
- Admin login: vihaan4263@gmail.com; password configured outside Git.
- Overview cards for new meetings, previous meetings, reports, notifications, and calendar.
- Text action owners, contact email, status, priority, due dates, and follow-up remarks.
- Recording/update timestamps and Admin activity history; dates display in India time.
- Gmail OAuth, linked conversation import, periodic reply sync, and unsent drafts.
- Copy/paste email fallback. Original timestamps are not invented for pasted text.
- Private AI through local Ollama; demo AI through server-side OpenAI.
- CSV archive exports for all records or a year, calendar quarter, or month.

Gmail and OpenAI integrations need your external credentials before live use.
Missing settings are displayed clearly; the app does not fabricate AI output or
pretend to have synchronized mail. It never sends email automatically.

## Architecture

Browser (React) -> Flask API -> PostgreSQL

Flask also calls Gmail for authorized Admin mail and the appropriate AI provider.
Demo access is a signed, scoped session, not removal of backend authorization.
Every meeting/action query is scoped to its demo session or the private workspace.
The Docker deployment serves React and the API from one origin.

Backend files: app.py is the entry point; server.py contains API routes; models.py
contains database models; migrations.py performs additive schema upgrades;
gmail.py and ai.py contain external integrations. frontend/src/pages contains UI.

## Run locally in PowerShell

Docker Desktop must be running. The existing database container uses laptop port
15432 because port 5432 was occupied:

```powershell
docker start onevoice-db-local
cd C:\Users\vihaa\Desktop\Projects\OneVoicePortal
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-postgres.txt
.\.venv\Scripts\python.exe backend\app.py
```

Keep that terminal open. In a second terminal:

```powershell
cd C:\Users\vihaa\Desktop\Projects\OneVoicePortal\frontend
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite, usually http://localhost:5173. Backend health is at
http://localhost:5000/api/health. Restart the backend after changing Python code
or environment settings. Vite updates frontend changes automatically.

For a one-command manual restart from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

The launcher replaces only a verified backend from this project's virtual
environment. It refuses to stop an unrelated application on the same port.
It runs in your terminal; Ctrl+C stops it.

The ignored .env is already configured for the local database and Admin password.
For a new checkout, copy .env.example to .env and set the required values.
PostgreSQL itself must exist; startup creates tables, not a database server.
Existing meeting records are retained, and historical creation times stay unknown.

## AI and Gmail setup

See docs/GMAIL_SETUP.md for Google Cloud/OAuth steps. Store secrets in .env or
hosting settings, never React code or Git. The Gmail token encryption key is
separate from the session signing key and must remain stable.

Local .env uses the existing phi:latest Ollama model with a 2048-token context.
A larger locally installed model/context can be configured after evaluation.
Keep Ollama cloud features disabled for private use (OLLAMA_NO_CLOUD=1 when
starting Ollama). Ollama must be running on the configured address.

Add OPENAI_API_KEY to server configuration to enable fictional-data demo AI.
OPENAI_MODEL defaults to gpt-4.1-mini. The app limits demo AI usage per session
and across the server. Also configure a budget in your OpenAI project.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
cd frontend
npm.cmd run lint
npm.cmd run build
```

Tests default to an injected SQLite database and mocked external providers.
They verify authorization, cross-session isolation, exports, quotas, Gmail import
deduplication, token encryption, and additive migration. PostgreSQL tests support
ONEVOICE_TEST_DATABASE_URL and refuse database names not ending in _codex_test.
That database is disposable: the suite rebuilds its tables. Never point tests at
real meeting data. Provider mocks do not prove live authorization or model quality.

## Deployment and evaluation

See docs/DEPLOYMENT.md for the Docker image and existing Render-service setup.
Public deployment rejects the weak local Admin password and shared HR login.
Keep the private database/mailbox inaccessible to the public demo.

See docs/AI_EVALUATION.md for a small evaluation plan. Interview claims should
use observed results, clearly distinguish mocks from live tests, and explain the
context limits, manual review, isolation, and deployment trade-offs.
