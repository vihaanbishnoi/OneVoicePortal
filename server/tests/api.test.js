import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { unzipSync, strFromU8 } from 'fflate';
import jwt from 'jsonwebtoken';
import { fixture } from './helpers.js';
import { bootstrap, one, insert } from '../db.js';

let f;
let api;
let demo;
let other;
let admin;
const auth = (session) => ({ Authorization: `Bearer ${session.token}` });
before(async () => {
  f = await fixture(
    { OPENAI_API_KEY: 'fictional-key' },
    {
      generate: async (task, context, demo) => ({
        content: `Generated ${task}: ${context.messages.length} messages`,
        provider: demo ? 'openai' : 'ollama',
        model: 'mock',
      }),
    },
  );
  api = request(f.app);
  demo = (await api.post('/api/auth/demo').send({}).expect(200)).body;
  other = (await api.post('/api/auth/demo').send({}).expect(200)).body;
  admin = (
    await api
      .post('/api/auth/login')
      .send({
        email: 'vihaan4263@gmail.com',
        password: 'test-admin-password',
      })
      .expect(200)
  ).body;
});
after(async () => {
  await f?.pool.end();
});

test('authentication rejects anonymous, forged, expired, malformed and unauthorized sessions', async () => {
  await api.get('/api/meetings').expect(401);
  await api
    .get('/api/meetings')
    .set('Authorization', 'Bearer invalid')
    .expect(401);
  const payload = jwt.decode(demo.token);
  delete payload.exp;
  delete payload.iat;
  const expired = jwt.sign(payload, f.config.secret, { expiresIn: -1 });
  await api
    .get('/api/meetings')
    .set('Authorization', `Bearer ${expired}`)
    .expect(401);
  await api.get('/api/admin/activity').set(auth(demo)).expect(403);
  await api.get('/api/users').set(auth(demo)).expect(404);
  await api
    .post('/api/auth/login')
    .send({ mode: 'hr_team', password: 'x' })
    .expect(403);
  await api
    .post('/api/auth/login')
    .send({ email: 'someone@example.com', password: 'x' })
    .expect(401);
  await api.post('/api/auth/demo').send([]).expect(400);
  await api
    .post('/api/auth/demo')
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
  assert.equal(
    (await api.get('/api/auth/me').set(auth(demo)).expect(200)).body.demo,
    true,
  );
});

test('demo records are isolated from other demos and private workspace', async () => {
  const records = (await api.get('/api/meetings').set(auth(demo)).expect(200))
    .body;
  assert.equal(records.length, 3);
  assert.match(records[0].date, /^\d{4}-\d{2}-\d{2}$/);
  await api.get(`/api/meetings/${records[0].id}`).set(auth(other)).expect(404);
  await api.get(`/api/meetings/${records[0].id}`).set(auth(admin)).expect(404);
  const actions = (await api.get('/api/actions').set(auth(demo))).body;
  await api
    .patch(`/api/logs/${actions[0].id}`)
    .set(auth(other))
    .send({ status: 'Completed' })
    .expect(404);
  await api
    .post(`/api/logs/${actions[0].id}/messages`)
    .set(auth(other))
    .send({ body: 'cross tenant' })
    .expect(404);
  await api
    .post(`/api/logs/${actions[0].id}/ai`)
    .set(auth(other))
    .send({ task: 'summary' })
    .expect(404);
  const notice = (await api.get('/api/notifications').set(auth(demo))).body[0];
  await api
    .post(`/api/notifications/${notice.id}/read`)
    .set(auth(other))
    .expect(404);
  await api
    .post(`/api/notifications/${notice.id}/read`)
    .set(auth(demo))
    .expect(200);
  assert.equal(
    (await api.get('/api/meetings').set(auth(admin))).body.length,
    0,
  );
});

