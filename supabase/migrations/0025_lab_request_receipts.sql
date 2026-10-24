-- Temporary idempotency/rate receipts, not experiment history. Cached run responses can
-- contain short student input inside signed state; service-only access and expiry bound it.
create table public.lab_request_receipts (
  owner_id uuid not null references public.users(id) on delete cascade,
  request_id uuid not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  active_until timestamptz not null default now() + interval '40 seconds',
  response jsonb,
  primary key (owner_id, request_id),
  check (response is null or octet_length(response::text) <= 64000)
);
create index lab_request_receipts_created on public.lab_request_receipts(created_at);
alter table public.lab_request_receipts enable row level security;
revoke all on public.lab_request_receipts from public, anon, authenticated;
grant all on public.lab_request_receipts to service_role;

create function public.claim_lab_request(p_owner uuid, p_request uuid, p_hash text)
returns table(outcome text, cached_response jsonb) language plpgsql security definer set search_path = public, pg_temp as $$
declare receipt public.lab_request_receipts%rowtype;
begin
  -- Serialize only receipt admission; provider work happens outside this transaction.
  perform pg_advisory_xact_lock(22825, 1);
  delete from public.lab_request_receipts where expires_at <= now();
  select * into receipt from public.lab_request_receipts where owner_id = p_owner and request_id = p_request;
  if found then
    if receipt.input_hash <> p_hash then return query select 'conflict'::text, null::jsonb;
    elsif receipt.response is not null then return query select 'cached'::text, receipt.response;
    else return query select 'pending'::text, null::jsonb; end if;
    return;
  end if;
  if (select count(*) from public.lab_request_receipts where owner_id = p_owner and created_at > now() - interval '1 minute') >= 12
    or (select count(*) from public.lab_request_receipts where created_at > now() - interval '1 minute') >= 60
    or exists(select 1 from public.lab_request_receipts where owner_id = p_owner and response is null and active_until > now())
    or (select count(*) from public.lab_request_receipts where response is null and active_until > now()) >= 4 then
    return query select 'limited'::text, null::jsonb; return;
  end if;
  insert into public.lab_request_receipts(owner_id, request_id, input_hash) values(p_owner, p_request, p_hash);
  return query select 'claimed'::text, null::jsonb;
end $$;
revoke all on function public.claim_lab_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_lab_request(uuid, uuid, text) to service_role;
