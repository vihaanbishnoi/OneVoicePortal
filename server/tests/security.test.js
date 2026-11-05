import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  randomBytes,
  scryptSync,
  pbkdf2Sync,
  createDecipheriv,
  createHmac,
} from 'node:crypto';
import {
  checkPassword,
  hashPassword,
  encryptCredentials,
  decryptCredentials,
} from '../security.js';
import { settings } from '../config.js';
import { generate } from '../ai.js';
import { messageBody, encodedSubject } from '../gmail.js';

test('Werkzeug-format password hashes remain compatible', async () => {
  const password = 'migration-test-password';
  const salt = randomBytes(12).toString('hex');
  const derived = scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const legacyHash = `scrypt:32768:8:1$${salt}$${derived.toString('hex')}`;
  assert.equal(await checkPassword(legacyHash, password), true);
  assert.equal(await checkPassword(legacyHash, 'wrong'), false);
  const pbkdf = pbkdf2Sync(password, salt, 1000, 32, 'sha256');
  assert.equal(
    await checkPassword(
      `pbkdf2:sha256:1000$${salt}$${pbkdf.toString('hex')}`,
      password,
    ),
    true,
  );
  assert.equal(
    await checkPassword(await hashPassword(password), password),
    true,
  );
});

test('credentials use authenticated Fernet format without stored test secrets', () => {
  const key = randomBytes(32);
  const encodedKey = key.toString('base64url');
  const credentials = { refresh_token: 'fictional-refresh-token' };
  const encrypted = encryptCredentials(credentials, encodedKey);
  assert.deepEqual(decryptCredentials(encrypted, encodedKey), credentials);

  // Check the wire format independently of decryptCredentials, including padding
  // required by Python cryptography when reading existing Gmail connections.
  assert.equal(encrypted.length % 4, 0);
  const token = Buffer.from(encrypted, 'base64url');
  assert.equal(token[0], 0x80);
  assert.ok(Math.abs(Number(token.readBigUInt64BE(1)) - Date.now() / 1000) < 5);
  assert.deepEqual(
    createHmac('sha256', key.subarray(0, 16))
      .update(token.subarray(0, -32))
      .digest(),
    token.subarray(-32),
  );
  const decipher = createDecipheriv(
    'aes-128-cbc',
    key.subarray(16),
    token.subarray(9, 25),
  );
  assert.deepEqual(
    JSON.parse(
      Buffer.concat([
        decipher.update(token.subarray(25, -32)),
        decipher.final(),
      ]).toString(),
    ),
    credentials,
  );
  assert.throws(() =>
    decryptCredentials(encrypted, randomBytes(32).toString('base64url')),
  );
  token[30] ^= 1;
  assert.throws(() =>
    decryptCredentials(token.toString('base64url'), encodedKey),
  );
});

test('startup accepts legacy URLs, rejects missing credentials and unsafe public settings', () => {
  const env = {
    DATABASE_URL: 'postgresql+psycopg2://user:secret@host/db?sslmode=require',
    SECRET_KEY: 's'.repeat(32),
    ADMIN_PASSWORD: 'a'.repeat(12),
    PUBLIC_DEPLOYMENT: '1',
  };
  assert.equal(
    settings(env).databaseUrl,
    'postgresql://user:secret@host/db?sslmode=require',
  );
  for (const change of [
    { DATABASE_URL: 'sqlite://local' },
    { SECRET_KEY: '' },
    { ADMIN_PASSWORD: '' },
    { ALLOW_SHARED_HR_LOGIN: '1' },
  ])
    assert.throws(() => settings({ ...env, ...change }));
});

test('AI uses correct provider, bounds context and never falls back from private to OpenAI', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        response: 'Private summary',
        output: [{ content: [{ type: 'output_text', text: 'Demo summary' }] }],
      }),
    };
  };
  const env = { OPENAI_API_KEY: 'fictional' };
  assert.equal(
    (await generate('summary', { messages: [] }, false, '', env, fetcher))
      .provider,
    'ollama',
  );
  assert.ok(calls[0].url.startsWith('http://127.0.0.1:11434'));
  assert.equal(
    (await generate('draft', { messages: [] }, true, 'Friendly', env, fetcher))
      .provider,
    'openai',
  );
  assert.equal(calls[1].body.store, false);
  const failedCalls = [];
  await assert.rejects(
    generate('summary', {}, false, '', env, async (url) => {
      failedCalls.push(url);
      throw new Error('Offline');
    }),
    /Private text is never redirected/,
  );
  assert.equal(failedCalls.length, 1);
  assert.ok(failedCalls[0].includes('11434'));
  await assert.rejects(
    generate(
      'summary',
      {},
      false,
      '',
      { OLLAMA_MODEL: 'cloud-model' },
      fetcher,
    ),
    /locally installed/,
  );
  await assert.rejects(
    generate('summary', { body: 'x'.repeat(25000) }, true, '', env, fetcher),
    /context limit/,
  );
  await assert.rejects(
    generate('summary', {}, true, '', {}, fetcher),
    /not enabled/,
  );
});

test('Gmail MIME extraction prefers plain text and excludes attachments', () => {
  const part = (mimeType, text, filename) => ({
    mimeType,
    filename,
    body: { data: Buffer.from(text).toString('base64url') },
  });
  assert.equal(
    messageBody({
      parts: [
        part('text/plain', 'Plain message'),
        part('text/html', '<p>HTML message</p>'),
        part('text/plain', 'Secret attachment', 'file.txt'),
      ],
    }),
    'Plain message',
  );
  assert.equal(
    messageBody(part('text/html', '<p>HTML message</p>')),
    'HTML message',
  );
});

test('startup rejects malformed quotas and runtime numbers without exposing values', () => {
  const env = {
    DATABASE_URL: 'postgresql://localhost/test',
    SECRET_KEY: 'test',
    ADMIN_PASSWORD: 'test',
  };
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
    for (const value of ['', 'NaN', '-1', '1.5', 'Infinity', '2147483648']) {
      assert.throws(
        () => settings({ ...env, [name]: value }),
        new RegExp(name),
      );
    }
  }
  assert.doesNotThrow(() =>
    settings({
      ...env,
      DEMO_AI_DAILY_LIMIT: '0',
      GMAIL_POLL_SECONDS: '0',
    }),
  );
  assert.throws(() => settings({ ...env, PORT: '65536' }), /PORT/);
  assert.throws(
    () => settings({ ...env, OLLAMA_CONTEXT: '0' }),
    /OLLAMA_CONTEXT/,
  );
  assert.throws(
    () => settings({ ...env, ADMIN_PASSWORD: 'a'.repeat(257) }),
    /ADMIN_PASSWORD/,
  );
});

test('long Unicode subjects fold safely and preserve text', () => {
  const subject = 'Follow up 😀 résumé '.repeat(30);
  const header = encodedSubject(subject);
  const lines = header.split('\r\n');
  assert.ok(lines.every((line) => line.length <= 69));
  const decoded = lines
    .map((line) =>
      Buffer.from(line.trim().slice(10, -2), 'base64').toString('utf8'),
    )
    .join('');
  assert.equal(decoded, subject);
  assert.ok(!encodedSubject('Hello\r\nBcc: test').includes('\n'));
});
