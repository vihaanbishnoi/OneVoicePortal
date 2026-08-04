# OneVoice Portal

OneVoice Portal is a meeting-management web app for recording employee forums,
capturing the discussion, assigning follow-up actions, and keeping everyone
updated on progress.

**Live demo:** [Open OneVoice Portal](https://onevoiceportal.onrender.com/)

Instead of relying on separate notes, spreadsheets, and message threads, a
meeting and its action items are kept together in one place. Teams can revisit
past meetings, search records, add follow-up remarks, and export their data to
Excel when needed.

## What you can do

- Log a meeting with its forum type, date, department, facilitator, and participants.
- Record discussion points, priority, category, action item, and action owner.
- View previous meetings and drill into each action item.
- Add and review a chronological history of HR and action-owner remarks.
- Search meeting records by forum type and date range.
- Export all meeting information to an Excel workbook.

## How it works

The application has two parts:

- A React web interface where users create and review meeting records.
- A Flask API that stores those records in a local SQLite database.

When you run the project locally, both parts need to be running: the frontend
opens in your browser and communicates with the backend API in the background.

## Run locally

### Before you start

Install the following on your computer:

- Python 3.10 or newer
- Node.js 20 or newer

### 1. Download the project

Clone the repository and open its folder in PowerShell:

```powershell
git clone https://github.com/vihaanbishnoi/OneVoicePortal.git
cd OneVoicePortal
```

### 2. Start the backend

In the project folder, run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python backend\app.py
```

Keep this terminal open. The backend will run at `http://localhost:5000` and
will create the local database automatically the first time it starts.

### 3. Start the frontend

Open a second PowerShell terminal in the same project folder and run:

```powershell
cd frontend
npm install
npm run dev
```

Open the link displayed in the terminal, usually `http://localhost:5173`.
You can now create and manage meetings locally.

## Project structure

```text
.
|-- backend/
|   `-- app.py              # Flask API and database logic
|-- frontend/
|   |-- src/                # React pages and user interface
|   `-- package.json        # Frontend dependencies and scripts
`-- requirements.txt        # Python dependencies
```

## Technology used

- **Frontend:** React, Vite, React Router
- **Backend:** Python, Flask, Flask-CORS
- **Database:** SQLite

## Useful frontend commands

Run these from the `frontend` folder:

```powershell
npm run dev      # Start the local development site
npm run build    # Create a production build
npm run lint     # Check the frontend code for common issues
npm run preview  # Preview a production build locally
```
