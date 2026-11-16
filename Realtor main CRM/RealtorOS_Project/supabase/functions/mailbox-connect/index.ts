// mailbox-connect — per-person and shared mailbox OAuth (Gmail first).
//
// verify_jwt = false at the platform level (see config.toml): the OAuth
// callback arrives as a plain browser redirect from Google and carries no
// Supabase JWT. Every route authenticates itself instead:
//   * POST actions require a real user JWT (validated via auth.getUser)
//     and an active workspace membership, resolved server-side.
//   * The GET callback is authorized by the HMAC-signed, 10-minute state
//     token created by the authenticated "start" action
//     (see _shared/mailbox-oauth.ts).
//
// Connections are personal: a member can only start/disconnect their OWN
// personal connection. The shared connection and the workspace sending
// policy are owner/admin-only. Refresh tokens are stored AES-256-GCM
// encrypted (mailbox_connections) and are never returned to any client;
// "status" returns addresses and metadata only.
//
// Required function secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// MAILBOX_OAUTH_STATE_SECRET (>= 32 chars), MAILBOX_TOKEN_ENCRYPTION_KEY
// (base64, 32 bytes), MAILBOX_OAUTH_REDIRECT_URL (this function's public
// callback URL, registered with Google), MAILBOX_APP_URL (CRM app base
// URL for the post-callback redirect).
import {
  createAdminClient,
  createUserClient,
  corsHeaders,
  jsonResponse,
  readJsonBody,
} from "../_shared/runtime.ts";
import {
  buildGoogleAuthUrl,
  buildMicrosoftAuthUrl,
  createMailboxState,
  decryptRefreshToken,
  encryptRefreshToken,
  GMAIL_SEND_SCOPE,
  type MailboxProvider,
  MICROSOFT_SEND_SCOPE,
  verifyMailboxState,
} from "../_shared/mailbox-oauth.ts";

type Kind = "personal" | "shared";
type AdminClient = ReturnType<typeof createAdminClient>;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function appRedirect(params: Record<string, string>): Response {
  const base = requiredEnv("MAILBOX_APP_URL").replace(/\/$/, "");
  const query = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: `${base}/?${query}`, "Cache-Control": "no-store" },
  });
}

// Deterministic membership resolution: an explicit workspaceId is honored
// only when the caller is an active member of it; otherwise the caller's
// own workspace wins (owner first, then earliest joined) — the same
// selection rule as phase C1.
async function resolveMembership(
  admin: AdminClient,
  userId: string,
  workspaceId?: unknown,
): Promise<{ workspaceId: string; role: string } | null> {
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id, role, created_at")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error || !data || data.length === 0) return null;
  if (typeof workspaceId === "string") {
    const match = data.find((m) => m.workspace_id === workspaceId);
    return match
      ? { workspaceId: match.workspace_id, role: match.role }
      : null;
  }
  const sorted = [...data].sort((a, b) => {
    const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
    return rank(a.role) - rank(b.role) ||
      String(a.created_at).localeCompare(String(b.created_at));
  });
  return { workspaceId: sorted[0].workspace_id, role: sorted[0].role };
}

function isManager(role: string): boolean {
  return role === "owner" || role === "admin";
}

async function findConnection(
  admin: AdminClient,
  workspaceId: string,
  kind: Kind,
  userId: string,
  provider: MailboxProvider,
) {
  let query = admin
    .from("mailbox_connections")
    .select(
      "id, user_id, kind, provider, email_address, status, connected_at, refresh_token_ciphertext, refresh_token_iv",
    )
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .eq("provider", provider);
  if (kind === "personal") query = query.eq("user_id", userId);
  const { data } = await query.limit(1);
  return data && data.length > 0 ? data[0] : null;
}

function providerOf(body: Record<string, unknown>): MailboxProvider {
  return body.provider === "microsoft" ? "microsoft" : "gmail";
}

function safeView(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    provider: row.provider,
    email_address: row.email_address,
    status: row.status,
    connected_at: row.connected_at,
  };
}

