# Developer guide

## Requirements

- Python 3.13.
- Node.js 22.12 or newer and npm.
- A reachable PostgreSQL database. Docker Desktop can be used to host a local database.

The application requires PostgreSQL at runtime. Its default automated tests use an isolated SQLite database to exercise route logic without touching application data.

## Local setup in PowerShell

From the repository root:

```powershell
python -m venv .venv
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
```

Edit the untracked `.env` before starting the server:

- Set `DATABASE_URL` to your PostgreSQL connection string.
- Set a random `SECRET_KEY` and an `ADMIN_PASSWORD`.
- Use `FRONTEND_URL=http://localhost:5173` for Vite development.
- Keep `ALLOW_SHARED_HR_LOGIN=0` and `DEMO_ENABLED=1` for the recruiter demo.

Never commit credentials. See [deployment notes](DEPLOYMENT.md) for public configuration requirements and [Gmail setup](GMAIL_SETUP.md) for optional integrations.

Start the API:

```powershell
.\.venv\Scripts\python.exe backend\app.py
```

In a second terminal, start the frontend:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`. The API health endpoint is `http://localhost:5000/api/health`. Restart the backend after changing Python code or environment settings.

Startup creates tables and runs additive migrations; it requires an existing database server. Back up a production database before schema upgrades.

## Manual backend restart

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

The launcher replaces only a verified backend from this project's virtual environment. It refuses to stop an unrelated application on the same port. Ctrl+C stops the backend.

## Same-origin preview

```powershell
cd frontend
npm.cmd run build
cd ..
.\.venv\Scripts\python.exe backend\app.py
```

Open `http://localhost:5000`. Flask serves the built frontend and API together. For this preview, set `FRONTEND_URL` and any OAuth callback to the backend origin as appropriate.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
cd frontend
npm.cmd run lint
npm.cmd run build
```

Tests default to an injected SQLite database and mocked external providers. PostgreSQL integration tests accept `ONEVOICE_TEST_DATABASE_URL` and require a disposable database name ending in `_codex_test`; they rebuild its tables. Never point tests at real meeting data. Provider mocks do not prove live authorization or model quality.

Check startup settings without connecting to a database:

```powershell
.\.venv\Scripts\python.exe -m backend.config --public
```

The checker validates local environment values, not Render's settings or database connectivity. It identifies invalid settings without printing credentials.

## Optional AI and email integrations

Demo AI requires a server-side `OPENAI_API_KEY`. Private workspace AI uses the configured local Ollama service and never silently falls back to OpenAI. See [AI evaluation](AI_EVALUATION.md) for evaluation cases and limitations.

Gmail requires OAuth credentials and a stable token encryption key. The application imports linked conversations and creates drafts for review; it never sends email automatically. See [Gmail setup](GMAIL_SETUP.md).
