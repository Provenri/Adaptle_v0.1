alter table public.catalog_items
  add column if not exists publication_year integer
  check (publication_year is null or publication_year between 1 and 9999);
