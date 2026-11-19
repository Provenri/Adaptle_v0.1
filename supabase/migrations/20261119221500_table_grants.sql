-- The CLI applies migrations via its own login role, so Supabase's usual
-- default privileges don't attach to these tables. Grant explicitly, with
-- least privilege for API roles (RLS further restricts row access):
--   - authenticated: play the game + manage own shelves/scores
--   - service_role: full access for seeding and admin (bypasses RLS)
--   - anon (no session): no access at all

grant usage on schema public to authenticated, service_role;

grant select, insert on public.catalog_items to authenticated;
grant select on public.common_thread_pairs to authenticated;
grant select, insert, update, delete on public.user_library to authenticated;
grant select, insert, update, delete on public.daily_scores to authenticated;

grant select, insert, update, delete on public.catalog_items to service_role;
grant select, insert, update, delete on public.common_thread_pairs to service_role;
grant select, insert, update, delete on public.user_library to service_role;
grant select, insert, update, delete on public.daily_scores to service_role;

grant execute on function public.current_puzzle_date() to authenticated, service_role;
