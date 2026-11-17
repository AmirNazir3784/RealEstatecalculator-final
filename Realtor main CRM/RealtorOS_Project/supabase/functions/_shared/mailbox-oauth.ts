// Mailbox OAuth helpers: signed connect-state tokens and refresh-token
// encryption for the mailbox-connect Edge Function.
//
// State token format: "m1.<payload>.<signature>", both parts base64url
// without padding.
//   payload   = JSON { p: "mbox", u: <user id>, w: <workspace id>,
//                      k: "personal" | "shared", e: <expiry, unix seconds> }
//   signature = HMAC-SHA256(MAILBOX_OAUTH_STATE_SECRET,
//                           "realtoros-mailbox-state.v1." + payload)
//
// The state token is the ONLY credential the OAuth callback carries: the
// callback arrives as a plain browser redirect from the provider, with no
// Supabase JWT. The HMAC binds the callback to the authenticated member who
// started the flow, the workspace, and the connection kind, and it expires
// after STATE_LIFETIME_SECONDS. It contains no email address and no token.
//
// Refresh tokens are encrypted with AES-256-GCM before they touch the
// database (key: MAILBOX_TOKEN_ENCRYPTION_KEY, base64 of 32 bytes). The
// database stores ciphertext + IV only; plaintext exists only in Edge
// Function memory while a send or a revoke is in flight.
//
// No dependencies beyond Web Crypto, so this module runs unchanged under
// Deno and under Node's offline tests.

const PURPOSE = "mbox";
const VERSION_PREFIX = "m1";
const SIGNING_CONTEXT = "realtoros-mailbox-state.v1.";
export const STATE_LIFETIME_SECONDS = 10 * 60;
export const MIN_SECRET_LENGTH = 32;
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const MICROSOFT_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL_SHAPE = /^[A-Za-z0-9_-]+$/;
const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}

function b64urlDecode(text: string): Uint8Array | null {
  if (!B64URL_SHAPE.test(text)) return null;
  try {
    const padded = text.replaceAll("-", "+").replaceAll("_", "/") +
      "===".slice((text.length + 3) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function b64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64Decode(text: string): Uint8Array | null {
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type MailboxProvider = "gmail" | "microsoft";

export interface MailboxState {
  userId: string;
  workspaceId: string;
  kind: "personal" | "shared";
  provider: MailboxProvider;
  expiresAtSeconds: number;
}

export async function createMailboxState(
  secret: string,
  input: {
    userId: string;
    workspaceId: string;
    kind: "personal" | "shared";
    provider?: MailboxProvider;
    nowSeconds?: number;
  },
): Promise<string> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error("mailbox_state_secret_too_short");
  }
  if (!UUID_SHAPE.test(input.userId) || !UUID_SHAPE.test(input.workspaceId)) {
    throw new Error("mailbox_state_bad_id");
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload = {
    p: PURPOSE,
    u: input.userId,
    w: input.workspaceId,
    k: input.kind,
    pr: input.provider ?? "gmail",
    e: now + STATE_LIFETIME_SECONDS,
  };
  const payloadB64 = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(SIGNING_CONTEXT + payloadB64),
    ),
  );
  return `${VERSION_PREFIX}.${payloadB64}.${b64urlEncode(sig)}`;
}

export async function verifyMailboxState(
  secret: string,
  token: string,
  nowSeconds?: number,
): Promise<
  { ok: true; state: MailboxState } | { ok: false; reason: string }
> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return { ok: false, reason: "secret_not_configured" };
  }
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts[0] !== VERSION_PREFIX) {
    return { ok: false, reason: "malformed" };
  }
  const payloadBytes = b64urlDecode(parts[1]);
  const sigBytes = b64urlDecode(parts[2]);
  if (!payloadBytes || !sigBytes) return { ok: false, reason: "malformed" };
  const key = await hmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(SIGNING_CONTEXT + parts[1]),
    ),
  );
  if (!timingSafeEqual(expected, sigBytes)) {
    return { ok: false, reason: "bad_signature" };
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    payload.p !== PURPOSE ||
    typeof payload.u !== "string" || !UUID_SHAPE.test(payload.u) ||
    typeof payload.w !== "string" || !UUID_SHAPE.test(payload.w) ||
    (payload.k !== "personal" && payload.k !== "shared") ||
    // pr was added with the Microsoft provider; tokens minted before it
    // (none can still be live — they expire in 10 minutes) default to gmail.
    (payload.pr !== undefined && payload.pr !== "gmail" && payload.pr !== "microsoft") ||
    typeof payload.e !== "number" || !Number.isFinite(payload.e)
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.e < now) return { ok: false, reason: "expired" };
  return {
    ok: true,
    state: {
      userId: payload.u,
      workspaceId: payload.w,
      kind: payload.k,
      provider: payload.pr === "microsoft" ? "microsoft" : "gmail",
      expiresAtSeconds: payload.e,
    },
  };
}

async function aesKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64Decode(keyB64 ?? "");
  if (!raw || raw.length !== 32) {
    throw new Error("mailbox_encryption_key_invalid");
  }
  return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptRefreshToken(
  keyB64: string,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await aesKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext),
    ),
  );
  return { ciphertext: b64Encode(cipher), iv: b64Encode(iv) };
}

export async function decryptRefreshToken(
  keyB64: string,
  ciphertextB64: string,
  ivB64: string,
): Promise<string> {
  const key = await aesKey(keyB64);
  const cipher = b64Decode(ciphertextB64);
  const iv = b64Decode(ivB64);
  if (!cipher || !iv || iv.length !== 12) {
    throw new Error("mailbox_token_undecryptable");
  }
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher,
  );
  return new TextDecoder().decode(plain);
}

export function buildGoogleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    // Send permission plus identity, so the callback can confirm WHICH
    // mailbox was connected. No read scopes are requested, ever, in v1.
    scope: `${GMAIL_SEND_SCOPE} openid email`,
    access_type: "offline",
    // prompt=consent guarantees a refresh token is issued even when the
    // member previously granted the same scopes.
    prompt: "consent",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function buildMicrosoftAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    response_mode: "query",
    // Mail.Send (delegated) plus offline_access for the refresh token and
    // identity scopes so the callback can confirm WHICH mailbox connected.
    // No read scopes are requested, ever. The "common" tenant accepts both
    // work/school and personal Microsoft accounts.
    scope: `${MICROSOFT_SEND_SCOPE} offline_access openid email`,
    state: input.state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}
