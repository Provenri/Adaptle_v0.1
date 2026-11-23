create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id uuid references auth.users (id) on delete set null,
  category text not null check (category in (
    'GENERAL',
    'SUPPORT',
    'PRIVACY',
    'COPYRIGHT',
    'LEGAL'
  )),
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  message text not null check (char_length(btrim(message)) between 10 and 5000),
  reply_email text check (reply_email is null or char_length(reply_email) <= 254),
  name text check (name is null or char_length(name) <= 100),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  notification_status text not null default 'PENDING' check (
    notification_status in ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED')
  ),
  created_at timestamptz not null default now()
);

create index if not exists contact_requests_user_created_idx
  on public.contact_requests (anonymous_user_id, created_at desc);

create index if not exists contact_requests_status_created_idx
  on public.contact_requests (status, created_at);

alter table public.contact_requests enable row level security;
revoke all on table public.contact_requests from anon, authenticated;

comment on table public.contact_requests is
  'Server-only contact submissions written by contact-proxy.';
