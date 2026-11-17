// Mailbox sending: route resolution and Gmail delivery for the automation
// worker, built on the connections stored by mailbox-connect.
//
// Routing (owner-approved 2026-11-16):
//   policy 'members_own' (default): the acting member's personal mailbox,
//     then the workspace shared mailbox, then Resend.
//   policy 'shared': the shared mailbox, then Resend.
// A connection is only a route step while its status is 'connected'.
//
// Gmail has NO idempotency key, and the send-only scope cannot read the
// mailbox back to verify an earlier attempt. Delivery discipline therefore
// differs from Resend on purpose:
//   * 'sent'      — Gmail accepted and returned a message id.
//   * 'rejected'  — Gmail answered with an HTTP error: the message was
//                   definitively NOT accepted, so falling back to the next
//                   route step cannot duplicate. tokenInvalid marks the
//                   revoked/expired-grant case (401 or invalid_grant).
//   * 'ambiguous' — no trustworthy answer (network, timeout, unreadable
//                   success body): the send may have happened. The caller
//                   must NOT retry or fall back; it records the message
//                   'unconfirmed', exactly like the Resend idempotency
//                   window expiry path.
import { decryptRefreshToken } from "./mailbox-oauth.ts";
import type { createAdminClient } from "./runtime.ts";

export interface MailboxConnectionRow {
  id: string;
  kind: "personal" | "shared";
  provider: string;
  email_address: string;
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  status: string;
}

export type RouteStep =
  | { via: "gmail" | "microsoft"; connection: MailboxConnectionRow }
  | { via: "resend" };

// Pure route planning, kept separate from the database reads so the policy
// is unit-testable without a database. A member may connect both providers;
// within a kind, Gmail is tried before Microsoft (stable, documented
// order), then the route falls back as the policy dictates.
export function planRoute(
  mode: string,
  personal: MailboxConnectionRow[],
  shared: MailboxConnectionRow[],
): RouteStep[] {
  const steps: RouteStep[] = [];
  const usable = (rows: MailboxConnectionRow[]): MailboxConnectionRow[] =>
    rows
      .filter((c) => (c.provider === "gmail" || c.provider === "microsoft") && c.status === "connected")
      .sort((a, b) => a.provider.localeCompare(b.provider));
  const push = (c: MailboxConnectionRow) =>
    steps.push({ via: c.provider as "gmail" | "microsoft", connection: c });
  if (mode === "shared") {
    usable(shared).forEach(push);
  } else {
    usable(personal).forEach(push);
    usable(shared).forEach(push);
  }
  steps.push({ via: "resend" });
  return steps;
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Resolves the route for the user a job belongs to (the automation owner =
// the member responsible for the contact in this data model). Never throws:
// any lookup problem degrades to the plain Resend route, which is the
// pre-mailbox behavior.
export async function resolveRoute(
  admin: AdminClient,
  userId: string,
): Promise<{ workspaceId: string | null; mode: string; steps: RouteStep[] }> {
  const fallback = { workspaceId: null, mode: "members_own", steps: [{ via: "resend" } as RouteStep] };
  try {
    const { data: memberships, error } = await admin
      .from("workspace_members")
      .select("workspace_id, role, created_at")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error || !memberships || memberships.length === 0) return fallback;
    const sorted = [...memberships].sort((a, b) => {
      const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
      return rank(a.role) - rank(b.role) ||
        String(a.created_at).localeCompare(String(b.created_at));
    });
    const workspaceId = sorted[0].workspace_id as string;
    const [{ data: policies }, { data: connections }] = await Promise.all([
      admin.from("workspace_mailbox_policies").select("mode")
        .eq("workspace_id", workspaceId).limit(1),
      admin.from("mailbox_connections")
        .select("id, user_id, kind, provider, email_address, refresh_token_ciphertext, refresh_token_iv, status")
        .eq("workspace_id", workspaceId).eq("status", "connected"),
    ]);
    const mode = (policies && policies[0]?.mode) || "members_own";
    const rows = (connections ?? []) as (MailboxConnectionRow & { user_id?: string })[];
    // A personal connection is only ever the acting member's own row.
    const personalRows = rows.filter(
      (c) => c.kind === "personal" && c.user_id === userId,
    );
    const sharedRows = rows.filter((c) => c.kind === "shared");
    return {
      workspaceId,
      mode,
      steps: planRoute(mode, personalRows, sharedRows),
    };
  } catch {
    return fallback;
  }
}

// The caller's OWN connected personal mailbox (Gmail before Microsoft),
// or null. Used by send-test-email: a test send is the member's own
// diagnostic, so the shared mailbox and the workspace policy do not apply.
// Never throws — any lookup problem means "no mailbox", and the caller
// falls back to the Resend path.
export async function resolvePersonalConnection(
  admin: AdminClient,
  userId: string,
): Promise<MailboxConnectionRow | null> {
  try {
    const { data: memberships, error } = await admin
      .from("workspace_members")
      .select("workspace_id, role, created_at")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error || !memberships || memberships.length === 0) return null;
    const sorted = [...memberships].sort((a, b) => {
      const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
      return rank(a.role) - rank(b.role) ||
        String(a.created_at).localeCompare(String(b.created_at));
    });
    const workspaceId = sorted[0].workspace_id as string;
    const { data } = await admin.from("mailbox_connections")
      .select("id, user_id, kind, provider, email_address, refresh_token_ciphertext, refresh_token_iv, status")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("kind", "personal")
      .eq("status", "connected");
    const rows = (data ?? []) as MailboxConnectionRow[];
    return rows.find((c) => c.provider === "gmail") ??
      rows.find((c) => c.provider === "microsoft") ?? null;
  } catch {
    return null;
  }
}

