# Connect Gmail to OneVoicePortal

The integration is implemented, but Google authorization requires your Google
Cloud project and your consent. Gmail access is restricted to the authenticated
Admin workspace. Recruiter demos never use a connected mailbox.

1. Open https://console.cloud.google.com/ and create or select a project.
2. Open APIs and Services, Library, and enable the Gmail API.
3. Configure Google Auth Platform branding, audience, and data access. For local
   development use Testing and add the Gmail account you will authorize as a test
   user. Follow Google's current consent-screen prompts.
4. Create an OAuth client with application type Web application. Add this exact
   authorized redirect URI for your normal local backend:

   `http://localhost:5000/api/gmail/callback`

   For deployment add `https://YOUR-SITE/api/gmail/callback` as well.
5. Put the client ID and client secret in your ignored `.env`, never in a React
   file or Git. Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and
   `GMAIL_REDIRECT_URI`. Set `GMAIL_TOKEN_ENCRYPTION_KEY` to a freshly generated 32-byte base64 key for a new installation. Reuse the existing key when upgrading.
   Keep that key stable: changing it makes saved mailbox credentials unreadable.
6. Restart the backend. Sign in as Admin, open Gmail connection, and click
   Connect Gmail. Choose the intended mailbox and review Google's consent screen.
   Google sign-in for access to the website is a different feature.
7. Open an action, search for an email conversation, and link that thread. The
   initial import adds its history without treating historical replies as new
   alerts. New messages are checked every `GMAIL_POLL_SECONDS` while the backend
   is running, and new incoming replies create notifications. Sync now is also
   available. The conversation view refreshes every 30 seconds.
8. Generate or edit an email draft. Review the recipient, facts, subject, and
   body. Save draft to Gmail creates an unsent draft; open Gmail to review and
   send it yourself. Later replies stay linked through the Gmail thread ID.

For separate frontend/API origins, configure `FRONTEND_URL` and `CORS_ORIGINS`
to the frontend origin and `GMAIL_REDIRECT_URI` to the API callback. Authorization
uses a one-time form handoff validated against the initiating frontend origin;
it sets the signed callback cookie during top-level navigation.

The requested scopes are `gmail.readonly` and `gmail.compose`. These scopes can
require Google's verification/review depending on the app's publishing and data
handling. A development test-user setup is not a substitute for production
verification. Google may require reauthorization for testing apps.

The prototype imports plain-text/HTML message text; attachments are excluded.
It identifies duplicate messages by action, source, and Gmail message ID.
Disconnect removes the saved credentials from the portal. You can additionally
revoke the app's access from your Google account's connected-app settings.

Copy/paste is available when authorization is unavailable. Pasted messages have
a recording timestamp; an original email timestamp is not invented.

Sources: [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server),
[Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[Gmail threads](https://developers.google.com/workspace/gmail/api/guides/threads).
