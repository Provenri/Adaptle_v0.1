-- Adaptle initial schema: 4 tables + RLS (see Adaptle.md section 6).
-- Publishing model: content is pre-seeded with a scheduled_date and becomes
-- visible automatically when that date arrives (CET), enforced by RLS below —
-- no cron mutation needed to "publish" a puzzle.

-- Returns "today" for puzzle purposes: midnight Europe/Berlin (CET/CEST).
create or replace function public.current_puzzle_date()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Berlin')::date;
$$;

-- ---------------------------------------------------------------------------
-- 1. catalog_items: one row per book (and its adaptation, when one exists).
-- ---------------------------------------------------------------------------
create table public.catalog_items (
  isbn13 text primary key check (isbn13 ~ '^[0-9]{13}$'),
  book_title text not null,
  author text not null,
  genre text,
  cover_theme text not null check (cover_theme in (
    'scifi_teal', 'thriller_navy', 'fantasy_plum',
    'literary_terracotta', 'romance_rose', 'nonfiction_forest'
  )),
  metadata_source text not null default 'wikidata_openlibrary',
  number_of_pages integer check (number_of_pages > 0),

  -- Adaptation fields: null for manually added books without adaptations.
  tmdb_id integer check (tmdb_id > 0),
  movie_title text,
  release_year integer,
  director text,
  movie_poster_path text,
  lead_characters jsonb, -- e.g. ["Rick Deckard", "Rachael"]
  lead_actors jsonb,     -- e.g. ["Harrison Ford", "Sean Young"]

  -- Hints (LLM-seeded; null for manual books).
  setting_hint text,
  character_hint text,

  scheduled_date date,
  created_at timestamptz not null default now()
);

create index catalog_items_scheduled_date_idx on public.catalog_items (scheduled_date);

comment on table public.catalog_items is
  'Books + screen adaptations. CC0 facts from Wikidata/Open Library; TMDB factual metadata (never overview text).';

-- ---------------------------------------------------------------------------
-- 2. common_thread_pairs: Round 6 bonus puzzles.
-- ---------------------------------------------------------------------------
create table public.common_thread_pairs (
  id uuid primary key default gen_random_uuid(),
  pair_mode text not null check (pair_mode in ('BOOK_PAIR', 'MOVIE_PAIR', 'CROSSOVER')),
  item_a_isbn13 text not null references public.catalog_items (isbn13),
  item_b_isbn13 text not null references public.catalog_items (isbn13),
  connection_category text not null check (connection_category in (
    'The Setting', 'The Plot', 'The Characters', 'The Director', 'The Author'
  )),
  connection_detail text not null,
  decoy_1_category text not null check (decoy_1_category in (
    'The Setting', 'The Plot', 'The Characters', 'The Director', 'The Author'
  )),
  decoy_1_detail text not null,
  decoy_2_category text not null check (decoy_2_category in (
    'The Setting', 'The Plot', 'The Characters', 'The Director', 'The Author'
  )),
  decoy_2_detail text not null,
  scheduled_date date unique,
  created_at timestamptz not null default now(),

  check (item_a_isbn13 <> item_b_isbn13),
  check (decoy_1_category <> connection_category),
  check (decoy_2_category <> connection_category),
  check (decoy_1_category <> decoy_2_category)
);

-- ---------------------------------------------------------------------------
-- 3. user_library: personal shelves (To be read / Finished / Snooze).
-- ---------------------------------------------------------------------------
create table public.user_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  isbn13 text not null references public.catalog_items (isbn13),
  status text not null check (status in ('TO_BE_READ', 'FINISHED', 'SNOOZE')),
  saved_at timestamptz not null default now(),

  unique (user_id, isbn13)
);

create index user_library_user_id_idx on public.user_library (user_id);

-- ---------------------------------------------------------------------------
-- 4. daily_scores: one row per user per puzzle day.
-- ---------------------------------------------------------------------------
create table public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  puzzle_date date not null,
  total_points integer not null check (total_points between 0 and 18),
  round_breakdown jsonb not null, -- e.g. [3, 2, 1, 3, 3, 3]
  completed_at timestamptz not null default now(),

  unique (user_id, puzzle_date)
);

create index daily_scores_user_id_idx on public.daily_scores (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.catalog_items enable row level security;
alter table public.common_thread_pairs enable row level security;
alter table public.user_library enable row level security;
alter table public.daily_scores enable row level security;

-- Puzzle content: visible only once its scheduled date arrives (CET).
-- Unscheduled rows (scheduled_date is null) are manual/library additions and
-- are always visible; future-scheduled puzzles are hidden from everyone.
create policy "catalog readable once published"
  on public.catalog_items for select
  to authenticated
  using (scheduled_date is null or scheduled_date <= public.current_puzzle_date());

-- Manual "+ Add Book" additions: users may insert unscheduled books without
-- adaptations or hints; the seeded puzzle catalog stays service-role-only.
create policy "users can add manual books"
  on public.catalog_items for insert
  to authenticated
  with check (
    scheduled_date is null
    and setting_hint is null
    and character_hint is null
    and metadata_source in ('openlibrary_manual', 'googlebooks_manual')
  );

create policy "threads readable once published"
  on public.common_thread_pairs for select
  to authenticated
  using (scheduled_date is not null and scheduled_date <= public.current_puzzle_date());

-- Personal data: owner-only, full control.
create policy "own library rows"
  on public.user_library for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own score rows"
  on public.daily_scores for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