async function handleStart(
  admin: AdminClient,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const kind: Kind = body.kind === "shared" ? "shared" : "personal";
  if (
    body.provider !== undefined && body.provider !== "gmail" &&
    body.provider !== "microsoft"
  ) {
    return jsonResponse({ error: "provider_not_available_yet" }, 400);
  }
  const provider = providerOf(body);
  const membership = await resolveMembership(admin, userId, body.workspaceId);
  if (!membership) return jsonResponse({ error: "no_workspace" }, 403);
  if (kind === "shared" && !isManager(membership.role)) {
    return jsonResponse({ error: "admin_required" }, 403);
  }
  const state = await createMailboxState(
    requiredEnv("MAILBOX_OAUTH_STATE_SECRET"),
    { userId, workspaceId: membership.workspaceId, kind, provider },
  );
  const redirectUri = requiredEnv("MAILBOX_OAUTH_REDIRECT_URL");
  const authUrl = provider === "microsoft"
    ? buildMicrosoftAuthUrl({
      clientId: requiredEnv("MICROSOFT_CLIENT_ID"),
      redirectUri,
      state,
    })
    : buildGoogleAuthUrl({
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      redirectUri,
      state,
    });
  return jsonResponse({ authUrl });
}

async function handleStatus(
  admin: AdminClient,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const membership = await resolveMembership(admin, userId, body.workspaceId);
  if (!membership) return jsonResponse({ error: "no_workspace" }, 403);
  const [personalGmail, personalMicrosoft, sharedGmail, sharedMicrosoft, policy] =
    await Promise.all([
      findConnection(admin, membership.workspaceId, "personal", userId, "gmail"),
      findConnection(admin, membership.workspaceId, "personal", userId, "microsoft"),
      findConnection(admin, membership.workspaceId, "shared", userId, "gmail"),
      findConnection(admin, membership.workspaceId, "shared", userId, "microsoft"),
      admin
        .from("workspace_mailbox_policies")
        .select("mode")
        .eq("workspace_id", membership.workspaceId)
        .limit(1),
    ]);
  const view = (r: unknown) => safeView(r as Record<string, unknown> | null);
  return jsonResponse({
    workspaceId: membership.workspaceId,
    role: membership.role,
    canManageShared: isManager(membership.role),
    personal: { gmail: view(personalGmail), microsoft: view(personalMicrosoft) },
    shared: { gmail: view(sharedGmail), microsoft: view(sharedMicrosoft) },
    policy: {
      mode: (policy.data && policy.data[0]?.mode) || "members_own",
    },
  });
}

