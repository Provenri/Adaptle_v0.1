alter table public.catalog_items
  add constraint catalog_items_premise_choices_distinct check (
    premise_decoys is null
    or premise_short is null
    or (
      lower(btrim(premise_decoys[1])) <> lower(btrim(premise_short))
      and lower(btrim(premise_decoys[2])) <> lower(btrim(premise_short))
    )
  );
