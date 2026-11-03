import { google } from 'googleapis';
import { randomBytes, createHash } from 'node:crypto';
import { convert } from 'html-to-text';
import { rows, one, insert, transaction } from './db.js';
import {
  ADMIN_EMAIL,
  version,
  encryptCredentials,
  decryptCredentials,
} from './security.js';
import { fail, field } from './domain.js';

const scopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];
export const configured = (env) =>
  [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_TOKEN_ENCRYPTION_KEY',
  ].every((k) => Boolean(env[k]));
function oauth(env) {
  if (!configured(env))
    fail(
      'Gmail setup is incomplete. Follow docs/GMAIL_SETUP.md and configure the client credentials on the server.',
      503,
    );
  if (Buffer.from(env.GMAIL_TOKEN_ENCRYPTION_KEY, 'base64url').length !== 32)
    fail('Configure a valid Gmail token encryption key.', 503);
  return new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/gmail/callback',
  );
}
export async function serviceFor(db, userId, env) {
  const connection = await one(
    db,
    'SELECT * FROM gmail_connections WHERE user_id=$1 FOR UPDATE',
    [userId],
  );
  if (!connection) fail('Connect Gmail in the Admin Gmail page first.', 503);
  try {
    const info = decryptCredentials(
      connection.encrypted_credentials,
      env.GMAIL_TOKEN_ENCRYPTION_KEY,
    );
    const auth = oauth(env);
    // Python Credentials.to_json uses token/expiry; accept both formats.
    auth.setCredentials({
      ...info,
      access_token: info.access_token || info.token,
      expiry_date:
        info.expiry_date ||
        (info.expiry
          ? Date.parse(
              info.expiry.endsWith('Z') ? info.expiry : info.expiry + 'Z',
            )
          : undefined),
    });
    await auth.getAccessToken();
    await saveCredentials(db, userId, auth.credentials, env);
    return { service: google.gmail({ version: 'v1', auth }), connection };
  } catch (error) {
    if (error.status) throw error;
    fail(
      'Gmail authorization is unavailable or expired. Reconnect Gmail.',
      503,
    );
  }
}
async function saveCredentials(db, userId, tokens, env) {
  const portable = {
    ...tokens,
    token: tokens.access_token,
    expiry: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : undefined,
    client_id: env.GMAIL_CLIENT_ID,
    client_secret: env.GMAIL_CLIENT_SECRET,
    token_uri: 'https://oauth2.googleapis.com/token',
    scopes,
  };
  await db.query(
    'UPDATE gmail_connections SET encrypted_credentials=$1 WHERE user_id=$2',
    [encryptCredentials(portable, env.GMAIL_TOKEN_ENCRYPTION_KEY), userId],
  );
}
const headers = (message) =>
  Object.fromEntries(
    (message?.payload?.headers || []).map((h) => [
      h.name.toLowerCase(),
      h.value,
    ]),
  );