test('meeting, action, remark, conversation, calendar, AI and ZIP workflows retain API contract', async () => {
  const m = (
    await api
      .post('/api/meetings')
      .set(auth(demo))
      .send({
        forum_type: 'Town Hall',
        date: '2026-11-04',
        department: 'Engineering',
        facilitator: 'Test HR',
        num_participants: 2,
        participants_list: [{ name: 'Alex', empid: 'E1' }],
      })
      .expect(201)
  ).body;
  const a = (
    await api
      .post(`/api/meetings/${m.id}/logs`)
      .set(auth(demo))
      .send({
        discussion_point: '=SUM(A1)',
        action_description: 'Review equipment',
        category: 'Facilities',
        contact_person: 'Alex',
        contact_email: 'alex@example.com',
        due_date: '2026-11-10',
        owner_name: 'Alex',
      })
      .expect(201)
  ).body;
  await api
    .patch(`/api/logs/${a.id}`)
    .set(auth(demo))
    .send({
      status: 'In Progress',
      priority: 'High',
      remark: 'Review started',
    })
    .expect(200);
  const msg = (
    await api
      .post(`/api/logs/${a.id}/messages`)
      .set(auth(demo))
      .send({
        body: 'Will update tomorrow',
        sender: 'alex@example.com',
        direction: 'incoming',
      })
      .expect(201)
  ).body;
  assert.equal(msg.sent_at, null);
  assert.ok(msg.recorded_at);
  const detail = (
    await api.get(`/api/logs/${a.id}`).set(auth(demo)).expect(200)
  ).body;
  assert.equal(detail.history[0].author_type, 'Demo visitor');
  assert.equal(detail.meeting.id, m.id);
  assert.equal(detail.status, 'In Progress');
  const result = (
    await api
      .post(`/api/logs/${a.id}/ai`)
      .set(auth(demo))
      .send({ task: 'summary' })
      .expect(201)
  ).body;
  assert.equal(result.provider, 'openai');
  const calendar = (
    await api
      .get('/api/calendar?start=2026-11-01&end=2026-11-30')
      .set(auth(demo))
      .expect(200)
  ).body;
  assert.ok(calendar.some((e) => e.id === `action-${a.id}`));
  const exported = await api
    .get('/api/reports/export?period=month&year=2026&month=11')
    .set(auth(demo))
    .buffer(true)
    .parse((res, callback) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  const files = unzipSync(exported.body);
  assert.equal(Object.keys(files).length, 6);
  const actions = strFromU8(files['actions.csv']);
  assert.ok(actions.includes("'=SUM(A1)"));
  assert.ok(!actions.includes('encrypted_credentials'));
  assert.match(
    exported.headers['content-disposition'],
    /onevoice-month-2026-11.zip/,
  );
  const foreignIds = (await api.get('/api/meetings').set(auth(other))).body.map(
    (m) => m.id,
  );
  const exportedMeetings = strFromU8(files['meetings.csv']);
  for (const id of foreignIds)
    assert.ok(
      !exportedMeetings
        .split('\r\n')
        .some((line) => line.startsWith(`"${id}",`)),
    );
});

test('validation rejects impossible dates and enforces quotas atomically', async () => {
  await api
    .post('/api/meetings')
    .set(auth(demo))
    .send({
      forum_type: 'X',
      department: 'X',
      facilitator: 'X',
      date: '2026-02-30',
      num_participants: 1,
    })
    .expect(400);
  await api
    .get('/api/calendar?start=2026-11-10&end=2026-11-01')
    .set(auth(demo))
    .expect(400);
  await api
    .get('/api/reports/export?period=quarter&year=2026&quarter=5')
    .set(auth(demo))
    .expect(400);
  const a = (await api.get('/api/actions').set(auth(demo))).body[0];
  await api
    .patch(`/api/logs/${a.id}`)
    .set(auth(demo))
    .send({ priority: 'invalid' })
    .expect(400);
  await api
    .post(`/api/logs/${a.id}/messages`)
    .set(auth(demo))
    .send({ body: 'x'.repeat(13000) })
    .expect(413);
  const old = f.config.env.DEMO_SESSION_WRITE_LIMIT;
  f.config.env.DEMO_SESSION_WRITE_LIMIT = '0';
  await api
    .patch(`/api/logs/${a.id}`)
    .set(auth(demo))
    .send({ status: 'Completed' })
    .expect(429);
  if (old === undefined) delete f.config.env.DEMO_SESSION_WRITE_LIMIT;
  else f.config.env.DEMO_SESSION_WRITE_LIMIT = old;
  assert.notEqual(
    (await api.get(`/api/logs/${a.id}`).set(auth(demo))).body.status,
    'Completed',
  );
  f.config.env.DEMO_AI_SESSION_LIMIT = '1';
  await api
    .post(`/api/logs/${a.id}/ai`)
    .set(auth(demo))
    .send({ task: 'draft' })
    .expect(429);
  delete f.config.env.DEMO_AI_SESSION_LIMIT;
  f.config.env.DEMO_DAILY_SESSION_LIMIT = '0';
  await api.post('/api/auth/demo').send({}).expect(429);
  delete f.config.env.DEMO_DAILY_SESSION_LIMIT;
});

test('Gmail and jobs remain admin-only; missing setup is explicit', async () => {
  assert.equal(
    (await api.get('/api/gmail/status').set(auth(demo))).body.available,
    false,
  );
  for (const path of ['/api/gmail/start', '/api/gmail/threads?q=test'])
    await api.get(path).set(auth(demo)).expect(403);
  for (const path of [
    '/api/gmail/sync',
    '/api/logs/1/gmail-link',
    '/api/logs/1/gmail-draft',
  ])
    await api.post(path).set(auth(demo)).send({}).expect(403);
  await api.get('/api/gmail/start').set(auth(admin)).expect(503);
  await api.get('/api/gmail/callback?state=forged').expect(400);
  await api.post('/api/jobs/reminders').expect(401);
  await api.post('/api/jobs/gmail-sync').expect(401);
  await api
    .post('/api/jobs/reminders')
    .set('X-Job-Key', 'test-job-key')
    .expect(200);
  await api
    .get('/api/health')
    .expect(200, { status: 'healthy', database: 'postgresql' });
  await api.get('/api/not-real').expect(404);
});

test('record IDs are bounded, participants normalized, and year zero rejected', async () => {
  for (const id of [
    '2147483648',
    '999999999999999999999999',
    '0',
    '-1',
    '1.2',
  ]) {
    await api
      .get('/api/meetings/' + id)
      .set(auth(admin))
      .expect(404);
    await api
      .get('/api/logs/' + id)
      .set(auth(admin))
      .expect(404);
    await api
      .post('/api/notifications/' + id + '/read')
      .set(auth(admin))
      .expect(404);
  }
  const data = {
    forum_type: 'Test',
    department: 'Test',
    facilitator: 'Test',
    date: '2026-11-05',
    num_participants: 1,
    participants_list: [{ name: '  Alex  ', empid: ' E1 ', extra: 'discard' }],
  };
  const response = await api
    .post('/api/meetings')
    .set(auth(admin))
    .send(data)
    .expect(201);
  assert.deepEqual(response.body.participants_list, [
    { name: 'Alex', empid: 'E1' },
  ]);
  await api
    .post('/api/meetings')
    .set(auth(admin))
    .send({ ...data, date: '0000-01-01' })
    .expect(400);
  await api
    .post('/api/users')
    .set(auth(admin))
    .send({ name: 'Unsupported account' })
    .expect(404);
});

test('pasted and imported messages appear in chronological order', async () => {
  const a = (await api.get('/api/actions').set(auth(other)).expect(200))
    .body[0];
  await f.pool.query('DELETE FROM conversation_messages WHERE action_id=$1', [
    a.id,
  ]);
  await insert(f.pool, 'conversation_messages', {
    action_id: a.id,
    body: 'Later paste',
    sender: 'Test',
    direction: 'incoming',
    source: 'manual',
    recorded_at: new Date('2026-11-05T10:00:00Z'),
  });
  await insert(f.pool, 'conversation_messages', {
    action_id: a.id,
    body: 'Earlier email',
    sender: 'Test',
    direction: 'incoming',
    source: 'gmail',
    sent_at: new Date('2026-11-04T10:00:00Z'),
  });
  const response = await api
    .get('/api/logs/' + a.id)
    .set(auth(other))
    .expect(200);
  assert.deepEqual(
    response.body.messages.map((m) => m.body),
    ['Earlier email', 'Later paste'],
  );
});

test('additive bootstrap preserves records and null historical timestamps; password changes revoke sessions', async () => {
  const m = (await api.get('/api/meetings').set(auth(demo))).body[0];
  await f.pool.query(
    'UPDATE meetings SET created_at=NULL,updated_at=NULL WHERE id=$1',
    [m.id],
  );
  const before = await one(f.pool, 'SELECT COUNT(*) AS n FROM meetings');
  await bootstrap(f.pool, f.config);
  const after = await one(f.pool, 'SELECT COUNT(*) AS n FROM meetings');
  assert.equal(after.n, before.n);
  assert.equal(
    (await api.get(`/api/meetings/${m.id}`).set(auth(demo))).body.created_at,
    null,
  );
  await api.get('/api/auth/me').set(auth(admin)).expect(200);
  await bootstrap(f.pool, {
    ...f.config,
    adminPassword: 'new-admin-password',
  });
  await api.get('/api/auth/me').set(auth(admin)).expect(401);
  await api
    .post('/api/auth/login')
    .send({
      email: 'vihaan4263@gmail.com',
      password: 'new-admin-password',
    })
    .expect(200);
  await f.pool.query(
    "UPDATE demo_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",
    [other.user.demo_session_id],
  );
  await api.get('/api/meetings').set(auth(other)).expect(401);
});

test('older PostgreSQL schema upgrades add columns without replacing existing records', async () => {
  const legacy = await fixture();
  try {
    const m = await insert(legacy.pool, 'meetings', {
      forum_type: 'Historical meeting',
      date: '2025-01-15',
      department: 'Operations',
      facilitator: 'HR',
      num_participants: 4,
    });
    const a = await insert(legacy.pool, 'actions', {
      meeting_id: m.id,
      discussion_point: 'Original concern',
      category: 'Facilities',
      action_description: 'Original action',
      contact_person: 'Alex',
    });
    await legacy.pool.query(`ALTER TABLE meetings DROP COLUMN demo_session_id;
      ALTER TABLE meetings DROP COLUMN created_at;
      ALTER TABLE meetings DROP COLUMN updated_at;
      ALTER TABLE actions DROP COLUMN owner_name;
      ALTER TABLE actions DROP COLUMN gmail_thread_id;
      ALTER TABLE actions DROP COLUMN gmail_mailbox;
      ALTER TABLE notifications DROP COLUMN demo_session_id;`);
    await bootstrap(legacy.pool, legacy.config);
    const restored = await one(
      legacy.pool,
      'SELECT * FROM meetings WHERE id=$1',
      [m.id],
    );
    assert.equal(restored.forum_type, 'Historical meeting');
    assert.equal(restored.created_at, null);
    assert.equal(restored.updated_at, null);
    const restoredAction = await one(
      legacy.pool,
      'SELECT * FROM actions WHERE id=$1',
      [a.id],
    );
    assert.equal(restoredAction.action_description, 'Original action');
    assert.equal(restoredAction.owner_name, '');
  } finally {
    await legacy.pool.end();
  }
});

test('login attempts are bounded before password hashing and recover after the window', async () => {
  const isolated = await fixture();
  try {
    const client = request(isolated.app);
    for (let i = 0; i < 30; i++)
      await client
        .post('/api/auth/login')
        .send({ email: 'unknown@example.com', password: 'wrong' })
        .expect(401);
    const denied = await client
      .post('/api/auth/login')
      .send({ email: 'vihaan4263@gmail.com', password: 'test-admin-password' })
      .expect(429);
    assert.equal(denied.headers['retry-after'], '60');
    await isolated.pool.query(
      "UPDATE activity SET created_at=NOW()-INTERVAL '2 minutes' WHERE event='Sign-in attempted'",
    );
    await client
      .post('/api/auth/login')
      .send({ email: 'vihaan4263@gmail.com', password: 'test-admin-password' })
      .expect(200);
  } finally {
    await isolated.pool.end();
  }
});
