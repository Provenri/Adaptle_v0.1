delete from public.user_library
where status = 'SNOOZE';

alter table public.user_library
  drop constraint if exists user_library_snooze_deadline_check,
  drop constraint if exists user_library_status_check,
  drop column if exists snoozed_until;

alter table public.user_library
  add constraint user_library_status_check
  check (status in ('TO_BE_READ', 'READING', 'FINISHED'));
