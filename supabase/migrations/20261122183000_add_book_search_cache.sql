create table if not exists public.book_search_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists book_search_cache_expires_at_idx
  on public.book_search_cache (expires_at);

alter table public.book_search_cache enable row level security;

revoke all on table public.book_search_cache from anon, authenticated;

comment on table public.book_search_cache is
  'Server-only normalized book-search responses cached by booksearch-proxy.';
