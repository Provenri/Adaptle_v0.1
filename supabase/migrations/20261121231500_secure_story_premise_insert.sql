drop policy if exists "users can add manual books" on public.catalog_items;

create policy "users can add manual books"
  on public.catalog_items for insert
  to authenticated
  with check (
    scheduled_date is null
    and setting_hint is null
    and character_hint is null
    and story_premise is null
    and metadata_source in ('openlibrary_manual', 'googlebooks_manual')
  );
