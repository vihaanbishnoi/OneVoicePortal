import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { transaction, rows, one, insert } from './db.js';
import {
  ADMIN_EMAIL,
  SHARED_EMAIL,
  DEMO_EMAIL,
  version,
  checkPassword,
  hashPassword,
  safeEqual,
} from './security.js';
import {
  fail,
  field,
  date,
  email,
  pick,
  userJson,
  meetingJson,
  actionJson,
  messageJson,
  plusDays,
  periodBounds,
  csv,
} from './domain.js';
import { generate } from './ai.js';
import { gmailRoutes, syncGmail } from './gmail.js';

export function createApp(pool, config, services = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.cors, credentials: true }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    res
      .set('X-Content-Type-Options', 'nosniff')
      .set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const start = Date.now();
    if (config.env.NODE_ENV !== 'test')
      res.on('finish', () =>
        console.log(
          `${req.method} ${req.path} status=${res.statusCode} elapsed_ms=${Date.now() - start}`,
        ),
      );
    next();
  });
  app.use(express.json({ limit: 1_000_000 }));
  app.use(cookieParser(config.secret));
  app.use((req, res, next) => {
    if (
      ['POST', 'PATCH'].includes(req.method) &&
      req.is('application/json') &&
      (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    )
      return res
        .status(400)
        .json({ error: 'Request body must be a JSON object' });
    req.body ??= {};
    next();
  });
  const eligible = (u) =>
    u?.active &&
    ((u.email === ADMIN_EMAIL && u.role === 'hr_admin') ||
      (config.sharedLogin &&
        u.email === SHARED_EMAIL &&
        u.role === 'hr_team') ||
      (config.demoEnabled && u.email === DEMO_EMAIL && u.role === 'demo'));
  const tokenResult = (u, demo = null) => ({
    token: jwt.sign(
      { id: u.id, credential_version: version(u), demo_session_id: demo },
      config.secret,
      { algorithm: 'HS256', expiresIn: '12h', issuer: 'onevoice' },
    ),
    user: userJson(u, demo),
  });
  const require =
    (...roles) =>
    async (req, res, next) => {
      const header = req.get('Authorization') || '';
      if (!header.startsWith('Bearer ')) fail('Authentication required', 401);
      let payload;
      try {
        payload = jwt.verify(header.slice(7), config.secret, {
          algorithms: ['HS256'],
          issuer: 'onevoice',
        });
      } catch {
        fail('Session expired or invalid', 401);
      }
      if (!Number.isInteger(payload.id))
        fail('Session expired or invalid', 401);
      const user = await one(pool, 'SELECT * FROM users WHERE id=$1', [
        payload.id,
      ]);
      if (!eligible(user) || payload.credential_version !== version(user))
        fail('Account or session unavailable. Please sign in again.', 401);
      const demo = payload.demo_session_id ?? null;
      if (user.role === 'demo') {
        if (
          typeof demo !== 'string' ||
          !(await one(
            pool,
            'SELECT id FROM demo_sessions WHERE id=$1 AND expires_at > NOW()',
            [demo],
          ))
        )
          fail('Demo session expired. Start a fresh demo.', 401);
      } else if (demo !== null) fail('Invalid session', 401);
      if (roles.length && !roles.includes(user.role))
        fail('Permission denied', 403);
      req.user = user;
      req.demo = demo;
      next();
    };
  const audit = (db, req, event, detail = '') =>
    insert(db, 'activity', {
      actor_id: req.user?.id ?? null,
      actor_role: req.user?.role || 'anonymous',
      demo_session_id: req.demo ?? null,
      event,
      detail: detail.slice(0, 300),
    });
  const getMeeting = async (db, req, id) => {
    if (!/^\d+$/.test(String(id))) fail('Meeting not found', 404);
    const m = await one(
      db,
      'SELECT * FROM meetings WHERE id=$1 AND demo_session_id IS NOT DISTINCT FROM $2',
      [id, req.demo],
    );
    if (!m) fail('Meeting not found', 404);
    return m;
  };
  const getAction = async (db, req, id) => {
    if (!/^\d+$/.test(String(id))) fail('Action not found', 404);
    const a = await one(
      db,
      `SELECT a.*, u.name AS user_owner_name FROM actions a JOIN meetings m ON m.id=a.meeting_id LEFT JOIN users u ON u.id=a.owner_id WHERE a.id=$1 AND m.demo_session_id IS NOT DISTINCT FROM $2`,
      [id, req.demo],
    );
    if (!a) fail('Action not found', 404);
    return a;
  };
  const touch = async (db, a) => {
    await db.query('UPDATE actions SET updated_at=NOW() WHERE id=$1', [a.id]);
    await db.query('UPDATE meetings SET updated_at=NOW() WHERE id=$1', [
      a.meeting_id,
    ]);
  };
  const limit = (name, fallback) => Number(config.env[name] ?? fallback);
  const guard = async (db, req) => {
    if (!req.demo) return;
    if (Buffer.byteLength(JSON.stringify(req.body)) > 12000)
      fail(
        'Demo edits are limited to 12 KB. Use a shorter fictional example.',
        413,
      );
    await db.query('SELECT pg_advisory_xact_lock(70106)');
    const events = [
      'Meeting recorded',
      'Action recorded',
      'Follow-up updated',
      'Email conversation updated',
    ];
    const counts = await one(
      db,
      `SELECT COUNT(*) FILTER (WHERE demo_session_id=$1) AS session,
      COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1 day') AS daily FROM activity WHERE actor_role='demo' AND event=ANY($2::text[])`,
      [req.demo, events],
    );
    if (Number(counts.session) >= limit('DEMO_SESSION_WRITE_LIMIT', 100))
      fail('This demo session has reached its editing allowance.', 429);
    if (Number(counts.daily) >= limit('DEMO_DAILY_WRITE_LIMIT', 1000))
      fail(
        'The demo has reached its daily editing allowance. Please try tomorrow.',
        429,
      );
  };
  const details = async (db, req, id) => {
    const a = await getAction(db, req, id);
    const m = await getMeeting(db, req, a.meeting_id);
    return {
      ...actionJson(a, m),
      forum_type: m.forum_type,
      meeting_date: m.date,
      department: m.department,
      history: (
        await rows(
          db,
          'SELECT * FROM remarks WHERE action_id=$1 ORDER BY created_at,id',
          [a.id],
        )
      ).map((r) => ({
        ...pick(r, 'id remark created_at'),
        author_type: r.author,
      })),
      messages: (
        await rows(
          db,
          'SELECT * FROM conversation_messages WHERE action_id=$1 ORDER BY sent_at NULLS FIRST,id',
          [a.id],
        )
      ).map(messageJson),
      ai_results: (
        await rows(
          db,
          'SELECT * FROM ai_results WHERE action_id=$1 ORDER BY created_at DESC,id DESC',
          [a.id],
        )
      ).map((r) => pick(r, 'id task content provider model created_at')),
    };
  };

  app.post('/api/auth/login', async (req, res) => {
    const { password, mode = 'admin' } = req.body;
    if (
      !['admin', 'hr_team'].includes(mode) ||
      typeof password !== 'string' ||
      !password ||
      password.length > 256
    )
      fail('Choose a valid login and enter a password');
    if (mode === 'hr_team' && !config.sharedLogin)
      fail(
        'Shared login is disabled. Enter the password-free demo or use Admin.',
        403,
      );
    const address =
      mode === 'admin'
        ? field(req.body, 'email', 255, false).toLowerCase()
        : SHARED_EMAIL;
    const user = await one(pool, 'SELECT * FROM users WHERE email=$1', [
      address,
    ]);
    if (
      (mode === 'admin' && address !== ADMIN_EMAIL) ||
      !eligible(user) ||
      !(await checkPassword(user.password_hash, password))
    ) {
      await audit(pool, req, 'Sign-in failed');
      fail('Invalid credentials', 401);
    }
    req.user = user;
    await audit(pool, req, 'Signed in');
    res.json(tokenResult(user));
  });
  app.post('/api/auth/demo', async (req, res) => {
    if (!config.demoEnabled) fail('Demo access is disabled', 403);
    const result = await transaction(pool, async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(70103)');
      const count = await one(
        db,
        "SELECT COUNT(*) AS n FROM demo_sessions WHERE created_at >= NOW()-INTERVAL '1 day'",
      );
      if (Number(count.n) >= limit('DEMO_DAILY_SESSION_LIMIT', 500))
        fail(
          'The demo has reached its daily session limit. Please try tomorrow.',
          429,
        );
      req.demo = randomUUID();
      await insert(db, 'demo_sessions', {
        id: req.demo,
        expires_at: new Date(Date.now() + 43200000),
      });
      req.user = await one(db, 'SELECT * FROM users WHERE email=$1', [
        DEMO_EMAIL,
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const fixtures = [
        [
          'Town Hall',
          'Operations',
          'Transport',
          'Review the shuttle timetable',
          'Jordan Lee',
        ],
        [
          'Batcheet',
          'Engineering',
          'Facilities',
          'Replace faulty desk equipment',
          'Sam Taylor',
        ],
        [
          'Voice of User',
          'Support',
          'Training',
          'Schedule an onboarding workshop',
          'Alex Morgan',
        ],
      ];
      for (const [
        i,
        [forum, department, category, description, owner],
      ] of fixtures.entries()) {
        const m = await insert(db, 'meetings', {
          forum_type: forum,
          department,
          date: plusDays(today, -i * 35),
          facilitator: 'Demo HR',
          num_participants: 8,
          demo_session_id: req.demo,
        });
        const a = await insert(db, 'actions', {
          meeting_id: m.id,
          discussion_point: `Sample employee concern about ${category.toLowerCase()}.`,
          category,
          action_description: description,
          contact_person: owner,
          owner_name: owner,
          contact_email: `${owner.split(' ')[0].toLowerCase()}@example.com`,
          due_date: plusDays(today, 7),
        });
        await insert(db, 'conversation_messages', {
          action_id: a.id,
          sender: 'hr@example.com',
          subject: description,
          body: `Please ${description.toLowerCase()}. Can you confirm the next step?`,
          direction: 'outgoing',
          source: 'demo',
          sent_at: new Date(Date.now() - 172800000),
        });
        await insert(db, 'conversation_messages', {
          action_id: a.id,
          sender: a.contact_email,
          subject: `Re: ${description}`,
          body: 'I have started reviewing this and will share an update next week.',
          source: 'demo',
          sent_at: new Date(Date.now() - 86400000),
        });
        await insert(db, 'notifications', {
          action_id: a.id,
          demo_session_id: req.demo,
          title: 'Sample email reply',
          body: `A fictional reply is available for ${category.toLowerCase()}.`,
        });
      }
      await audit(db, req, 'Demo session started');
      return tokenResult(req.user, req.demo);
    });
    res.json(result);
  });
  app.get('/api/auth/me', require(), (req, res) =>
    res.json(userJson(req.user, req.demo)),
  );
  app.get('/api/users', require('hr_admin', 'hr_team'), async (req, res) =>
    res.json(
      (
        await rows(
          pool,
          "SELECT * FROM users WHERE active=true AND role <> 'demo' ORDER BY name",
        )
      ).map((u) => userJson(u)),
    ),
  );
  app.post('/api/users', require('hr_admin'), async (req, res) => {
    const name = field(req.body, 'name');
    const address = email(field(req.body, 'email', 255)).toLowerCase();
    const password = field(req.body, 'password', 256);
    const role = req.body.role;
    if (!['hr_admin', 'hr_team', 'action_owner', 'viewer'].includes(role))
      fail('Choose a valid role');
    const result = await transaction(pool, async (db) => {
      if (await one(db, 'SELECT id FROM users WHERE email=$1', [address]))
        fail('Email already exists', 409);
      const u = await insert(db, 'users', {
        name,
        email: address,
        role,
        password_hash: await hashPassword(password),
      });
      await audit(db, req, 'Account created', role);
      return userJson(u);
    });
    res.status(201).json(result);
  });
  app.get('/api/meetings', require(), async (req, res) =>
    res.json(
      (
        await rows(
          pool,
          'SELECT * FROM meetings WHERE demo_session_id IS NOT DISTINCT FROM $1 ORDER BY date DESC,id DESC LIMIT 500',
          [req.demo],
        )
      ).map(meetingJson),
    ),
  );
  app.post('/api/meetings', require(), async (req, res) => {
    const data = req.body;
    const values = Object.fromEntries(
      ['forum_type', 'department', 'facilitator'].map((k) => [
        k,
        field(data, k, k === 'forum_type' ? 80 : 120),
      ]),
    );
    const when = date(data.date);
    const count = data.num_participants;
    const participants = data.participants_list ?? [];
    if (!when || !Number.isInteger(count) || count < 1 || count > 10000)
      fail('Enter a meeting date and participant count from 1 to 10,000');
    if (!Array.isArray(participants) || participants.length > count)
      fail('Participant details must match the participant count');
    for (const p of participants) {
      if (!p || typeof p !== 'object' || Array.isArray(p))
        fail('Each participant needs a name or employee ID');
      const name = field(p, 'name', 120, false);
      const empid = field(p, 'empid', 80, false);
      if (!name && !empid) fail('Each participant needs a name or employee ID');
    }
    const result = await transaction(pool, async (db) => {
      await guard(db, req);
      if (
        req.demo &&
        Number(
          (
            await one(
              db,
              'SELECT COUNT(*) AS n FROM meetings WHERE demo_session_id=$1',
              [req.demo],
            )
          ).n,
        ) >= 50
      )
        fail('Demo limit: 50 meetings per session', 429);
      const m = await insert(db, 'meetings', {
        ...values,
        date: when,
        num_participants: count,
        participants_list: JSON.stringify(participants),
        demo_session_id: req.demo,
      });
      await audit(db, req, 'Meeting recorded', `Meeting #${m.id}`);
      return meetingJson(m);
    });
    res.status(201).json(result);
  });
  app.get('/api/meetings/:id', require(), async (req, res) => {
    const m = await getMeeting(pool, req, req.params.id);
    res.json({
      ...meetingJson(m),
      logs: (
        await rows(
          pool,
          'SELECT a.*,u.name AS user_owner_name FROM actions a LEFT JOIN users u ON u.id=a.owner_id WHERE meeting_id=$1 ORDER BY a.id',
          [m.id],
        )
      ).map((a) => actionJson(a)),
    });
  });
  app.post('/api/meetings/:id/logs', require(), async (req, res) => {
    const data = req.body;
    const values = Object.fromEntries(
      [
        'discussion_point',
        'action_description',
        'category',
        'contact_person',
      ].map((k) => [
        k,
        field(
          data,
          k,
          ['discussion_point', 'action_description'].includes(k) ? 4000 : 120,
        ),
      ]),
    );
    const priority = data.priority ?? 'Medium';
    if (!['High', 'Medium', 'Low'].includes(priority))
      fail('Choose High, Medium, or Low priority');
    const result = await transaction(pool, async (db) => {
      const m = await getMeeting(db, req, req.params.id);
      await guard(db, req);
      await db.query('SELECT id FROM meetings WHERE id=$1 FOR UPDATE', [m.id]);
      if (
        Number(
          (
            await one(
              db,
              'SELECT COUNT(*) AS n FROM actions WHERE meeting_id=$1',
              [m.id],
            )
          ).n,
        ) >= 100
      )
        fail('Maximum 100 actions per meeting', 429);
      const a = await insert(db, 'actions', {
        ...values,
        meeting_id: m.id,
        priority,
        owner_name: field(data, 'owner_name', 120, false),
        contact_email: email(data.contact_email),
        due_date: date(data.due_date),
      });
      await touch(db, a);
      await audit(db, req, 'Action recorded', `Action #${a.id}`);
      return actionJson(a);
    });
    res.status(201).json(result);
  });
  app.get('/api/actions', require(), async (req, res) => {
    const records = await rows(
      pool,
      `SELECT a.*,u.name AS user_owner_name,row_to_json(m) AS meeting FROM actions a JOIN meetings m ON m.id=a.meeting_id LEFT JOIN users u ON u.id=a.owner_id WHERE m.demo_session_id IS NOT DISTINCT FROM $1 ORDER BY a.id DESC LIMIT 500`,
      [req.demo],
    );
    res.json(records.map((a) => actionJson(a, a.meeting)));
  });
  app.get('/api/logs/:id', require(), async (req, res) =>
    res.json(await details(pool, req, req.params.id)),
  );
  app.patch('/api/logs/:id', require(), async (req, res) => {
    const result = await transaction(pool, async (db) => {
      const a = await getAction(db, req, req.params.id);
      await guard(db, req);
      const data = req.body;
      const changes = {};
      for (const [key, options] of [
        ['status', ['Open', 'In Progress', 'Completed']],
        ['priority', ['High', 'Medium', 'Low']],
      ])
        if (key in data) {
          if (!options.includes(data[key])) fail(`Choose a valid ${key}`);
          changes[key] = data[key];
        }
      for (const key of ['contact_person', 'owner_name'])
        if (key in data)
          changes[key] = field(data, key, 120, key === 'contact_person');
      if ('contact_email' in data)
        changes.contact_email = email(data.contact_email);
      if ('due_date' in data) changes.due_date = date(data.due_date);
      const remark = data.remark || data.owner_remarks || data.hr_remarks;
      if (remark) {
        if (
          typeof remark !== 'string' ||
          !remark.trim() ||
          remark.length > 12000
        )
          fail('Enter a remark up to 12,000 characters');
        await insert(db, 'remarks', {
          action_id: a.id,
          author: req.demo
            ? 'Demo visitor'
            : req.user.role === 'hr_team'
              ? 'HR Team'
              : 'Admin',
          remark: remark.trim(),
        });
      }
      const keys = Object.keys(changes);
      if (keys.length)
        await db.query(
          `UPDATE actions SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${keys.length + 1}`,
          [...Object.values(changes), a.id],
        );
      await touch(db, a);
      await audit(db, req, 'Follow-up updated', `Action #${a.id}`);
      return actionJson(
        await getAction(db, req, a.id),
        await getMeeting(db, req, a.meeting_id),
      );
    });
    res.json(result);
  });
  app.post('/api/logs/:id/messages', require(), async (req, res) => {
    const body = field(req.body, 'body', 20000);
    const direction = req.body.direction || 'incoming';
    if (!['incoming', 'outgoing', 'note'].includes(direction))
      fail('Choose incoming, outgoing, or note');
    const result = await transaction(pool, async (db) => {
      const a = await getAction(db, req, req.params.id);
      await guard(db, req);
      await db.query('SELECT id FROM actions WHERE id=$1 FOR UPDATE', [a.id]);
      if (
        Number(
          (
            await one(
              db,
              'SELECT COUNT(*) AS n FROM conversation_messages WHERE action_id=$1',
              [a.id],
            )
          ).n,
        ) >= 100
      )
        fail('Maximum 100 messages per action', 429);
      const m = await insert(db, 'conversation_messages', {
        action_id: a.id,
        body,
        direction,
        sender: field(req.body, 'sender', 255, false),
        subject: field(req.body, 'subject', 500, false),
      });
      await touch(db, a);
      if (direction === 'incoming')
        await insert(db, 'notifications', {
          action_id: a.id,
          demo_session_id: req.demo,
          title: 'Reply recorded',
          body: `A pasted reply was recorded for action #${a.id}.`,
        });
      await audit(db, req, 'Email conversation updated', `Action #${a.id}`);
      return messageJson(m);
    });
    res.status(201).json(result);
  });
  app.post('/api/logs/:id/ai', require(), async (req, res) => {
    const task = req.body.task;
    if (!['summary', 'draft'].includes(task)) fail('Choose summary or draft');
    const instructions = field(req.body, 'instructions', 1000, false);
    const a = await details(pool, req, req.params.id);
    const context = {
      discussion: a.discussion_point,
      requested_action: a.action_description,
      status: a.status,
      owner: a.owner_name,
      recipient: a.contact_person,
      due_date: a.due_date,
      messages: a.messages,
      remarks: a.history.map((r) => ({
        id: r.id,
        author: r.author_type,
        text: r.remark,
        time: r.created_at,
      })),
    };
    if (req.demo) {
      if (!config.env.OPENAI_API_KEY)
        fail(
          'Live demo AI is not enabled yet. Conversation editing and exports still work.',
          503,
        );
      await transaction(pool, async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(70104)');
        const counts = await one(
          db,
          `SELECT COUNT(*) FILTER (WHERE demo_session_id=$1) AS session,COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1 day') AS daily FROM ai_usage`,
          [req.demo],
        );
        if (Number(counts.session) >= limit('DEMO_AI_SESSION_LIMIT', 5))
          fail('This demo session has used its AI allowance.', 429);
        if (Number(counts.daily) >= limit('DEMO_AI_DAILY_LIMIT', 50))
          fail('Demo AI has reached its daily allowance.', 429);
        await insert(db, 'ai_usage', { demo_session_id: req.demo });
      });
    }
    const generated = await (services.generate || generate)(
      task,
      context,
      Boolean(req.demo),
      instructions,
      config.env,
    );
    const result = await transaction(pool, async (db) => {
      const output = await insert(db, 'ai_results', {
        action_id: a.id,
        task,
        ...generated,
      });
      await audit(
        db,
        req,
        'AI generated',
        `${task} for action #${a.id} (${output.provider})`,
      );
      return pick(output, 'id task content provider model created_at');
    });
    res.status(201).json(result);
  });
  app.get('/api/calendar', require(), async (req, res) => {
    const start =
      date(req.query.start) || new Date().toISOString().slice(0, 7) + '-01';
    const end = date(req.query.end) || plusDays(start, 62);
    if (end < start) fail('End date must follow the start date');
    const meetings = await rows(
      pool,
      'SELECT * FROM meetings WHERE demo_session_id IS NOT DISTINCT FROM $1 AND date BETWEEN $2 AND $3',
      [req.demo, start, end],
    );
    const actions = await rows(
      pool,
      'SELECT a.* FROM actions a JOIN meetings m ON m.id=a.meeting_id WHERE m.demo_session_id IS NOT DISTINCT FROM $1 AND a.due_date BETWEEN $2 AND $3',
      [req.demo, start, end],
    );
    res.json([
      ...meetings.map((m) => ({
        id: `meeting-${m.id}`,
        type: 'meeting',
        date: m.date,
        title: `${m.forum_type}: ${m.department}`,
        meeting_id: m.id,
      })),
      ...actions.map((a) => ({
        id: `action-${a.id}`,
        type: 'action',
        date: a.due_date,
        title: a.action_description,
        action_id: a.id,
        meeting_id: a.meeting_id,
        status: a.status,
        priority: a.priority,
      })),
    ]);
  });
  const notices = (req) =>
    rows(
      pool,
      `SELECT n.*,a.meeting_id FROM notifications n LEFT JOIN actions a ON a.id=n.action_id WHERE n.demo_session_id IS NOT DISTINCT FROM $1 AND ($1::text IS NOT NULL OR n.user_id IS NULL OR n.user_id=$2) ORDER BY n.created_at DESC,n.id DESC LIMIT 100`,
      [req.demo, req.user.id],
    );
  app.get('/api/notifications', require(), async (req, res) =>
    res.json(
      (await notices(req)).map((n) =>
        pick(n, 'id action_id meeting_id title body read created_at'),
      ),
    ),
  );
  app.post('/api/notifications/:id/read', require(), async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) fail('Notification not found', 404);
    const result = await one(
      pool,
      `UPDATE notifications SET read=true WHERE id=$1 AND demo_session_id IS NOT DISTINCT FROM $2 AND ($2::text IS NOT NULL OR user_id IS NULL OR user_id=$3) RETURNING id`,
      [req.params.id, req.demo, req.user.id],
    );
    if (!result) fail('Notification not found', 404);
    res.json({ ok: true });
  });
  app.get('/api/reports/export', require(), async (req, res) => {
    const [start, end, label] = periodBounds(req.query);
    const archive = await transaction(pool, async (db) => {
      const meetings = await rows(
        db,
        `SELECT * FROM meetings WHERE demo_session_id IS NOT DISTINCT FROM $1 AND ($2::date IS NULL OR date >= $2) AND ($3::date IS NULL OR date < $3) ORDER BY date,id`,
        [req.demo, start, end],
      );
      const ids = meetings.map((m) => m.id);
      const actions = await rows(
        db,
        'SELECT * FROM actions WHERE meeting_id=ANY($1::int[]) ORDER BY id',
        [ids],
      );
      const actionIds = actions.map((a) => a.id);
      const definitions = [
        [
          'meetings',
          'id forum_type date department facilitator num_participants participants_list created_at updated_at',
          meetings,
        ],
        [
          'actions',
          'id meeting_id discussion_point category priority action_description owner_name contact_person contact_email status due_date created_at updated_at',
          actions,
        ],
        [
          'followups',
          'id action_id author remark created_at',
          await rows(
            db,
            'SELECT * FROM remarks WHERE action_id=ANY($1::int[]) ORDER BY id',
            [actionIds],
          ),
        ],
        [
          'conversations',
          'id action_id sender subject body direction source sent_at recorded_at',
          await rows(
            db,
            'SELECT * FROM conversation_messages WHERE action_id=ANY($1::int[]) ORDER BY id',
            [actionIds],
          ),
        ],
        [
          'ai_outputs',
          'id action_id task content provider model created_at',
          await rows(
            db,
            'SELECT * FROM ai_results WHERE action_id=ANY($1::int[]) ORDER BY id',
            [actionIds],
          ),
        ],
        [
          'notifications',
          'id action_id title body read created_at',
          await rows(
            db,
            'SELECT * FROM notifications WHERE action_id=ANY($1::int[]) AND demo_session_id IS NOT DISTINCT FROM $2 AND (user_id IS NULL OR user_id=$3) ORDER BY id',
            [actionIds, req.demo, req.user.id],
          ),
        ],
      ];
      await audit(db, req, 'CSV exported', label);
      return zipSync(
        Object.fromEntries(
          definitions.map(([name, fields, records]) => [
            `${name}.csv`,
            strToU8(csv(fields.split(' '), records)),
          ]),
        ),
      );
    });
    res
      .attachment(`onevoice-${label}.zip`)
      .type('application/zip')
      .send(Buffer.from(archive));
  });
  app.get('/api/admin/activity', require('hr_admin'), async (req, res) =>
    res.json(
      await rows(
        pool,
        'SELECT id,event,detail,actor_role,demo_session_id,created_at FROM activity ORDER BY created_at DESC,id DESC LIMIT 100',
      ),
    ),
  );
  const job = (req, res, next) => {
    if (
      !config.env.JOB_KEY ||
      !safeEqual(req.get('X-Job-Key'), config.env.JOB_KEY)
    )
      fail('Unauthorized', 401);
    next();
  };
  app.post('/api/jobs/reminders', job, async (req, res) => {
    const count = await transaction(pool, async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(70107)');
      const actions = await rows(
        db,
        `SELECT a.* FROM actions a JOIN meetings m ON m.id=a.meeting_id WHERE m.demo_session_id IS NULL AND a.status <> 'Completed' AND a.due_date <= CURRENT_DATE+7 AND (a.last_reminded_at IS NULL OR a.last_reminded_at::date <> CURRENT_DATE)`,
      );
      for (const a of actions) {
        await insert(db, 'notifications', {
          action_id: a.id,
          title: 'Action needs a follow-up',
          body: `Action #${a.id} is due ${a.due_date}.`,
        });
        await db.query(
          'UPDATE actions SET last_reminded_at=NOW() WHERE id=$1',
          [a.id],
        );
      }
      return actions.length;
    });
    res.json({ created: count });
  });
  gmailRoutes(app, {
    pool,
    config,
    require,
    audit,
    getAction,
    touch,
    eligible,
    job,
    services,
  });
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'healthy', database: 'postgresql' });
    } catch {
      res.status(503).json({ status: 'unhealthy', database: 'unavailable' });
    }
  });
  app.use('/api', (req, res) =>
    res.status(404).json({ error: 'Endpoint not found' }),
  );
  const frontend = fileURLToPath(new URL('../frontend/dist/', import.meta.url));
  app.use(express.static(frontend));
  app.get('/{*path}', (req, res) =>
    existsSync(frontend + '/index.html')
      ? res.sendFile(frontend + '/index.html')
      : res.json({
          status: 'API running',
          frontend: 'Start npm run dev in frontend or build frontend/dist',
          health: '/api/health',
        }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.code === '23505' ? 409 : 500);
    if (status === 500)
      console.error('Request failed:', error.code || error.name);
    res
      .status(status)
      .json({
        error:
          status === 500
            ? 'The workspace is temporarily unavailable. Please try again.'
            : error.type === 'entity.parse.failed'
              ? 'Request body must be a JSON object'
              : error.code === '23505'
                ? 'Record already exists'
                : error.message,
      });
  });
  return app;
}

export { syncGmail };
