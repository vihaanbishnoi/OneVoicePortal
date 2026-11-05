import 'dotenv/config';
import { pathToFileURL } from 'node:url';

export function settings(env = process.env) {
  const config = {
    env,
    databaseUrl: (env.DATABASE_URL || '')
      .trim()
      .replace(/^postgresql\+psycopg2:/, 'postgresql:'),
    secret: env.SECRET_KEY,
    adminPassword: env.ADMIN_PASSWORD,
    public: env.PUBLIC_DEPLOYMENT === '1' || env.RENDER === 'true',
    sharedLogin: env.ALLOW_SHARED_HR_LOGIN === '1',
    demoEnabled: env.DEMO_ENABLED !== '0',
    frontend: (
      env.FRONTEND_URL ||
      env.RENDER_EXTERNAL_URL ||
      'http://localhost:5173'
    ).replace(/\/$/, ''),
    cors: (env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((s) => s.trim()),
  };
  const errors = [];
  for (const name of [
    'DEMO_SESSION_WRITE_LIMIT',
    'DEMO_DAILY_WRITE_LIMIT',
    'DEMO_DAILY_SESSION_LIMIT',
    'DEMO_AI_SESSION_LIMIT',
    'DEMO_AI_DAILY_LIMIT',
    'GMAIL_POLL_SECONDS',
    'OLLAMA_CONTEXT',
    'PORT',
  ]) {
    if (env[name] === undefined) continue;
    const minimum = ['PORT', 'OLLAMA_CONTEXT'].includes(name) ? 1 : 0;
    const maximum = name === 'PORT' ? 65535 : 2147483647;
    const value = Number(env[name]);
    if (
      !/^\d+$/.test(String(env[name])) ||
      !Number.isSafeInteger(value) ||
      value < minimum ||
      value > maximum
    )
      errors.push(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  if (config.adminPassword?.length > 256)
    errors.push('ADMIN_PASSWORD must be at most 256 characters');
  if (config.sharedLogin && !env.HR_TEAM_PASSWORD)
    errors.push('HR_TEAM_PASSWORD is required when shared login is enabled');
  if (!/^postgres(?:ql)?:\/\//.test(config.databaseUrl))
    errors.push('DATABASE_URL must be a PostgreSQL connection URL');
  if (!config.secret || (config.public && config.secret.length < 32))
    errors.push('SECRET_KEY is required (at least 32 characters publicly)');
  if (
    !config.adminPassword ||
    (config.public && config.adminPassword.length < 12)
  )
    errors.push('ADMIN_PASSWORD is required (at least 12 characters publicly)');
  if (config.public && config.sharedLogin)
    errors.push('ALLOW_SHARED_HR_LOGIN must be 0 on public deployments');
  if (errors.length)
    throw new Error('Invalid server configuration: ' + errors.join('; '));
  return config;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    settings({
      ...process.env,
      ...(process.argv.includes('--public') ? { PUBLIC_DEPLOYMENT: '1' } : {}),
    });
    console.log(
      'Startup settings are valid. Database connectivity has not been checked.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
