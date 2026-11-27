grant select, insert, update on table public.contact_requests to service_role;

comment on table public.contact_requests is
  'Server-only contact submissions written by contact-proxy using the service role.';
