import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fixture } from './helpers.js';
import { insert, one } from '../db.js';

let f;
let api;
let auth;
let action;
let drafts = [];
let threads;
let failSync = false;
const mail = (id, from, body, labels = []) => ({
  id,
  internalDate: '1793700000000',
  labelIds: labels,
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'From', value: from },
      { name: 'Subject', value: 'Existing subject' },
      { name: 'Message-ID', value: `<${id}@example.com>` },
    ],
    body: { data: Buffer.from(body).toString('base64url') },
  },
});
before(async () => {
  threads = [
    mail('m1', 'hr@example.com', 'Please update'),
    mail('m2', 'Alex <alex@example.com>', 'Working on it'),
    mail('draft1', 'hr@example.com', 'UNSENT', ['DRAFT']),
  ];
  const service = {
    users: {
      threads: {
        get: async () => {
          if (failSync) throw new Error('Mock outage');
          return { data: { messages: threads } };
        },
        list: async () => ({ data: { threads: [{ id: 'thread1' }] } }),
      },
      drafts: {
        create: async (input) => {
          drafts.push(input);
          return {
            data: { id: 'draft-created', message: { threadId: 'thread1' } },
          };
        },
      },
    },
  };
  f = await fixture(
    {
      GMAIL_CLIENT_ID: 'fake-client',
      GMAIL_CLIENT_SECRET: 'fake-secret',
      GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
    },
    {
      serviceFor: async (db, userId) => ({
        service,
        connection: await one(
          db,
          'SELECT * FROM gmail_connections WHERE user_id=$1',
          [userId],
        ),
      }),
    },
  );
  api = request(f.app);
  const session = (
    await api
      .post('/api/auth/login')
      .send({ email: 'vihaan4263@gmail.com', password: 'test-admin-password' })
      .expect(200)
  ).body;
  auth = { Authorization: `Bearer ${session.token}` };
  await insert(f.pool, 'gmail_connections', {
    user_id: session.user.id,
    mailbox: 'hr@example.com',
    encrypted_credentials: 'mocked',
  });
  const m = (
    await api
      .post('/api/meetings')
      .set(auth)
      .send({
        forum_type: 'Town Hall',
        date: '2026-11-04',
        department: 'HR',
        facilitator: 'HR',
        num_participants: 1,
      })
      .expect(201)
  ).body;
  action = (
    await api
      .post(`/api/meetings/${m.id}/logs`)
      .set(auth)
      .send({
        discussion_point: 'Equipment',
        action_description: 'Review equipment',
        category: 'Facilities',
        contact_person: 'Alex',
        contact_email: 'alex@example.com',
      })
      .expect(201)
  ).body;
});
after(async () => {
  await f?.pool.end();
});

test('Gmail import skips unsent drafts, deduplicates messages and notifies only for new incoming replies', async () => {
  await api
    .post(`/api/logs/${action.id}/gmail-link`)
    .set(auth)
    .send({ thread_id: 'thread1' })
    .expect(200);
  let detail = (await api.get(`/api/logs/${action.id}`).set(auth)).body;
  assert.equal(detail.messages.length, 2);
  assert.equal(detail.messages[1].direction, 'incoming');
  assert.equal((await api.get('/api/notifications').set(auth)).body.length, 0);
  await api
    .post('/api/gmail/sync')
    .set(auth)
    .send({})
    .expect(200, { new_replies: 0 });
  threads.push(mail('m3', 'Alex <alex@example.com>', 'Done'));
  await api
    .post('/api/gmail/sync')
    .set(auth)
    .send({})
    .expect(200, { new_replies: 1 });
  await api
    .post('/api/gmail/sync')
    .set(auth)
    .send({})
    .expect(200, { new_replies: 0 });
  detail = (await api.get(`/api/logs/${action.id}`).set(auth)).body;
  assert.equal(detail.messages.length, 3);
  assert.equal((await api.get('/api/notifications').set(auth)).body.length, 1);
  await api
    .post(`/api/logs/${action.id}/gmail-link`)
    .set(auth)
    .send({ thread_id: 'different-thread' })
    .expect(400);
});

