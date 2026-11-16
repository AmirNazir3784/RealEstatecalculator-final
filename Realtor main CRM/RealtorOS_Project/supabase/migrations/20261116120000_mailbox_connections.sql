-- Mailbox connections: per-person OAuth mailboxes (Gmail first, Microsoft
-- reserved) that RealtorCRM can send follow-up email FROM, plus one optional
-- admin-connected shared mailbox per workspace and the workspace sending
-- policy that chooses between them.
--
-- Design decisions (owner-approved 2026-11-16):
--   * Connections are PER PERSON: a row's user_id is the member who personally
--     consented on the provider's screen. Only that member can disconnect it.
--   * A workspace may additionally have ONE shared connection (kind='shared'),
--     connected by a workspace owner/admin who holds that mailbox.
--   * The workspace sending policy (workspace_mailbox_policies.mode) is
--     admin-controlled: 'members_own' (default; sender = the member assigned
--     to the work, falling back to the shared mailbox, then to Resend) or
--     'shared' (everything sends from the shared mailbox, Resend fallback).
--   * Refresh tokens are NEVER stored in plaintext and NEVER readable by
--     clients: the mailbox-connect Edge Function encrypts them with
--     AES-256-GCM (key in the MAILBOX_TOKEN_ENCRYPTION_KEY function secret)
--     before insert, and this table follows the email_sender_profiles
--     pattern — RLS on, every grant revoked from anon/authenticated, access
--     only through service_role Edge Functions, which return safe fields.

create table public.mailbox_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- The member who consented. For kind='shared', the admin who connected it.
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'personal'
    check (kind in ('personal', 'shared')),
  provider text not null default 'gmail'
    check (provider in ('gmail', 'microsoft')),
  email_address text not null,
  -- AES-256-GCM ciphertext + IV of the OAuth refresh token, base64-encoded,
  -- produced by the mailbox-connect Edge Function. Never plaintext.
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  scopes text not null default 'https://www.googleapis.com/auth/gmail.send',
  status text not null default 'connected'
    check (status in ('connected', 'revoked', 'error')),
  -- Sanitized, user-safe summary of the last provider failure (no tokens,
  -- no provider internals beyond a stable error code).
  last_error_code text,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Same address hygiene as email_sender_profiles: single address, no
  -- display-name syntax, no control characters, RFC 5321 length limit.
  check (char_length(email_address) between 1 and 254),
  check (email_address !~ '[\x00-\x1F\x7F]'),
  check (email_address = btrim(email_address)),
  check (
    email_address ~
    '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
  ),
  check (char_length(refresh_token_ciphertext) between 1 and 4096),
  check (char_length(refresh_token_iv) between 1 and 128)
);

-- One personal connection per member per provider in a workspace.
create unique index mailbox_connections_personal_uq
  on public.mailbox_connections (workspace_id, user_id, provider)
  where kind = 'personal';
-- One shared connection per provider in a workspace.
create unique index mailbox_connections_shared_uq
  on public.mailbox_connections (workspace_id, provider)
  where kind = 'shared';
create index mailbox_connections_workspace_idx
  on public.mailbox_connections (workspace_id, kind, status);

alter table public.mailbox_connections enable row level security;
revoke all on table public.mailbox_connections from public, anon, authenticated;
grant all on table public.mailbox_connections to service_role;

create trigger mailbox_connections_set_updated_at
  before update on public.mailbox_connections
  for each row execute function public.realtoros_set_updated_at();

-- Workspace sending policy. No row = the default ('members_own').
create table public.workspace_mailbox_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  mode text not null default 'members_own'
    check (mode in ('members_own', 'shared')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_mailbox_policies enable row level security;
revoke all on table public.workspace_mailbox_policies from public, anon, authenticated;
grant all on table public.workspace_mailbox_policies to service_role;

create trigger workspace_mailbox_policies_set_updated_at
  before update on public.workspace_mailbox_policies
  for each row execute function public.realtoros_set_updated_at();
