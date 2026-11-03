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
