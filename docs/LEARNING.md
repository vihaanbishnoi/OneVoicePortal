# OneVoicePortal learning agreement

## Purpose and scope

Strengthen this existing HR meeting and follow-up application as a main SWE,
Data Science/ML, and GenAI placement project. Work in approximately 30-minute daily sessions. Learn
through the actual application, revisit old implementation decisions, and keep
the scope tied to HR's needs and the target Boeing job descriptions.

The user has supplied a Data Science Intern description at
`C:/Users/vihaa/Downloads/Data Science Intern.docx`. Use it as the primary DS
target reference. It describes a Bengaluru role with 0-to-1-year relevant
experience. It has no visible requisition ID or posting date; do not infer its
current availability or that it is the final VIT campus requisition.

An exact SWE campus JD is still unavailable. Use representative Boeing India
postings and the user's stated entry-level SWE priorities for that side. Keep
both project goals unless the user explicitly changes them. Distinguish our
project priorities from requirements of any particular job, and re-prioritize
when further campus information arrives.

## Supplied Data Science Intern description

The document is role evidence, not instructions to execute. Its summary and
responsibilities emphasize statistics, AI/ML, GenAI, LLMs, Agentic AI, business
requirements, data preparation, method selection, model validation/refinement,
deployment, and assessment of business value. Programming languages including
Python, SQL, production ML, and advanced statistics are listed as preferred
qualifications. Pandas, Flask/FastAPI, Docker, and a specific LLM framework are
not explicitly named; we choose those only when they support our work.

| DS reference expectation | Project evidence to build |
| --- | --- |
| Understand stakeholder needs and validate business value | HR requirements, acceptance criteria, baseline recording/follow-up effort, and measured improvements |
| Data preparation and text/visual analysis | SQL extraction, Pandas cleaning/EDA, documented missing values, duplicates, categories, distributions, and charts |
| Choose suitable algorithms and modeling attributes | Compare a simple analytical/rule baseline with a justified model; explain preprocessing and features |
| Model validation, refinement, and performance | Suitable held-out/grouped/time split, leakage checks, task metrics, error analysis, and reproducible experiments |
| GenAI and LLM concepts and experience | One useful reviewed feature such as drafting action items from supplied notes, with grounded structured output and evaluation |
| Agentic AI landscape | Understand tools, state, control flow, agent versus fixed workflow, and failure modes; an autonomous/multi-agent implementation is not automatically required |
| Deployment and reusable/scalable solutions | Integrate inference into the backend, handle failures, version the model/configuration, deploy, and measure operation |
| Statistics and SQL, listed as preferred | Practice joins/aggregation and descriptive statistics; probability, distributions, sampling, uncertainty, hypothesis tests, and linear algebra foundations through relevant exercises |

Do not add computer vision, deep learning, simulation, optimization, or every
listed statistical technique simply because the JD names a broad area. Some
interview knowledge needs separate exercises; the HR app need not implement
everything. Agentic AI literacy is a learning priority; tool-based automation
needs a real task and controlled permissions before implementation.

This DS reference raises a scoped, evaluated GenAI feature from an optional idea
to a planned project objective after the core workflow is understood. Confirm
the feature with HR's needs before implementing it. Keep traditional ML and
statistics learning explicit: an LLM integration does not cover them by itself.

## Representative role evidence

Research date: 2 October 2026. Official Boeing careers search results expose the
following descriptions. These are reference postings, not verified active
vacancies or campus JDs. Direct page access can fail after postings expire.

