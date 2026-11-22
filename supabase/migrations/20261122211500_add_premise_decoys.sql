create or replace function public.valid_premise_decoys(decoys text[])
returns boolean
language sql
immutable
strict
as $$
  select
    cardinality(decoys) = 2
    and not exists (
      select 1
      from unnest(decoys) as values(decoy)
      where char_length(btrim(decoy)) = 0 or char_length(decoy) > 70
    )
    and lower(btrim(decoys[1])) <> lower(btrim(decoys[2]));
$$;

alter table public.catalog_items
  add column premise_decoys text[],
  add constraint catalog_items_premise_decoys_shape check (
    premise_decoys is null or public.valid_premise_decoys(premise_decoys)
  );

comment on column public.catalog_items.premise_decoys is
  'Two original, spoiler-free false premises tailored to the playable book.';
