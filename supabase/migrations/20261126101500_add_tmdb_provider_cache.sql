create table public.tmdb_provider_cache (
  tmdb_id integer primary key check (tmdb_id > 0),
  payload jsonb,
  expires_at timestamptz,
  refreshing_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table public.tmdb_provider_cache is
  'Copyright-safe TMDB watch-provider facts and regional coverage, refreshed weekly.';

alter table public.tmdb_provider_cache enable row level security;

create or replace function public.claim_tmdb_provider_refresh(
  p_tmdb_id integer,
  p_lease_seconds integer default 30
)
returns table (
  payload jsonb,
  expires_at timestamptz,
  refresh_claimed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cache_row public.tmdb_provider_cache%rowtype;
begin
  if p_tmdb_id <= 0 or p_lease_seconds <= 0 then
    raise exception 'tmdb id and lease must be positive';
  end if;

  insert into public.tmdb_provider_cache (tmdb_id)
  values (p_tmdb_id)
  on conflict (tmdb_id) do nothing;

  select *
  into cache_row
  from public.tmdb_provider_cache
  where tmdb_id = p_tmdb_id
  for update;

  if cache_row.expires_at is not null and cache_row.expires_at > now() then
    return query select cache_row.payload, cache_row.expires_at, false;
    return;
  end if;

  if cache_row.refreshing_until is null or cache_row.refreshing_until <= now() then
    update public.tmdb_provider_cache
    set refreshing_until = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    where tmdb_id = p_tmdb_id
    returning * into cache_row;

    return query select cache_row.payload, cache_row.expires_at, true;
    return;
  end if;

  return query select cache_row.payload, cache_row.expires_at, false;
end;
$$;

revoke all on function public.claim_tmdb_provider_refresh(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_tmdb_provider_refresh(integer, integer)
  to service_role;
