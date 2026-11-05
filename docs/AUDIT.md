# Source audit — 5 November 2026

Scope: all 52 files tracked at `910c0a5`. Reviewed the handwritten backend,
frontend, SQL, tests, scripts, configuration, assets and documentation. Traced
routes, imports, frontend calls, permission checks and retained migration
compatibility. Both dependency manifests and lockfiles were checked through npm;
third-party package source was not individually audited. Ignored local secrets,
databases, virtual environments and generated build files are outside cleanup.

## Changes

- Removed unused account-list/create routes. Created accounts could not pass the
  deliberately restricted login policy, and no frontend used these endpoints.
  Existing user records and owner references remain intact.
- Removed obsolete dashboard/badge/fieldset CSS, unused cached user writes,
  a redundant frontend ignore file, unused configuration and imports/re-exports.
  Shared action/meeting timestamp updates now have one implementation.
- Startup rejects malformed numeric quotas and runtime settings, overlong admin
  passwords and shared login without a configured password. A zero demo quota
  means no operations allowed; it does not disable quota enforcement.
- Database connection acquisition has a timeout. Record IDs are bounded to the
  PostgreSQL integer range, and year-zero dates return validation errors.
- Participant records retain only validated, trimmed name/employee-ID fields;
  participant editing no longer mutates previous React state.
- Mixed imported/pasted conversations sort by sent time or recording time.
  Missing Gmail timestamps no longer invent a January 1970 date.
- Navigation between record IDs remounts the record page, clearing stale form
  and record state. Successful action creation updates the visible meeting time
  and clears earlier submission errors. Participant inputs have accessible names.
- Exports preserve legacy owner names; download names distinguish months and
  quarters. API base URLs accept trailing slashes.
- Gmail provider errors are sanitized; failed syncs are reported to the UI
  instead of showing successful refreshes. Disconnect deletes pending OAuth
  states. An origin-checked, one-use top-level POST handoff sets the callback
  cookie without requiring third-party cookie acceptance. PKCE, signed cookies
  and replay checks remain. Unicode subjects and reference headers are folded.
- Password login is capped at 30 attempts per rolling minute across the service,
  before password hashing, using a database lock and audit reservations. This
  shared cap protects the small fixed-account application; abuse can temporarily
  delay legitimate sign-in. Demo entry has its separate existing quota.
- Updated frontend tooling dependencies to resolve reported advisories. ESLint
  10 currently requests vulnerable minimatch 10; a temporary minimatch 11.0.1+
  override selects the patched version. Lint and build pass with that override.
  Remove the override once upstream dependencies use a patched range.
- Corrected the example API address, documented the current split deployment,
  clarified encryption-key setup and excluded server tests from Docker context.

## Verification

- `npm test`: 22 passing tests, using isolated PGlite databases, HTTP fixtures
  and mocked Gmail/AI services. Includes tenant isolation, authentication,
  migration preservation, quotas, CRUD, calendar, CSV escaping, OAuth state,
  credentials, Gmail deduplication/drafts, disconnect and sync failures.
- Frontend ESLint and production Vite build pass.
- Backend undefined-variable and unused-variable checks pass.
- npm audit reports zero known vulnerabilities for both dependency trees after
  the updates. This is an advisory check, not proof of dependency security.
- No tracked Python implementation or Python requirements remain. Password hash
  and credential-format compatibility code is still required for existing data.

## Remaining findings and verification limits

1. **Live integrations:** the OAuth handoff and callback security checks pass
   HTTP-level tests. Real browser/Google consent on the Render origins and real
   mailbox permissions still require verification.
2. **Traffic policy:** the login cap is service-wide, not per visitor IP. An
   upstream per-client policy would improve availability under sustained abuse.
3. **Retention:** expired demo workspaces remain in the database. A deletion
   policy and scheduled cleanup need to account for related rows and audit
   retention. No production records were deleted by this audit.
4. **Gmail draft atomicity:** an external draft can be created before a later
   database/audit write fails. Retrying could create another unsent draft. Check
   Gmail drafts after ambiguous failures; no automatic sending is implemented.
5. **Operational coverage:** real PostgreSQL/TLS behavior, concurrent instances,
   live AI providers, browser navigation/accessibility, Docker execution and
   Render rollout were not end-to-end tested in this pass. PGlite serializes
   test queries, so its passing tests do not prove multi-process locking behavior.

This is a complete first-party source review with the above boundaries, not a
claim that every possible runtime path is bug-free or that live integrations
have all been verified.
