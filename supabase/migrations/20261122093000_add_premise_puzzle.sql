create function public.valid_premise_keywords(keywords text[])
returns boolean
language sql
immutable
strict
as $$
  select
    cardinality(keywords) between 2 and 6
    and not exists (
      select 1
      from unnest(keywords) as values(keyword)
      where char_length(btrim(keyword)) = 0 or char_length(keyword) > 24
    );
$$;

alter table public.catalog_items
  add column premise_short text,
  add column premise_keywords text[],
  add constraint catalog_items_premise_short_length check (
    premise_short is null or (
      char_length(btrim(premise_short)) > 0
      and char_length(premise_short) <= 70
    )
  ),
  add constraint catalog_items_premise_keywords_shape check (
    premise_keywords is null or public.valid_premise_keywords(premise_keywords)
  );

comment on column public.catalog_items.premise_short is
  'Short one-line premise used as the premise puzzle answer; generated offline.';
comment on column public.catalog_items.premise_keywords is
  'Spoiler-free premise keywords shown as the third puzzle hint; generated offline.';
