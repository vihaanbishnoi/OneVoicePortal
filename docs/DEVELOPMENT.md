# Developer guide

OneVoice uses React, Express, Node.js, and PostgreSQL (PERN). Node.js 22.12 or newer and npm are required. Python is not needed by the application.

## Local setup in PowerShell

From the repository root:

```powershell
npm.cmd ci
npm.cmd --prefix frontend ci
# Only for a new checkout; preserve an existing .env.
Copy-Item .env.example .env
```

Set `DATABASE_URL` to a reachable PostgreSQL server, and set `SECRET_KEY` and `ADMIN_PASSWORD` in the untracked `.env`. For development use `FRONTEND_URL=http://localhost:5173`. Keep `ALLOW_SHARED_HR_LOGIN=0` for public demos.

```powershell
npm.cmd run check:config
npm.cmd run dev
```

In another terminal:

```powershell
npm.cmd --prefix frontend run dev
```

The API defaults to port 5000 and the frontend to port 5173. `npm run dev` watches the Node backend. Restart after changing environment settings. `scripts/run-local.ps1` is an alternative launcher that only replaces an explicitly verified instance started by that launcher.

## Same-origin preview

```powershell
npm.cmd run build
npm.cmd start
```

Open `http://localhost:5000`; Express serves the production frontend and API. Set the frontend origin and OAuth callback appropriately for this mode.

## Verification

```powershell
npm.cmd test
npm.cmd --prefix frontend run lint
npm.cmd run build
npm.cmd run check:config -- --public
```

The Node test suite uses an isolated, in-memory PostgreSQL engine (PGlite), with mocked Gmail and AI providers. It never connects to the application database or sends email. This exercises PostgreSQL SQL and route behavior; it does not verify production networking, TLS, or live OAuth/provider access.

## Migration from Flask

The Express backend retains the existing table and column names and runs additive schema initialization. Existing PostgreSQL records, IDs, password hashes, and Fernet-encrypted Gmail credentials remain compatible. Historical null meeting timestamps remain unknown. Standard PostgreSQL URLs work directly; existing `postgresql+psycopg2://` settings are also accepted.

The only new table is `oauth_states`, for short-lived, single-use Gmail connection requests. No existing business records are dropped or copied. Back up the database before deploying and verify the new backend against a restored copy first. Browser tokens from Flask are not accepted: sign in again after switching, and restart any pending Gmail connection flow.

`backend/`, Python requirements, and `tests/` are retained until the existing Render API has successfully switched from its Python runtime to Node. The latest supplied deployment logs still run `backend.server`, so deleting these files now would break subsequent Python deployments. They are not used by `npm start` or the Docker image. Do not run both backends against the same database during cutover. PostgreSQL advisory locks serialize quota reservations and Gmail sync among Node processes.

Demo AI uses OpenAI only for fictional demo workspaces. Private AI stays on Ollama with no cloud fallback. Gmail supports imports and unsent drafts, not sending. See [Gmail setup](GMAIL_SETUP.md) and [AI evaluation](AI_EVALUATION.md).

## Security test data

Security tests generate encryption keys, password salts, hashes, and encrypted tokens in memory for each run. Do not commit generated credential fixtures. The synthetic fixture previously stored in `server/tests/legacy-fixture.json` was removed after GitGuardian incident #39531385; it contained test-only data and was never used by application configuration. Removing it from the current tree does not remove the historical commit or close the GitGuardian incident.
