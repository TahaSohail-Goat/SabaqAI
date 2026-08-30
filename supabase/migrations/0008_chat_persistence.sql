-- Persistent chat history for /chat — the open, ungrounded assistant (separate from /ask's
-- grounded, citation-only path, which stays exactly as it is). Multiple named conversations
-- per student, resumable, deletable — same shape as any ChatGPT-style conversation sidebar.
--
-- No RLS policies (deny by default) — same pattern as quiz_answer_keys/content_chunks/etc.
-- in 0001_init.sql: access is entirely mediated by API routes that already verify the session
-- server-side via the service-role client, not by direct client-side table access.

create table if not exists chat_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  title      text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_idx on chat_conversations (user_id, updated_at desc);

-- Attachment BYTES are never stored here, only the name/mime type — matches how in-session
-- history already worked before persistence: a long conversation with several attached files
-- doesn't compound into megabytes sitting in the database, and re-grounding a later question in
-- an old image was never supported anyway (Gemini only sees the current turn's actual file).
create table if not exists chat_messages (
  id                   uuid primary key default gen_random_uuid(),
  conversation_id      uuid not null references chat_conversations(id) on delete cascade,
  role                 text not null check (role in ('user', 'model')),
  content              text not null,
  attachment_name      text,
  attachment_mime_type text,
  created_at           timestamptz not null default now()
);

create index if not exists chat_messages_conversation_idx on chat_messages (conversation_id, created_at);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;