test('draft creation keeps reply headers and creates an unsent Gmail draft', async () => {
  const result = (
    await api
      .post(`/api/logs/${action.id}/gmail-draft`)
      .set(auth)
      .send({
        subject: 'Requested subject',
        body: 'Please confirm the next step.',
      })
      .expect(201)
  ).body;
  assert.equal(result.draft_id, 'draft-created');
  assert.equal(drafts.length, 1);
  const message = drafts[0].requestBody.message;
  assert.equal(message.threadId, 'thread1');
  const raw = Buffer.from(message.raw, 'base64url').toString('utf8');
  assert.ok(raw.includes('To: alex@example.com'));
  assert.ok(raw.includes('In-Reply-To: <m3@example.com>'));
  assert.ok(raw.includes(Buffer.from('Existing subject').toString('base64')));
  await api
    .post(`/api/logs/${action.id}/gmail-draft`)
    .set(auth)
    .send({ subject: 'Bad\r\nBcc: other@example.com', body: 'test' })
    .expect(400);
  assert.equal(drafts.length, 1);
});

test('Gmail OAuth initiation uses PKCE and rejects mismatched or replayed browser state', async () => {
  const result = await api
    .get('/api/gmail/start')
    .set(auth)
    .set('X-Frontend-Origin', 'https://untrusted.example')
    .expect(200);
  assert.equal(result.headers['set-cookie'], undefined);
  assert.equal(new URL(result.body.url).pathname, '/api/gmail/authorize');
  await api
    .post('/api/gmail/authorize')
    .type('form')
    .send({ state: result.body.state })
    .expect(400);
  await api
    .post('/api/gmail/authorize')
    .set('Origin', 'https://untrusted.example')
    .type('form')
    .send({ state: result.body.state })
    .expect(400);
  const navigation = await api
    .post('/api/gmail/authorize')
    .set('Origin', f.config.frontend)
    .type('form')
    .send({ state: result.body.state })
    .expect(303);
  await api
    .post('/api/gmail/authorize')
    .set('Origin', f.config.frontend)
    .type('form')
    .send({ state: result.body.state })
    .expect(400);
  const url = new URL(navigation.headers.location);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state');
  const stored = await one(f.pool, 'SELECT * FROM oauth_states WHERE id=$1', [
    state,
  ]);
  assert.equal(stored.return_origin, f.config.frontend);
  assert.ok(stored.verifier);
  await api.get(`/api/gmail/callback?state=${state}`).expect(400);
  const cookie = navigation.headers['set-cookie'][0].split(';')[0];
  await api
    .get('/api/gmail/callback?state=mismatch')
    .set('Cookie', cookie)
    .expect(400);
  // Missing code consumes the valid pending state, then redirects without contacting Google.
  await api
    .get(`/api/gmail/callback?state=${state}`)
    .set('Cookie', cookie)
    .expect(302);
  await api
    .get(`/api/gmail/callback?state=${state}`)
    .set('Cookie', cookie)
    .expect(400);
});

test('failed sync reports failure and persists only one attention notification', async () => {
  failSync = true;
  try {
    const before = (await api.get('/api/notifications').set(auth)).body.length;
    for (let i = 0; i < 2; i++)
      await api
        .post('/api/gmail/sync')
        .set(auth)
        .send({})
        .expect(200, { new_replies: 0, failures: 1 });
    assert.equal(
      (await api.get('/api/notifications').set(auth)).body.length,
      before + 1,
    );
    assert.match(
      (await api.get('/api/gmail/status').set(auth)).body.last_error,
      /sync failed/,
    );
  } finally {
    failSync = false;
  }
});

test('Gmail disconnect invalidates pending OAuth states', async () => {
  await api.get('/api/gmail/start').set(auth).expect(200);
  await api.delete('/api/gmail/connection').set(auth).expect(200);
  assert.equal(
    Number((await one(f.pool, 'SELECT COUNT(*) AS n FROM oauth_states')).n),
    0,
  );
});
