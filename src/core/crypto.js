/** Web Crypto：PBKDF2 + AES-GCM。PIN 不落盘。 */

export const PBKDF2_ITERATIONS = 310000;

export function subtle() {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('Web Crypto unavailable');
  return c.subtle;
}

export function randomBytes(n) {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error('crypto.getRandomValues unavailable');
  const buf = new Uint8Array(n);
  c.getRandomValues(buf);
  return buf;
}

export function b64encode(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function b64decode(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export async function deriveKey(pin, salt, iterations = PBKDF2_ITERATIONS) {
  const pinStr = String(pin ?? '');
  if (!pinStr) throw new Error('PIN required');
  const saltU8 = salt instanceof Uint8Array ? salt : b64decode(String(salt));
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(pinStr),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: saltU8, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(key, obj) {
  const iv = randomBytes(12);
  const data = new TextEncoder().encode(JSON.stringify(obj ?? {}));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, data);
  return { ivB64: b64encode(iv), ctB64: b64encode(new Uint8Array(ct)) };
}

export async function decryptJson(key, ivB64, ctB64) {
  const iv = b64decode(ivB64);
  const ct = b64decode(ctB64);
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

export function newSaltB64() {
  return b64encode(randomBytes(16));
}
