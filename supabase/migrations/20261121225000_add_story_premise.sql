alter table public.catalog_items
  add column story_premise text;

comment on column public.catalog_items.story_premise is
  'Original spoiler-free story premise for book and screen adaptation; never copied from third-party summaries.';
