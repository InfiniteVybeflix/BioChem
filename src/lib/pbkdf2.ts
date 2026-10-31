/**
 * PBKDF2-SHA256 hashing via the Web Crypto API (Node 20+, browsers, edge).
 * Used for admin moderation passphrases — never for Supabase Auth passwords
 * (Supabase handles account credentials).
 *
 * Stored format: pbkdf2$<iterations>$<saltB64>$<hashB64>
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // bytes
const ALGORITHM = "PBKDF2-SHA256";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

export async function pbkdf2Hash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ALGORITHM}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Constant-time-ish comparison of two base64 strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function pbkdf2Verify(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 1_000) return false;

  const salt = fromBase64(parts[3]);
  const expected = parts[4];
  const actual = await derive(password, salt, iterations);
  return safeEqual(toBase64(actual), expected);
}