async function handleDisconnect(
  admin: AdminClient,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const kind: Kind = body.kind === "shared" ? "shared" : "personal";
  const membership = await resolveMembership(admin, userId, body.workspaceId);
  if (!membership) return jsonResponse({ error: "no_workspace" }, 403);
  if (kind === "shared" && !isManager(membership.role)) {
    return jsonResponse({ error: "admin_required" }, 403);
  }
  const row = await findConnection(
    admin,
    membership.workspaceId,
    kind,
    userId,
    providerOf(body),
  ) as Record<string, unknown> | null;
  if (!row) return jsonResponse({ disconnected: false, reason: "not_connected" });
  // Best-effort provider revoke (Google only — Microsoft offers no revoke
  // endpoint for delegated refresh tokens; deleting our copy ends our
  // access, and the member can remove the grant in their Microsoft account
  // settings). The local delete proceeds either way so a member is never
  // trapped by a provider outage.
  if (row.provider === "gmail") {
    try {
      const token = await decryptRefreshToken(
        requiredEnv("MAILBOX_TOKEN_ENCRYPTION_KEY"),
        String(row.refresh_token_ciphertext),
        String(row.refresh_token_iv),
      );
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch {
      // Ignore: deletion below is the authoritative disconnect.
    }
  }
  await admin.from("mailbox_connections").delete().eq("id", row.id);
  return jsonResponse({ disconnected: true });
}

async function handleSetPolicy(
  admin: AdminClient,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (body.mode !== "members_own" && body.mode !== "shared") {
    return jsonResponse({ error: "invalid_mode" }, 400);
  }
  const membership = await resolveMembership(admin, userId, body.workspaceId);
  if (!membership) return jsonResponse({ error: "no_workspace" }, 403);
  if (!isManager(membership.role)) {
    return jsonResponse({ error: "admin_required" }, 403);
  }
  const { error } = await admin.from("workspace_mailbox_policies").upsert({
    workspace_id: membership.workspaceId,
    mode: body.mode,
    updated_by: userId,
  });
  if (error) return jsonResponse({ error: "policy_save_failed" }, 500);
  return jsonResponse({ policy: { mode: body.mode } });
}

async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (!code || !stateToken) {
    return appRedirect({ mailbox: "error", reason: "missing_code_or_state" });
  }
  const verified = await verifyMailboxState(
    Deno.env.get("MAILBOX_OAUTH_STATE_SECRET") ?? "",
    stateToken,
  );
  if (!verified.ok) {
    return appRedirect({ mailbox: "error", reason: verified.reason });
  }
  const { state } = verified;
  try {
    const isMicrosoft = state.provider === "microsoft";
    const tokenResponse = isMicrosoft
      ? await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
          client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
          redirect_uri: requiredEnv("MAILBOX_OAUTH_REDIRECT_URL"),
          grant_type: "authorization_code",
          scope: `${MICROSOFT_SEND_SCOPE} offline_access openid email`,
        }),
      })
      : await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: requiredEnv("GOOGLE_CLIENT_ID"),
          client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
          redirect_uri: requiredEnv("MAILBOX_OAUTH_REDIRECT_URL"),
          grant_type: "authorization_code",
        }),
      });
    if (!tokenResponse.ok) {
      return appRedirect({ mailbox: "error", reason: "token_exchange_failed" });
    }
    const tokens = await tokenResponse.json();
    if (typeof tokens.refresh_token !== "string" || !tokens.refresh_token) {
      return appRedirect({ mailbox: "error", reason: "no_refresh_token" });
    }
    const profileResponse = isMicrosoft
      ? await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      : await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
    if (!profileResponse.ok) {
      return appRedirect({ mailbox: "error", reason: "profile_lookup_failed" });
    }
    const profile = await profileResponse.json();
    // Microsoft: mail is null for many personal accounts — the UPN is the
    // account's sign-in address there and is what Graph sends as.
    const emailAddress = isMicrosoft
      ? (typeof profile.mail === "string" && profile.mail
        ? profile.mail
        : typeof profile.userPrincipalName === "string"
        ? profile.userPrincipalName
        : "")
      : (typeof profile.email === "string" ? profile.email : "");
    if (!emailAddress) {
      return appRedirect({ mailbox: "error", reason: "profile_lookup_failed" });
    }
    const admin = createAdminClient();
    // Re-check membership at callback time: the member may have been
    // removed from the workspace while consenting.
    const membership = await resolveMembership(
      admin,
      state.userId,
      state.workspaceId,
    );
    if (!membership) {
      return appRedirect({ mailbox: "error", reason: "no_workspace" });
    }
    if (state.kind === "shared" && !isManager(membership.role)) {
      return appRedirect({ mailbox: "error", reason: "admin_required" });
    }
    const encrypted = await encryptRefreshToken(
      requiredEnv("MAILBOX_TOKEN_ENCRYPTION_KEY"),
      tokens.refresh_token,
    );
    const existing = await findConnection(
      admin,
      state.workspaceId,
      state.kind,
      state.userId,
      state.provider,
    ) as Record<string, unknown> | null;
    const row = {
      workspace_id: state.workspaceId,
      user_id: state.userId,
      kind: state.kind,
      provider: state.provider,
      email_address: emailAddress,
      refresh_token_ciphertext: encrypted.ciphertext,
      refresh_token_iv: encrypted.iv,
      scopes: state.provider === "microsoft" ? MICROSOFT_SEND_SCOPE : GMAIL_SEND_SCOPE,
      status: "connected",
      last_error_code: null,
      connected_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await admin.from("mailbox_connections").update(row).eq("id", existing.id)
      : await admin.from("mailbox_connections").insert(row);
    if (error) {
      return appRedirect({ mailbox: "error", reason: "save_failed" });
    }
    return appRedirect({ mailbox: "connected", kind: state.kind, provider: state.provider });
  } catch {
    return appRedirect({ mailbox: "error", reason: "internal" });
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    if (request.method === "GET") return await handleCallback(request);
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization) return jsonResponse({ error: "unauthorized" }, 401);
    const userClient = createUserClient(authorization);
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return jsonResponse({ error: "unauthorized" }, 401);
    const body = (await readJsonBody(request, 4096)) as Record<string, unknown>;
    const admin = createAdminClient();
    switch (body.action) {
      case "start":
        return await handleStart(admin, user.id, body);
      case "status":
        return await handleStatus(admin, user.id, body);
      case "disconnect":
        return await handleDisconnect(admin, user.id, body);
      case "set_policy":
        return await handleSetPolicy(admin, user.id, body);
      default:
        return jsonResponse({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal";
    if (message.startsWith("missing_env:")) {
      return jsonResponse({ error: "not_configured" }, 503);
    }
    return jsonResponse({ error: "internal" }, 500);
  }
});