export function messageBody(payload) {
  const plain = [];
  const html = [];
  const visit = (part) => {
    if (!part.filename && part.body?.data) {
      const body = Buffer.from(part.body.data, 'base64url').toString('utf8');
      if (part.mimeType === 'text/plain') plain.push(body);
      else if (part.mimeType === 'text/html')
        html.push(convert(body, { wordwrap: false }));
    }
    for (const child of part.parts || []) visit(child);
  };
  visit(payload);
  return (plain.length ? plain : html).join('\n').trim();
}
async function touch(db, a) {
  await db.query('UPDATE actions SET updated_at=NOW() WHERE id=$1', [a.id]);
  await db.query('UPDATE meetings SET updated_at=NOW() WHERE id=$1', [
    a.meeting_id,
  ]);
}
export async function syncAction(
  db,
  service,
  connection,
  action,
  initial = false,
) {
  const { data: thread } = await service.users.threads.get(
    { userId: 'me', id: action.gmail_thread_id, format: 'full' },
    { timeout: 30000 },
  );
  let count = 0;
  for (const m of thread.messages || []) {
    if (m.labelIds?.includes('DRAFT')) continue;
    if (
      await one(
        db,
        "SELECT id FROM conversation_messages WHERE action_id=$1 AND source='gmail' AND external_id=$2",
        [action.id, m.id],
      )
    )
      continue;
    const h = headers(m);
    const sender = (h.from || '').slice(0, 255);
    const address = (sender.match(/<([^>]+)>/)?.[1] || sender)
      .trim()
      .toLowerCase();
    const incoming = address !== connection.mailbox.toLowerCase();
    await insert(db, 'conversation_messages', {
      action_id: action.id,
      sender,
      subject: (h.subject || '').slice(0, 500),
      body: messageBody(m.payload || {}) || m.snippet || '',
      direction: incoming ? 'incoming' : 'outgoing',
      source: 'gmail',
      external_id: m.id,
      sent_at: new Date(Number(m.internalDate || 0)),
    });
    await touch(db, action);
    if (incoming && !initial) {
      await insert(db, 'notifications', {
        user_id: connection.user_id,
        action_id: action.id,
        title: 'New email reply',
        body: `A reply arrived for action #${action.id}: ${action.category}.`,
      });
      count++;
    }
  }
  await db.query(
    'UPDATE gmail_connections SET last_synced_at=NOW(),last_error=NULL WHERE user_id=$1',
    [connection.user_id],
  );
  return count;
}
export async function syncGmail(pool, config, userId = null, services = {}) {
  return transaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(70102)');
    const connections = await rows(
      db,
      `SELECT g.* FROM gmail_connections g JOIN users u ON u.id=g.user_id WHERE u.active=true AND u.role='hr_admin' AND u.email=$1 AND ($2::int IS NULL OR u.id=$2)`,
      [ADMIN_EMAIL, userId],
    );
    let total = 0;
    for (const c of connections) {
      await db.query('SAVEPOINT gmail_sync');
      try {
        const { service, connection } = await (
          services.serviceFor || serviceFor
        )(db, c.user_id, config.env);
        const actions = await rows(
          db,
          `SELECT a.* FROM actions a JOIN meetings m ON m.id=a.meeting_id WHERE m.demo_session_id IS NULL AND a.gmail_thread_id IS NOT NULL AND a.gmail_mailbox=$1`,
          [connection.mailbox],
        );
        let added = 0;
        for (const a of actions)
          added += await syncAction(db, service, connection, a);
        await db.query(
          'UPDATE gmail_connections SET last_error=NULL WHERE user_id=$1',
          [c.user_id],
        );
        total += added;
        await db.query('RELEASE SAVEPOINT gmail_sync');
      } catch {
        await db.query('ROLLBACK TO SAVEPOINT gmail_sync');
        const message =
          'Gmail sync failed. Check the connection in Admin Gmail settings.';
        if (c.last_error !== message)
          await insert(db, 'notifications', {
            user_id: c.user_id,
            title: 'Gmail needs attention',
            body: message,
          });
        await db.query(
          'UPDATE gmail_connections SET last_error=$1 WHERE user_id=$2',
          [message, c.user_id],
        );
      }
    }
    return { new_replies: total };
  });
}

