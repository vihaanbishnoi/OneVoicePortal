import { settings } from './config.js';
import { database, bootstrap } from './db.js';
import { createApp, syncGmail } from './app.js';
import { configured } from './gmail.js';

const config = settings();
const pool = database(config.databaseUrl);
pool.on('error', () =>
  console.error('Database connection temporarily unavailable'),
);
try {
  await bootstrap(pool, config);
} catch (error) {
  console.error('Database startup failed:', error.code || error.name);
  await pool.end();
  process.exit(1);
}
const app = createApp(pool, config);
const server = app.listen(Number(config.env.PORT || 5000), '0.0.0.0', () =>
  console.log(
    `OneVoice Express API listening on port ${config.env.PORT || 5000}`,
  ),
);
server.requestTimeout = 240000;
let timer;
let stopping = false;
let pendingSync;
const interval = Number(config.env.GMAIL_POLL_SECONDS || 60);
async function poll() {
  if (stopping) return;
  try {
    pendingSync = syncGmail(pool, config);
    await pendingSync;
  } catch {
    console.warn('Background Gmail sync temporarily unavailable');
  } finally {
    pendingSync = null;
    if (!stopping) timer = setTimeout(poll, Math.max(30, interval) * 1000);
  }
}
if (interval > 0 && configured(config.env))
  timer = setTimeout(poll, Math.max(30, interval) * 1000);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    clearTimeout(timer);
    server.close(async () => {
      await pendingSync?.catch(() => {});
      await pool.end();
    });
  });
