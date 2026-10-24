-- Local-only, self-rolling-back request coordination checks. No provider calls.
begin;
do $$
declare owner1 uuid; owner2 uuid; request1 uuid := gen_random_uuid(); outcome1 text; cached jsonb; i integer;
begin
  select id into owner1 from public.users order by id limit 1;
  select id into owner2 from public.users where id <> owner1 order by id limit 1;
  if owner2 is null then raise exception 'Need two local fixture users'; end if;
  -- Isolate quota assertions inside this rolled-back transaction only.
  delete from public.lab_request_receipts;
  if has_function_privilege('anon', 'public.claim_lab_request(uuid,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_lab_request(uuid,uuid,text)', 'execute') then
    raise exception 'Browser roles can execute privileged request coordination';
  end if;
  if has_table_privilege('authenticated', 'public.lab_request_receipts', 'select')
    or has_table_privilege('anon', 'public.lab_request_receipts', 'insert') then
    raise exception 'Browser roles can access private receipts';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.lab_request_receipts'::regclass) then raise exception 'RLS disabled'; end if;
  select outcome into outcome1 from public.claim_lab_request(owner1, request1, repeat('1',64));
  if outcome1 <> 'claimed' then raise exception 'Initial claim failed'; end if;
  select outcome into outcome1 from public.claim_lab_request(owner1, request1, repeat('1',64));
  if outcome1 <> 'pending' then raise exception 'Concurrent duplicate admitted'; end if;
  select outcome into outcome1 from public.claim_lab_request(owner1, request1, repeat('2',64));
  if outcome1 <> 'conflict' then raise exception 'Changed-body duplicate admitted'; end if;
  update public.lab_request_receipts set response = '{"status":"fixture"}', active_until = now() where owner_id = owner1 and request_id = request1;
  select outcome, cached_response into outcome1, cached from public.claim_lab_request(owner1, request1, repeat('1',64));
  if outcome1 <> 'cached' or cached->>'status' <> 'fixture' then raise exception 'Completed duplicate was not replayed'; end if;
  select outcome, cached_response into outcome1, cached from public.claim_lab_request(owner2, request1, repeat('1',64));
  if outcome1 <> 'claimed' or cached is not null then raise exception 'Cross-owner cached response leaked'; end if;
  for i in 2..12 loop
    select outcome into outcome1 from public.claim_lab_request(owner1, gen_random_uuid(), repeat('3',64));
    if outcome1 <> 'claimed' then raise exception 'Premature rate cap'; end if;
    update public.lab_request_receipts set response = '{}' where owner_id = owner1 and response is null;
  end loop;
  select outcome into outcome1 from public.claim_lab_request(owner1, gen_random_uuid(), repeat('4',64));
  if outcome1 <> 'limited' then raise exception 'Per-owner rate cap bypassed'; end if;
  update public.lab_request_receipts set expires_at = now() - interval '1 second';
  select outcome into outcome1 from public.claim_lab_request(owner1, gen_random_uuid(), repeat('5',64));
  if outcome1 <> 'claimed' or (select count(*) from public.lab_request_receipts) <> 1 then raise exception 'Expired receipts not removed'; end if;
  raise notice 'PASS: grants/RLS, pending/completed/conflicting duplicates, owner isolation, rate cap and expiry cleanup';
end $$;
rollback;
