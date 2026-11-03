import { PGlite } from '@electric-sql/pglite';
import { settings } from '../config.js';
import { bootstrap } from '../db.js';
import { createApp } from '../app.js';

export async function fixture(overrides = {}, services = {}) {
  const engine = new PGlite();
  let pending = Promise.resolve();
  const acquire = async () => {
    const previous = pending;
    let release;
    pending = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  };
  const query = async (sql, values = []) => {
    if (!values.length && sql.split(';').filter((s) => s.trim()).length > 1)
      return (await engine.exec(sql)).at(-1);
    const result = await engine.query(sql, values);
    for (const field of result.fields)
      if (field.dataTypeID === 1082)
        for (const row of result.rows)
          if (row[field.name] instanceof Date)
            row[field.name] = row[field.name].toISOString().slice(0, 10);
    return result;
  };
  const pool = {
    async query(sql, values) {
      const release = await acquire();
      try {
        return await query(sql, values);
      } finally {
        release();
      }
    },
    async connect() {
      const release = await acquire();
      return { query, release };
    },
    async end() {
      await pending;
      await engine.close();
    },
  };
  const env = {
    DATABASE_URL: 'postgresql://localhost/isolated_test',
    SECRET_KEY: 'test-secret-at-least-thirty-two-characters',
    ADMIN_PASSWORD: 'test-admin-password',
    NODE_ENV: 'test',
    JOB_KEY: 'test-job-key',
    ...overrides,
  };
  const config = settings(env);
  await bootstrap(pool, config);
  return { pool, config, app: createApp(pool, config, services) };
}
