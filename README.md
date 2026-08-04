# OneVoice Portal

OneVoice Portal is a lightweight meeting companion for recording meetings, tracking discussion points and action items, capturing follow-up remarks, and exporting records for reporting.

The project has a React frontend and a Flask REST API backed by SQLite.

## Features

- Create meeting records with forum details and participant information.
- Add discussion points, categories, priorities, action items, and action owners.
- Keep a chronological history of action-owner and HR remarks.
- Browse meeting and action-item details in the web interface.
- Search meetings by forum type and date range.
- Export all stored meeting data to an Excel workbook.

## Tech stack

- Frontend: React 19, Vite, React Router
- Backend: Python, Flask, Flask-CORS
- Database: SQLite

## Project structure

```text
.
|-- backend/
|   `-- app.py              # Flask API and SQLite data access
|-- frontend/
|   |-- src/                # React application
|   `-- package.json        # Frontend scripts and dependencies
`-- requirements.txt        # Python dependencies
```

## Run locally

### Prerequisites

- Python 3.10 or later
- Node.js 20 or later

### 1. Start the API

From the repository root, create and activate a virtual environment (recommended), then install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python backend\app.py
```

The API runs at `http://localhost:5000`. On first start, it creates `backend/database.db` automatically.

### 2. Start the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints in the terminal, normally `http://localhost:5173`.

### Configure the API target

The frontend uses `http://localhost:5000/api` during local development and
falls back to the deployed Render API in production. To override either target,
set `VITE_API_BASE_URL` before building the frontend.

For the deployed static site, configure this Render environment variable and
redeploy:

```text
VITE_API_BASE_URL=https://onevoice-api-89c5.onrender.com/api
```

Use `frontend/.env.example` as the local configuration reference. Keep actual
`.env` files out of Git.

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | API health response |
| `GET`, `POST` | `/api/meetings` | List or create meetings |
| `GET` | `/api/meetings/:id` | Retrieve a meeting and its logs |
| `POST` | `/api/meetings/:id/logs` | Add a discussion/action log |
| `GET`, `PATCH` | `/api/logs/:id` | Retrieve a log or add remarks |
| `GET` | `/api/reports/search` | Filter meetings by category and date range |
| `GET` | `/api/reports/export` | Download all records as an Excel workbook |

## Available scripts

Run these from `frontend/`:

```powershell
npm run dev      # Start the Vite development server
npm run build    # Build the frontend for production
npm run lint     # Lint frontend source files
npm run preview  # Preview a production build
```
