import {
  randomBytes,
  scrypt as scryptCallback,
  pbkdf2 as pbkdf2Callback,
  timingSafeEqual,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const pbkdf2 = promisify(pbkdf2Callback);
export const ADMIN_EMAIL = 'vihaan4263@gmail.com';
export const SHARED_EMAIL = 'shared-hr@onevoice.invalid';
export const DEMO_EMAIL = 'demo@onevoice.invalid';
export const version = (user) =>
  createHash('sha256').update(user.password_hash).digest('hex');
export function safeEqual(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && timingSafeEqual(left, right);
}
// Read and write Werkzeug-compatible hashes, preserving existing accounts and rollback.
export async function hashPassword(password) {
  const salt = randomBytes(12).toString('hex');
  const hash = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:32768:8:1$${salt}$${hash.toString('hex')}`;
}
export async function checkPassword(stored, password) {
  try {
    const [method, salt, expected] = stored.split('$');
    const [algorithm, ...params] = method.split(':');
    let actual;
    if (algorithm === 'scrypt') {
      const [N, r, p] = params.map(Number);
      actual = await scrypt(password, salt, 64, {
        N,
        r,
        p,
        maxmem: 128 * 1024 * 1024,
      });
    } else if (algorithm === 'pbkdf2') {
      actual = await pbkdf2(
        password,
        salt,
        Number(params[1]),
        Buffer.from(expected, 'hex').length,
        params[0],
      );
    } else return false;
    return safeEqual(actual.toString('hex'), expected);
  } catch {
    return false;
  }
}
// Fernet wire format matches Python cryptography's existing stored Gmail tokens.
export function encryptCredentials(value, secret) {
  const key = Buffer.from(secret || '', 'base64url');
  if (key.length !== 32) throw new Error('Invalid Gmail token encryption key');
  const header = Buffer.alloc(9);
  header[0] = 0x80;
  header.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)), 1);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-128-cbc', key.subarray(16), iv);
  const data = Buffer.concat([
    header,
    iv,
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  // Python Fernet requires the URL-safe base64 padding to be retained.
  return Buffer.concat([
    data,
    createHmac('sha256', key.subarray(0, 16)).update(data).digest(),
  ])
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}
export function decryptCredentials(value, secret) {
  const key = Buffer.from(secret || '', 'base64url');
  const token = Buffer.from(value, 'base64url');
  if (key.length !== 32 || token.length < 73 || token[0] !== 0x80)
    throw new Error('Invalid encrypted credentials');
  const data = token.subarray(0, -32);
  const signature = createHmac('sha256', key.subarray(0, 16))
    .update(data)
    .digest();
  if (!timingSafeEqual(signature, token.subarray(-32)))
    throw new Error('Invalid encrypted credentials');
  const cipher = createDecipheriv(
    'aes-128-cbc',
    key.subarray(16),
    data.subarray(9, 25),
  );
  return JSON.parse(
    Buffer.concat([cipher.update(data.subarray(25)), cipher.final()]).toString(
      'utf8',
    ),
  );
}