export function gmailRoutes(
  app,
  { pool, config, require, audit, getAction, eligible, job, services },
) {
  const env = config.env;
  const getService = (db, id) =>
    (services.serviceFor || serviceFor)(db, id, env);
  app.get('/api/gmail/status', require(), async (req, res) => {
    if (req.user.role !== 'hr_admin')
      return res.json({
        available: false,
        connected: false,
        demo: Boolean(req.demo),
      });
    const c = await one(
      pool,
      'SELECT * FROM gmail_connections WHERE user_id=$1',
      [req.user.id],
    );
    res.json({
      available: configured(env),
      connected: Boolean(c),
      mailbox: c?.mailbox ?? null,
      last_synced_at: c?.last_synced_at ?? null,
      last_error: c?.last_error ?? null,
    });
  });
  app.get('/api/gmail/start', require('hr_admin'), async (req, res) => {
    const auth = oauth(env);
    const state = randomBytes(32).toString('hex');
    const verifier = randomBytes(48).toString('base64url');
    const origin = req.get('X-Frontend-Origin');
    const allowed = [config.frontend, ...config.cors];
    await transaction(pool, async (db) => {
      await db.query(
        'DELETE FROM oauth_states WHERE expires_at < NOW() OR user_id=$1',
        [req.user.id],
      );
      await db.query(
        'INSERT INTO oauth_states (id,user_id,credential_version,verifier,return_origin,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          state,
          req.user.id,
          version(req.user),
          verifier,
          allowed.includes(origin) ? origin : config.frontend,
          new Date(Date.now() + 600000),
        ],
      );
    });
    res.cookie('onevoice_oauth', state, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.frontend.startsWith('https://'),
      maxAge: 600000,
      path: '/api/gmail',
    });
    res.json({
      url: auth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: scopes,
        state,
        code_challenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        code_challenge_method: 'S256',
      }),
    });
  });
  app.get('/api/gmail/callback', async (req, res) => {
    const state = req.signedCookies.onevoice_oauth;
    res.clearCookie('onevoice_oauth', {
      path: '/api/gmail',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.frontend.startsWith('https://'),
    });
    if (!state || state !== req.query.state)
      fail(
        'Gmail connection request expired or invalid. Start again from Admin.',
        400,
      );
    const pending = await one(
      pool,
      'DELETE FROM oauth_states WHERE id=$1 AND expires_at > NOW() RETURNING *',
      [state],
    );
    if (!pending)
      fail(
        'Gmail connection request expired or invalid. Start again from Admin.',
        400,
      );
    const user = await one(pool, 'SELECT * FROM users WHERE id=$1', [
      pending.user_id,
    ]);
    if (
      !eligible(user) ||
      user.role !== 'hr_admin' ||
      pending.credential_version !== version(user)
    )
      fail('Admin session unavailable', 401);
    try {
      if (typeof req.query.code !== 'string')
        throw new Error('Missing authorization code');
      const auth = oauth(env);
      const { tokens } = await auth.getToken({
        code: req.query.code,
        codeVerifier: pending.verifier,
      });
      auth.setCredentials(tokens);
      const service = google.gmail({ version: 'v1', auth });
      const { data } = await service.users.getProfile(
        { userId: 'me' },
        { timeout: 30000 },
      );
      await transaction(pool, async (db) => {
        const old = await one(
          db,
          'SELECT * FROM gmail_connections WHERE user_id=$1 FOR UPDATE',
          [user.id],
        );
        if (!tokens.refresh_token && old?.mailbox === data.emailAddress)
          tokens.refresh_token = decryptCredentials(
            old.encrypted_credentials,
            env.GMAIL_TOKEN_ENCRYPTION_KEY,
          ).refresh_token;
        if (!tokens.refresh_token) throw new Error('Missing offline access');
        if (!old)
          await insert(db, 'gmail_connections', {
            user_id: user.id,
            mailbox: data.emailAddress,
            encrypted_credentials: encryptCredentials(
              tokens,
              env.GMAIL_TOKEN_ENCRYPTION_KEY,
            ),
          });
        else
          await db.query(
            'UPDATE gmail_connections SET mailbox=$1,last_error=NULL WHERE user_id=$2',
            [data.emailAddress, user.id],
          );
        await saveCredentials(db, user.id, tokens, env);
        await audit(db, { user }, 'Gmail connected');
      });
    } catch {
      return res.redirect(pending.return_origin + '/gmail?gmail=failed');
    }
    res.redirect(pending.return_origin + '/gmail?gmail=connected');
  });
  app.delete('/api/gmail/connection', require('hr_admin'), async (req, res) => {
    await transaction(pool, async (db) => {
      await db.query('DELETE FROM gmail_connections WHERE user_id=$1', [
        req.user.id,
      ]);
      await audit(db, req, 'Gmail disconnected');
    });
    res.json({ ok: true });
  });
  app.get('/api/gmail/threads', require('hr_admin'), async (req, res) => {
    const q = field(req.query, 'q', 500);
    const result = await transaction(pool, async (db) => {
      const { service } = await getService(db, req.user.id);
      try {
        const { data } = await service.users.threads.list(
          { userId: 'me', q, maxResults: 10 },
          { timeout: 30000 },
        );
        const result = [];
        for (const item of data.threads || []) {
          const { data: thread } = await service.users.threads.get(
            { userId: 'me', id: item.id, format: 'metadata' },
            { timeout: 30000 },
          );
          const h = headers(thread.messages?.[0]);
          result.push({
            id: item.id,
            subject: h.subject || '(No subject)',
            sender: h.from || '',
            message_count: thread.messages?.length || 0,
          });
        }
        return result;
      } catch {
        fail('Gmail search failed. Check the connection and try again.', 503);
      }
    });
    res.json(result);
  });
  app.post(
    '/api/logs/:id/gmail-link',
    require('hr_admin'),
    async (req, res) => {
      const threadId = field(req.body, 'thread_id', 255);
      await transaction(pool, async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(70102)');
        const a = await getAction(db, req, req.params.id);
        const { service, connection } = await getService(db, req.user.id);
        if (a.gmail_thread_id && a.gmail_thread_id !== threadId)
          fail(
            'This action already has a linked thread. Use a new action for a different conversation.',
          );
        if (a.gmail_mailbox && a.gmail_mailbox !== connection.mailbox)
          fail('Reconnect the original mailbox for this linked conversation.');
        if (
          await one(
            db,
            'SELECT id FROM actions WHERE gmail_thread_id=$1 AND gmail_mailbox=$2 AND id <> $3',
            [threadId, connection.mailbox, a.id],
          )
        )
          fail('This Gmail conversation is already linked to another action.');
        await db.query(
          'UPDATE actions SET gmail_thread_id=$1,gmail_mailbox=$2 WHERE id=$3',
          [threadId, connection.mailbox, a.id],
        );
        try {
          await syncAction(
            db,
            service,
            connection,
            { ...a, gmail_thread_id: threadId },
            true,
          );
        } catch {
          fail('Could not import this Gmail thread.', 503);
        }
        await audit(db, req, 'Gmail thread linked', `Action #${a.id}`);
      });
      res.json({ ok: true });
    },
  );
  app.post(
    '/api/logs/:id/gmail-draft',
    require('hr_admin'),
    async (req, res) => {
      let subject = field(req.body, 'subject', 500);
      const body = field(req.body, 'body', 12000);
      if (/[\r\n]/.test(subject)) fail('Subject must be a single line');
      const result = await transaction(pool, async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(70102)');
        const a = await getAction(db, req, req.params.id);
        if (!a.contact_email)
          fail('Add a contact email before creating a Gmail draft');
        const { service, connection } = await getService(db, req.user.id);
        if (a.gmail_mailbox && a.gmail_mailbox !== connection.mailbox)
          fail('Reconnect the original mailbox before drafting a reply.');
        try {
          const message = {};
          const extra = [];
          const clean = (value) => String(value).replace(/[\r\n]/g, ' ');
          if (a.gmail_thread_id) {
            const { data: thread } = await service.users.threads.get(
              { userId: 'me', id: a.gmail_thread_id, format: 'metadata' },
              { timeout: 30000 },
            );
            const messages = (thread.messages || []).filter(
              (m) => !m.labelIds?.includes('DRAFT'),
            );
            const h = headers(messages.at(-1));
            subject = h.subject || subject;
            if (h['message-id'])
              extra.push(
                `In-Reply-To: ${clean(h['message-id'])}`,
                `References: ${clean((h.references || '') + ' ' + h['message-id'])}`,
              );
            message.threadId = a.gmail_thread_id;
          }
          const raw = [
            `To: ${clean(a.contact_email)}`,
            `From: ${clean(connection.mailbox)}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
            ...extra,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(body)
              .toString('base64')
              .match(/.{1,76}/g)
              ?.join('\r\n') || '',
          ].join('\r\n');
          message.raw = Buffer.from(raw).toString('base64url');
          const { data } = await service.users.drafts.create(
            { userId: 'me', requestBody: { message } },
            { timeout: 30000 },
          );
          await db.query(
            'UPDATE actions SET gmail_mailbox=$1,gmail_thread_id=$2 WHERE id=$3',
            [
              connection.mailbox,
              data.message?.threadId || a.gmail_thread_id,
              a.id,
            ],
          );
          await audit(db, req, 'Gmail draft created', `Action #${a.id}`);
          return {
            draft_id: data.id,
            url: 'https://mail.google.com/mail/u/0/#drafts',
          };
        } catch {
          fail('Could not create the Gmail draft. No email was sent.', 503);
        }
      });
      res.status(201).json(result);
    },
  );
  app.post('/api/gmail/sync', require('hr_admin'), async (req, res) =>
    res.json(await syncGmail(pool, config, req.user.id, services)),
  );
  app.post('/api/jobs/gmail-sync', job, async (req, res) =>
    res.json(await syncGmail(pool, config, null, services)),
  );
}
