import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  checkPassword,
  hashPassword,
  encryptCredentials,
  decryptCredentials,
} from '../security.js';
import { settings } from '../config.js';
import { generate } from '../ai.js';
import { messageBody } from '../gmail.js';

test('Python-generated password hashes and Fernet credentials survive migration', async () => {
  const legacy = JSON.parse(
    await readFile(new URL('./legacy-fixture.json', import.meta.url)),
  );
  assert.equal(await checkPassword(legacy.hash, legacy.password), true);
  assert.equal(await checkPassword(legacy.hash, 'wrong'), false);
  assert.equal(
    await checkPassword(await hashPassword('new-password'), 'new-password'),
    true,
  );
  assert.deepEqual(decryptCredentials(legacy.token, legacy.key), {
    refresh_token: 'fictional-refresh-token',
  });
  const encrypted = encryptCredentials(
    { refresh_token: 'new-fictional-token' },
    legacy.key,
  );
  assert.deepEqual(decryptCredentials(encrypted, legacy.key), {
    refresh_token: 'new-fictional-token',
  });
  const bytes = Buffer.from(encrypted, 'base64url');
  bytes[30] ^= 1;
  assert.throws(() =>
    decryptCredentials(bytes.toString('base64url'), legacy.key),
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
