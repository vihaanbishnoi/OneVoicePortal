# OneVoice Portal

A full-stack application for turning employee meeting discussions into trackable actions. OneVoice brings meeting records, owners, deadlines, follow-up conversations, and AI-assisted drafting into one workspace.

**[Open the demo](https://onevoiceportal.onrender.com/)** · [Frontend source](frontend/src) · [Backend source](backend)

Select **Open demo** to get an editable workspace with fictional meetings and conversations. No account or password is required. Each visitor gets a separate sample workspace for 12 hours; please use fictional data only. The hosted app may take a moment to start after being idle.

## The problem

Employee concerns often get split across meeting notes, spreadsheets, and email threads. That makes it difficult to see who owns the next step, what has changed, and which actions still need attention. OneVoice keeps a meeting and its follow-up history together so the next action is easier to find.

## Try it in a few minutes

1. Open **Previous meetings** and select a sample meeting to see its discussion points and assigned actions.
2. Open an action to review its email conversation, change its owner or status, and record a follow-up remark.
3. Use **New meeting** to add a fictional meeting and its action items.
4. Check **Calendar** for meeting dates and action deadlines, then use **Reports & exports** to download a CSV archive.
5. Try the **Conversation assistant** to summarize a sample conversation or generate an email draft when demo AI is available.

AI generation depends on the configured provider and usage allowance. Generated text is editable and requires review; the application does not automatically send email. Gmail connections and the private Admin workspace are reserved for the administrator.

## Features

| Area | What it supports |
| --- | --- |
| Meeting records | Employee discussion forums, departments, facilitators, participants, and discussion points |
| Action tracking | Owners, contact details, priorities, due dates, statuses, and follow-up remarks |
| Conversations | A chronological view of email messages and notes alongside each action |
| Calendar and notifications | Meeting dates, action deadlines, and follow-up notifications |
| Reporting | CSV archives filtered by year, calendar quarter, or month |
| AI assistance | Conversation summaries and editable follow-up email drafts |
| Private integrations | Gmail OAuth, linked-thread imports, reply synchronization, and unsent Gmail drafts |

## How it is built

The React frontend calls a Flask API, which stores meeting and action data in PostgreSQL. The Docker image builds and serves the frontend and API from a single origin.

| Layer | Technology |
| --- | --- |
| Frontend | React, React Router, Vite, CSS |
| Backend | Python, Flask, SQLAlchemy |
| Database | PostgreSQL |
| AI | OpenAI for fictional demo conversations; Ollama for private workspace conversations |
| Email integration | Gmail API and OAuth |
| Deployment | Docker and Render |

## Engineering highlights

- **Session isolation:** signed demo sessions scope backend queries to each visitor's sample records and keep private workspace data separate.
- **Authorization:** protected API routes enforce access on the server, including Admin-only integration and activity endpoints.
- **Integration handling:** Gmail tokens are encrypted, imported messages are deduplicated, and missing AI or Gmail configuration produces a clear error.
- **Bounded AI requests:** context and usage limits constrain generation, with explicit provider routing and human review of drafts.
- **Data continuity:** additive schema migrations preserve existing records, and recording timestamps retain the distinction between known and missing historical dates.

## Validation and source

The automated backend suite contains **43 tests** covering authentication, demo isolation, editing limits, exports, Gmail integration behavior, AI routing, migrations, and startup configuration. Frontend lint and the production build also pass. The default test suite uses an isolated database and mocked external providers; model quality is assessed separately.

- [Authentication tests](tests/test_auth.py)
- [Workspace and integration tests](tests/test_workspace.py)
- [Deployment configuration tests](tests/test_config.py)
- [AI evaluation approach](docs/AI_EVALUATION.md)

For a closer technical review, see the [developer guide](docs/DEVELOPMENT.md), [deployment notes](docs/DEPLOYMENT.md), and [Gmail integration setup](docs/GMAIL_SETUP.md).