export async function markConnectionError(
  admin: AdminClient,
  connectionId: string,
  code: string,
): Promise<void> {
  try {
    await admin.from("mailbox_connections")
      .update({ status: "error", last_error_code: code.slice(0, 100) })
      .eq("id", connectionId);
  } catch {
    // Best effort: the send decision has already been made safely.
  }
}

// ------------------------------------------------------------ MIME build

const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

function assertHeaderSafe(value: string, field: string): void {
  if (CONTROL_CHARS.test(value)) {
    throw new Error(`mailbox_header_unsafe:${field}`);
  }
}

function quoteDisplayName(name: string): string {
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function b64urlEncodeText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export interface MimeMessage {
  fromName: string;
  fromEmail: string;
  to: string;
  replyTo: string[];
  subject: string;
  text: string;
  headers?: Record<string, string>;
}

// Builds the RFC 5322 message Gmail expects (plain text, UTF-8). Header
// values are rejected outright on control characters — the same
// header-injection discipline as the Resend paths.
export function buildMimeMessage(message: MimeMessage): string {
  assertHeaderSafe(message.fromName, "from_name");
  assertHeaderSafe(message.fromEmail, "from");
  assertHeaderSafe(message.to, "to");
  assertHeaderSafe(message.subject, "subject");
  for (const r of message.replyTo) assertHeaderSafe(r, "reply_to");
  const lines = [
    `From: ${quoteDisplayName(message.fromName)} <${message.fromEmail}>`,
    `To: ${message.to}`,
  ];
  if (message.replyTo.length > 0) {
    lines.push(`Reply-To: ${message.replyTo.join(", ")}`);
  }
  lines.push(`Subject: ${message.subject}`);
  for (const [name, value] of Object.entries(message.headers ?? {})) {
    assertHeaderSafe(name, "header_name");
    assertHeaderSafe(value, "header_value");
    lines.push(`${name}: ${value}`);
  }
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("");
  lines.push(message.text);
  return lines.join("\r\n");
}

// ------------------------------------------------------------ Gmail send

export type GmailSendResult =
  | { outcome: "sent"; providerMessageId: string }
  | { outcome: "rejected"; httpStatus: number; code: string; tokenInvalid: boolean }
  | { outcome: "ambiguous"; code: string };

const GMAIL_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function sendViaGmail(input: {
  connection: MailboxConnectionRow;
  encryptionKey: string;
  clientId: string;
  clientSecret: string;
  message: MimeMessage;
}): Promise<GmailSendResult> {
  let refreshToken: string;
  try {
    refreshToken = await decryptRefreshToken(
      input.encryptionKey,
      input.connection.refresh_token_ciphertext,
      input.connection.refresh_token_iv,
    );
  } catch {
    return { outcome: "rejected", httpStatus: 0, code: "token_undecryptable", tokenInvalid: true };
  }

  let accessToken: string;
  try {
    const tokenResponse = await fetchWithTimeout(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      },
      GMAIL_TIMEOUT_MS,
    );
    const parsed = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok) {
      const errCode = parsed && typeof parsed === "object"
        ? String((parsed as { error?: unknown }).error ?? "")
        : "";
      return {
        outcome: "rejected",
        httpStatus: tokenResponse.status,
        code: errCode === "invalid_grant" ? "token_revoked" : "token_exchange_failed",
        tokenInvalid: errCode === "invalid_grant" || tokenResponse.status === 401,
      };
    }
    const candidate = parsed && typeof parsed === "object"
      ? (parsed as { access_token?: unknown }).access_token
      : undefined;
    if (typeof candidate !== "string" || !candidate) {
      return { outcome: "ambiguous", code: "token_response_malformed" };
    }
    accessToken = candidate;
  } catch {
    return { outcome: "ambiguous", code: "token_network_error" };
  }

  let raw: string;
  try {
    raw = b64urlEncodeText(buildMimeMessage(input.message));
  } catch (e) {
    return {
      outcome: "rejected",
      httpStatus: 0,
      code: e instanceof Error ? e.message : "mime_build_failed",
      tokenInvalid: false,
    };
  }

  try {
    const sendResponse = await fetchWithTimeout(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
      GMAIL_TIMEOUT_MS,
    );
    if (sendResponse.ok) {
      const parsed = await sendResponse.json().catch(() => null);
      const id = parsed && typeof parsed === "object"
        ? (parsed as { id?: unknown }).id
        : undefined;
      if (typeof id === "string" && id.length > 0 && id.length <= 128) {
        return { outcome: "sent", providerMessageId: id };
      }
      return { outcome: "ambiguous", code: "send_response_malformed" };
    }
    const parsedError = await sendResponse.json().catch(() => null);
    const errStatus = parsedError && typeof parsedError === "object"
      ? String((parsedError as { error?: { status?: unknown } }).error?.status ?? "")
      : "";
    return {
      outcome: "rejected",
      httpStatus: sendResponse.status,
      code: errStatus ? `gmail_${errStatus.toLowerCase()}` : "gmail_rejected",
      tokenInvalid: sendResponse.status === 401,
    };
  } catch {
    return { outcome: "ambiguous", code: "send_network_error" };
  }
}

