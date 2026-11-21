alter table public.user_library
  add column if not exists snoozed_until timestamptz;

alter table public.user_library
  add constraint user_library_snooze_deadline_check
  check (
    (status <> 'SNOOZE' and snoozed_until is null)
    or (status = 'SNOOZE')
  );

create index if not exists user_library_snoozed_until_idx
  on public.user_library (snoozed_until)
  where status = 'SNOOZE';

comment on column public.user_library.snoozed_until is
  'Optional UTC deadline for SNOOZE; expired rows are restored locally at the next app sync.';