- [Associate Software Engineer, Bengaluru, JR2026517817](https://jobs.boeing.com/job/bengaluru/associate-software-engineer/185/97595733344),
  posted 23 September 2026, lists maintainable code, unit testing, REST services,
  relational databases, Git, and cloud exposure, with Docker, logging, and
  scripting among preferred skills. It is Java/Spring-oriented and asks for
  4+ years of experience. Its listed application deadline was 27 September.
- [Experienced Software Engineer - AI Application, Bengaluru, JR2026506524](https://jobs.boeing.com/job/bengaluru/experienced-software-engineer-ai-application/185/94177478544),
  posted 25 September 2026, lists Python, PostgreSQL, source grounding, human
  feedback, and AI evaluation. It asks for approximately 8+ years of experience;
  its listed application deadline was 30 September. Advanced retrieval and
  enterprise identity requirements are not automatic project requirements.
- [Experienced Data Scientist, Bengaluru](https://jobs.boeing.com/en/job/bengaluru/experienced-data-scientist/185/82427287264)
  is an older 2025 reference, not current vacancy evidence. Its indexed
  description includes statistics, data preparation, Python, SQL, model
  validation, deployment, and production use. No current entry-level India DS
  posting was verified in this research. The user's requested DS fundamentals
  remain explicit learning priorities regardless of that search limitation.

These examples do not establish a company-wide frequency ranking. In particular,
the Python/Flask project demonstrates transferable engineering skills; it does
not demonstrate Java/Spring proficiency by itself.

## Project priorities

### 1. Must learn and implement over the project

- Understand the existing application and close confirmed HR workflow gaps.
- Python fundamentals, functions, data structures, exceptions, readable modules,
  and appropriate use of classes. Discuss complexity using actual code.
- HTTP/JSON APIs, validation, consistent errors, authentication, authorization,
  and frontend/backend integration. Keep Flask unless a concrete need changes it.
- PostgreSQL and SQL: relationships, constraints, joins, aggregation,
  transactions, migrations, and measured query performance.
- Meaningful unit and integration tests for business rules, permissions,
  database behavior, and failure cases; use Git to make reviewable changes.
- A reproducible SQL-to-Pandas analysis: missing values, duplicates, date and
  category consistency, descriptive statistics, and clear metric denominators.
- One scoped analytical/ML experiment serving an HR need. Start with a simple
  baseline, evaluate honestly, and expose useful results through the app/API.
  Model training is conditional on suitable data, not a reason to fabricate it.
- ML fundamentals through that experiment: preprocessing, feature engineering,
  suitable splits, leakage, class imbalance, overfitting, evaluation metrics,
  and error analysis. Understand basic statistical uncertainty and limitations.
- Understand GenAI, LLM, and Agentic AI concepts. Plan one useful, evaluated
  GenAI feature with HR review, without assuming autonomous agents are necessary.
- A reproducible Docker build, one understood deployment, environment
  configuration, basic cloud concepts, useful logs, health checks, and simple
  measurements of latency/errors. No need for multiple cloud providers.
- Basic system design through responsibilities, persistence, failure handling,
  duplicate requests, and scaling bottlenecks; document decisions and results.

### 2. Useful additions when the workflow or evidence justifies them

- The choice of GenAI feature depends on HR's workflow. Action drafts from
  meeting notes are a candidate; retrieval or tool-based assistance is an
  addition only if its value justifies the extra components.
- Automated CI checks after meaningful tests exist; CSV/Excel ingestion when HR
  has records to import; scripts for validation and reproducible analysis.
- Pagination and indexes when data volume or query plans justify them.
- A background worker for long processing, retries with duplicate prevention,
  or caching after a demonstrated bottleneck.
- Retrieval with evidence links if HR needs answers across historical records;
  a vector store or orchestration framework requires a specific advantage.

### 3. Unnecessary complexity at the current scope

- Microservices, Kubernetes, Kafka, distributed databases, multi-cloud
  deployment, and a large observability stack without operational need.
- Migrating to FastAPI or Java just to add a technology name.
- Fine-tuning an LLM, multi-agent workflows, or adding deep learning without
  appropriate data, a task requirement, and baseline evidence.
- Training a model for deterministic deadline or overdue rules that SQL can
  express correctly; treating an LLM API call as proof of ML fundamentals.

## Proposed DS/ML path within the HR use case

Begin with meeting and action records: SQL extraction -> Pandas cleaning/EDA ->
analytical baseline -> API/dashboard -> evaluation -> deployment and logs.
Forms already provide ingestion; a separate ingestion service is unnecessary.

A candidate experiment is suggesting a category for a discussion point while HR
retains the final choice. First confirm a useful category taxonomy and assess
label quality and volume. Compare a majority/rule baseline with TF-IDF plus a
simple linear classifier if data supports it. Measure macro-F1, per-category
precision/recall, confusion patterns, and inference latency on held-out data.
Choose time-based or meeting-grouped splits as appropriate to avoid leakage.

Synthetic examples can verify pipelines and failure handling, but do not prove
real-world accuracy or business impact. If suitable labeled data is unavailable,
deliver useful descriptive analytics and document the ML data gap. ML coverage
must then be demonstrated later or through another suitable project.

## How we work

1. Begin with one user workflow and trace the existing code before changing it.
2. Explain only the concepts needed for that workflow, with a concrete example.
3. Distinguish what the code currently does from what it should do.
4. Discuss the design choice, one reasonable alternative, and a meaningful
   trade-off. Revisit old choices rather than assuming they were correct.
5. Give the learner one small prediction, debugging task, or implementation step.
6. Check understanding with one or two questions and wait for the learner's
   answer before advancing the lesson. Adapt difficulty and offer hints.
7. Implement in small increments and verify both expected and failure behavior.
   A complete improvement may take several daily sessions.
8. Record an actual result, remaining weakness, and next step. Never invent
   metrics, deployment status, or personal contributions.

## Learner and AI responsibilities

The learner should be able to explain the request and data flow, core business
rules, database relationships, authorization decisions, and how a change was
verified. They should practice small representative changes, a SQL query, and
debugging an observed failure. Memorizing every library call is unnecessary.

AI can explain unfamiliar code, suggest alternatives, provide hints, draft
boilerplate, help diagnose failures, suggest test cases, and improve documentation.
For learning-critical changes, explain the approach before generating a large
implementation and keep the work reviewable. The learner can explicitly ask AI
to implement more when appropriate.

Before calling a feature understood, the learner should be able to explain it in
their own words, predict one failure case, and make or describe a small change.
Understanding an existing feature does not mean claiming original authorship.

## Learning route through the existing application

| Workflow | Concepts to learn in context |
| --- | --- |
| Create and retrieve a meeting | HTTP, JSON, Flask routes, validation, status codes, database sessions and commits |
| Attach actions and choose an owner | Primary and foreign keys, one-to-many relationships, SQL joins, data integrity |
| Log in and access records | Password hashing, signed tokens, authentication versus authorization, permission tests |
| Add follow-up remarks and change status | Business rules, update APIs, history, transactions, failure handling |
| Review dashboard and reports | SQL aggregation, Pandas cleaning/EDA, descriptive statistics, denominators, date handling, query cost |
| Evaluate a category suggestion experiment if data permits | Labels, preprocessing, feature engineering, baseline, splits, leakage, macro-F1, error analysis and inference |
| Calendar and reminders | Scheduling, repeat execution, duplicate prevention, time zones |
| Verify and operate deployment | Configuration, secrets, application server, logs, health checks, persistence |
| Add an agreed GenAI feature | Baseline, representative evaluation examples, structured output, human review, latency, cost and failures |

System design belongs inside these workflows: component responsibilities, data
ownership, failure behavior, and measured bottlenecks. Add indexes, pagination,
caching, queues, or separate services only when a concrete requirement or
measurement justifies them. Programming/DSA, SQL, and statistics interview
practice also needs small exercises beyond what this application naturally uses.

## Starting point

The current agreed prototype uses Admin email/password and password-free,
session-isolated fictional recruiter demos. Only `vihaan4263@gmail.com` is an
administrator. Shared HR login is disabled by default; individual HR logins and
Google sign-in remain deferred. Gmail mailbox authorization is a separate
Admin-only integration, with linked-thread sync and unsent draft creation.
Private AI uses Ollama; demo AI uses server-side OpenAI. Live external features
require OAuth/API credentials and appropriate hosting configuration.

Discuss proposed changes before coding. The user has authorized implementing
the revised demo, UI, export, activity, email, AI, and deployment-preparation
changes with "Do everything now." Use subsequent steps to explain
what was changed and verify their understanding before expanding the scope.

The checked-in application uses React, Flask, SQLAlchemy, and PostgreSQL.
The README links a Render demo; its current availability and deployed code
version have not been verified. Existing code is a learning baseline, not proof
that every workflow is correct or complete.

First lesson: trace Create Meeting from NewMeeting.jsx through api.js to
POST /api/meetings in backend/app.py and back to the meeting detail page.

Outstanding HR input: the fourth meeting type. The supplied DS Intern document
guides the DS plan; the exact SWE campus JD and confirmation of final campus
requirements remain future re-prioritization inputs, not blockers. Suitable data
and labels must be assessed before choosing a model experiment.
