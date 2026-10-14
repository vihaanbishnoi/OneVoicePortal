# Deploy the recruiter demo

The Docker image serves the built React frontend and Flask API from one origin.
It requires a reachable PostgreSQL database. The PostgreSQL container on your
laptop is for local development and is not reachable by a hosting server.

## Local verification

Use the two-terminal development setup from README.md, or build the frontend and
open the backend's root URL to use the same-origin version:

```powershell
cd frontend
npm.cmd run build
cd ..
.\.venv\Scripts\python.exe backend\app.py
```

Health is at `/api/health`; `/` serves the website after a frontend build.
Startup runs an additive schema migration. It does not invent creation times
for historical meeting rows. Back up a production database before upgrades.

## Existing Render service

The `Optimization` commit introduced a required `ADMIN_PASSWORD` and public
startup checks. Render sets `RENDER=true`, so these checks apply even if
`PUBLIC_DEPLOYMENT` is unset or 0. A missing/short Admin password, a signing key
shorter than 32 characters, or enabled shared HR login stops the API before it
can listen for requests. A failed deployment notification alone does not tell
which setting failed; use the traceback from the deploy logs when available.

On the existing **onevoice-api** service's Environment page, set
`ADMIN_PASSWORD` to a strong password of at least 12 characters, ensure
`SECRET_KEY` has at least 32 characters, and set `ALLOW_SHARED_HR_LOGIN=0`.
Keep the signing key stable if it already meets the requirement. These are
server credentials; recruiters still enter the demo without a password.
Never copy the short local development password into a public service.

Check configuration locally without accessing any meeting data:

```powershell
.\.venv\Scripts\python.exe -m backend.config --public
```

This checks local environment settings, not Render's settings or database
connectivity. Errors name every invalid setting and never print its value.

1. Publish the reviewed code to the repository connected to your Render service.
2. Use the Docker runtime with this repository's Dockerfile. `render.yaml` is a
   configuration template; check your existing service plan rather than creating
   duplicate services. No hosting purchase has been made by this implementation.
3. Configure `DATABASE_URL` to a hosted PostgreSQL connection string,
   `PUBLIC_DEPLOYMENT=1`, `ALLOW_SHARED_HR_LOGIN=0`, and `DEMO_ENABLED=1`.
4. Set a random `SECRET_KEY` (32+ characters) and a strong `ADMIN_PASSWORD`
   (12+ characters). The only Admin email remains `vihaan4263@gmail.com`.
   The local demo password is deliberately rejected for public deployment.
5. Set `FRONTEND_URL` to the site's HTTPS origin. On Render its external URL is
   used automatically if this setting is omitted. Configure the OAuth callback
   and Gmail keys as described in GMAIL_SETUP.md.
6. Put `OPENAI_API_KEY` in server environment settings, not in the frontend.
   `OPENAI_MODEL` defaults to `gpt-4.1-mini` and can be changed after evaluation.
   Missing keys produce a clear setup message; outputs are never fabricated.
7. Use `/api/health` as the service health-check path and verify the demo, Admin
   sign-in, CSV exports, and isolation after deployment. Private Ollama features
   need a reachable local/private inference service; they are never automatically
   sent to OpenAI when unavailable.

If the existing service uses Render's native Python runtime, adding `render.yaml`
or a Dockerfile does not change that service's runtime automatically. From the
repository root, install with `pip install -r requirements-lock.txt` and start
with `gunicorn backend.app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 240`.
For a service whose Root Directory is `backend`, use
`pip install -r ../requirements-lock.txt` and `gunicorn app:app` with the same
server flags. Native API-only hosting also needs a separately built frontend:
set its `VITE_API_BASE_URL` to the API's HTTPS URL ending in `/api`, and set the
API's `CORS_ORIGINS` and `FRONTEND_URL` to that frontend's HTTPS origin.
The Docker setup builds both parts and serves them from one origin.

After saving the required settings and publishing the code, redeploy the existing
service and verify `/api/health`, password-free demo creation, and Admin sign-in.
If startup still fails, the new logs will identify a configuration error or show
a traceback for the remaining issue. Do not create another service to troubleshoot.

## Free PostgreSQL with Neon

The existing Render API can connect to a Neon PostgreSQL database. Copy the
complete connection URL from Neon's Connect dialog into the Render service's
`DATABASE_URL`, including its SSL parameters. Use the URL itself rather than
a `psql` command or an environment-variable assignment. The app creates its
tables on startup and seeds fictional records when a visitor opens a demo.

Standard `postgres://` and `postgresql://` URLs are normalized to
`postgresql+psycopg2://` to select the driver installed by this project's
requirements. This avoids SQLAlchemy 2.1 selecting the separate `psycopg`
driver for a bare `postgresql://` URL. Credentials and SSL parameters are
preserved. The configuration checker applies the same normalization.

Sources: [Neon connection strings](https://neon.com/docs/connect/connect-from-any-app),
[SQLAlchemy PostgreSQL drivers](https://docs.sqlalchemy.org/en/21/dialects/postgresql.html).

## Operational limits

- Each anonymous demo creates a separate fictional workspace and expires after
  12 hours. Admin can see session events, not verified recruiter identities.
- Demo editing is limited to 100 writes per session and 1,000 across the server
  per rolling day; each edit is capped at 12 KB. Read-only browsing and private
  Admin edits do not consume this allowance.
- OpenAI demo generation defaults to five attempts per session and fifty per
  rolling 24 hours across the server. Failed provider attempts count toward the
  allowance. Also set provider-side budget alerts/limits in your OpenAI project.
- Gmail polling runs in one process. The image uses one Gunicorn worker and four
  threads. PostgreSQL locks serialize sync and quota reservation. A future larger
  deployment should move polling into a dedicated worker/queue.
- Render's free web service sleeps after idle periods, so polling pauses while
  it is asleep and resumes after startup. Always-on email monitoring needs an
  appropriate always-on service/job. Free Render Postgres also has a limited
  lifetime; check its current expiration policy before relying on it for a demo.
- Logs contain method, path, status, and duration. They omit bodies, credentials,
  OAuth callback query strings, and conversation text.
- CSV downloads are ZIP archives of related business tables, filtered by meeting
  date using calendar-year quarters. Credentials and mailbox tokens are excluded;
  potentially executable spreadsheet formulas are escaped.
- Expired demo records are currently retained for audit/debugging. Before longer
  public operation, define a retention policy and scheduled cleanup; the daily
  creation cap limits new sessions but is not a retention mechanism.
- Local-only inference does not make the entire hosted application local. The
  database and Gmail access need their own access controls and deployment policy.

Sources: [Render Flask deployment](https://render.com/docs/deploy-flask),
[OpenAI Python SDK](https://developers.openai.com/api/docs/libraries),
[Ollama deployment and privacy](https://docs.ollama.com/faq).
