create or replace function public.complete_tmdb_provider_refresh(
  p_tmdb_id integer,
  p_payload jsonb,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tmdb_provider_cache
  set payload = case when p_error is null then p_payload else payload end,
      expires_at = case
        when p_error is null then now() + interval '7 days'
        else expires_at
      end,
      refreshing_until = null,
      last_error = left(p_error, 500),
      updated_at = now()
  where tmdb_id = p_tmdb_id;
end;
$$;

revoke all on function public.complete_tmdb_provider_refresh(integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.complete_tmdb_provider_refresh(integer, jsonb, text)
  to service_role;
