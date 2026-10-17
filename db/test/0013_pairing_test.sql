-- Pairing columns: valid values accepted, bad ones rejected, view hides incomplete pairings.
do $$
declare uid uuid := gen_random_uuid(); app uuid;
begin
  insert into auth.users (id, email) values (uid, 'pair@example.com');
  insert into applications (applicant_id, project_name) values (uid, 'Pairtest') returning id into app;

  update applications set pair_kind = 'person', pair_name = 'Andrej Karpathy', pair_relationship = 'inspired_by',
         pair_reason = 'Our tutor product teaches neural nets from scratch.', pair_url = 'https://karpathy.ai' where id = app;
  raise notice 'PASS person pairing accepted';

  begin
    update applications set pair_kind = 'token', pair_mint = null where id = app;
    raise exception 'token pairing without mint was accepted';
  exception when check_violation then raise notice 'PASS token pairing needs a mint';
  end;

  begin
    update applications set pair_url = 'http://insecure.example' where id = app;
    raise exception 'http pair_url accepted';
  exception when check_violation then raise notice 'PASS pair_url must be https';
  end;

  update applications set pair_kind = 'token', pair_mint = 'So11111111111111111111111111111111111111112', pair_name = 'Wrapped SOL' where id = app;
  raise notice 'PASS token pairing with mint accepted';
end $$;
