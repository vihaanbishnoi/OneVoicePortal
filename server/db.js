import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import {
  ADMIN_EMAIL,
  SHARED_EMAIL,
  DEMO_EMAIL,
  checkPassword,
  hashPassword,
} from './security.js';

pg.types.setTypeParser(1082, (value) => value);
export function database(url) {
  return new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: 10000,
  });
}
export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export const rows = async (db, sql, values = []) =>
  (await db.query(sql, values)).rows;
export const one = async (db, sql, values = []) =>
  (await rows(db, sql, values))[0];

const defaults = {
  users: { active: true, role: 'action_owner' },
  meetings: { participants_list: '[]', demo_session_id: null },
  actions: {
    priority: 'Medium',
    contact_email: '',
    owner_name: '',
    status: 'Open',
  },
  conversation_messages: {
    sender: '',
    subject: '',
    direction: 'incoming',
    source: 'manual',
  },
  notifications: {
    read: false,
    user_id: null,
    action_id: null,
    demo_session_id: null,
  },
  activity: {
    actor_id: null,
    actor_role: 'anonymous',
    detail: '',
    demo_session_id: null,
  },
};
const created = new Set([
  'demo_sessions',
  'meetings',
  'actions',
  'remarks',
  'notifications',
  'activity',
  'gmail_connections',
  'ai_results',
  'ai_usage',
]);
const tables = new Set([...created, 'users', 'conversation_messages']);
export async function insert(db, table, data) {
  if (!tables.has(table)) throw new Error('Invalid table');
  const now = new Date();
  const values = {
    ...defaults[table],
    ...(created.has(table) ? { created_at: now } : {}),
    ...(['meetings', 'actions'].includes(table) ? { updated_at: now } : {}),
    ...(table === 'conversation_messages' ? { recorded_at: now } : {}),
    ...data,
  };
  const keys = Object.keys(values);
  if (keys.some((k) => !/^[a-z_]+$/.test(k))) throw new Error('Invalid column');
  return one(
    db,
    `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    Object.values(values),
  );
}
export async function bootstrap(pool, config) {
  const schema = await readFile(
    new URL('./schema.sql', import.meta.url),
    'utf8',
  );
  await transaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(70101)');
    // Old schemas need added columns before CREATE INDEX runs.
    const [tablesSql, ...indexes] = schema.split(
      /(?=CREATE INDEX IF NOT EXISTS)/,
    );
    await db.query(tablesSql);
    await db.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS demo_session_id VARCHAR(36) REFERENCES demo_sessions(id);
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
      ALTER TABLE actions ADD COLUMN IF NOT EXISTS owner_name VARCHAR(120) NOT NULL DEFAULT '';
      ALTER TABLE actions ADD COLUMN IF NOT EXISTS gmail_thread_id VARCHAR(255);
      ALTER TABLE actions ADD COLUMN IF NOT EXISTS gmail_mailbox VARCHAR(255);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS demo_session_id VARCHAR(36) REFERENCES demo_sessions(id);`);
    for (const index of indexes) await db.query(index);
    // Server-side OAuth state allows single-use callbacks across processes.
    await db.query(`CREATE TABLE IF NOT EXISTS oauth_states (
      id VARCHAR(64) PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      credential_version TEXT NOT NULL, verifier TEXT NOT NULL, return_origin TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL)`);
    await db.query('SELECT pg_advisory_xact_lock(70105)');
    for (const [email, name, role, password] of [
      [ADMIN_EMAIL, 'Vihaan', 'hr_admin', config.adminPassword],
      [
        SHARED_EMAIL,
        'HR Team',
        'hr_team',
        config.env.HR_TEAM_PASSWORD || randomBytes(32).toString('hex'),
      ],
      [DEMO_EMAIL, 'Demo visitor', 'demo', null],
    ]) {
      const user = await one(db, 'SELECT * FROM users WHERE email=$1', [email]);
      if (!user)
        await insert(db, 'users', {
          email,
          name,
          role,
          password_hash: await hashPassword(
            password || randomBytes(32).toString('hex'),
          ),
        });
      else if (password) {
        const hash = (await checkPassword(user.password_hash, password))
          ? user.password_hash
          : await hashPassword(password);
        await db.query(
          'UPDATE users SET name=$1,role=$2,password_hash=$3 WHERE id=$4',
          [name, role, hash, user.id],
        );
      }
    }
  });
}

export async function touchAction(db, a) {
  await db.query('UPDATE actions SET updated_at=NOW() WHERE id=$1', [a.id]);
  await db.query('UPDATE meetings SET updated_at=NOW() WHERE id=$1', [
    a.meeting_id,
  ]);
}