// ------------------------------------------------------------ Microsoft send

export type MicrosoftSendResult =
  // Graph's sendMail returns 202 with an empty body: acceptance is
  // definitive, but there is no provider message id to record.
  | { outcome: "sent"; providerMessageId: null; rotatedRefreshToken?: string }
  | { outcome: "rejected"; httpStatus: number; code: string; tokenInvalid: boolean }
  | { outcome: "ambiguous"; code: string };

const MICROSOFT_TIMEOUT_MS = 10_000;

// Sends through Microsoft Graph (POST /me/sendMail) with the same outcome
// discipline as Gmail: a 202 is a definitive accept; an HTTP error answer
// is a definitive reject (safe to fall back); a network failure or an
// unreadable token response is ambiguous (never safe to fall back).
// Microsoft rotates refresh tokens: when the token response carries a new
// one it is returned so the caller can persist it (re-encrypted).
export async function sendViaMicrosoft(input: {
  connection: MailboxConnectionRow;
  encryptionKey: string;
  clientId: string;
  clientSecret: string;
  message: MimeMessage;
}): Promise<MicrosoftSendResult> {
  let refreshToken: string;
  try {
    refreshToken = await decryptRefreshToken(
      input.encryptionKey,
      input.connection.refresh_token_ciphertext,
      input.connection.refresh_token_iv,
    );
  } catch {
    return { outcome: "rejected", httpStatus: 0, code: "token_undecryptable", tokenInvalid: true };
  }

  let accessToken: string;
  let rotatedRefreshToken: string | undefined;
  try {
    const tokenResponse = await fetchWithTimeout(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: "https://graph.microsoft.com/Mail.Send offline_access openid email",
        }),
      },
      MICROSOFT_TIMEOUT_MS,
    );
    const parsed = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok) {
      const errCode = parsed && typeof parsed === "object"
        ? String((parsed as { error?: unknown }).error ?? "")
        : "";
      return {
        outcome: "rejected",
        httpStatus: tokenResponse.status,
        code: errCode === "invalid_grant" ? "token_revoked" : "token_exchange_failed",
        tokenInvalid: errCode === "invalid_grant" || tokenResponse.status === 401,
      };
    }
    const candidate = parsed && typeof parsed === "object"
      ? (parsed as { access_token?: unknown }).access_token
      : undefined;
    if (typeof candidate !== "string" || !candidate) {
      return { outcome: "ambiguous", code: "token_response_malformed" };
    }
    accessToken = candidate;
    const rotated = (parsed as { refresh_token?: unknown }).refresh_token;
    if (typeof rotated === "string" && rotated && rotated !== refreshToken) {
      rotatedRefreshToken = rotated;
    }
  } catch {
    return { outcome: "ambiguous", code: "token_network_error" };
  }

  for (const r of input.message.replyTo) assertHeaderSafe(r, "reply_to");
  assertHeaderSafe(input.message.to, "to");
  assertHeaderSafe(input.message.subject, "subject");

  const graphMessage: Record<string, unknown> = {
    subject: input.message.subject,
    body: { contentType: "Text", content: input.message.text },
    toRecipients: [{ emailAddress: { address: input.message.to } }],
  };
  if (input.message.replyTo.length > 0) {
    graphMessage.replyTo = input.message.replyTo.map((address) => ({
      emailAddress: { address },
    }));
  }
  const headers = Object.entries(input.message.headers ?? {}).map(([name, value]) => {
    assertHeaderSafe(name, "header_name");
    assertHeaderSafe(value, "header_value");
    return { name, value };
  });
  if (headers.length > 0) graphMessage.internetMessageHeaders = headers;

  try {
    const sendResponse = await fetchWithTimeout(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: graphMessage, saveToSentItems: true }),
      },
      MICROSOFT_TIMEOUT_MS,
    );
    if (sendResponse.status === 202) {
      return { outcome: "sent", providerMessageId: null, rotatedRefreshToken };
    }
    const parsedError = await sendResponse.json().catch(() => null);
    const errCode = parsedError && typeof parsedError === "object"
      ? String((parsedError as { error?: { code?: unknown } }).error?.code ?? "")
      : "";
    const safeCode = errCode.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
    return {
      outcome: "rejected",
      httpStatus: sendResponse.status,
      code: safeCode ? `microsoft_${safeCode}` : "microsoft_rejected",
      tokenInvalid: sendResponse.status === 401,
    };
  } catch {
    return { outcome: "ambiguous", code: "send_network_error" };
  }
}
