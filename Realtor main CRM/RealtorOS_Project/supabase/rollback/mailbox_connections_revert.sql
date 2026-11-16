-- Rollback for 20261116120000_mailbox_connections.sql
-- Drops the mailbox sending policy and connections tables. Any connected
-- mailboxes stop working immediately (sending falls back to Resend);
-- provider-side grants should also be revoked from each mailbox's Google /
-- Microsoft account settings, as dropping this table cannot reach them.

drop table if exists public.workspace_mailbox_policies;
drop table if exists public.mailbox_connections;
