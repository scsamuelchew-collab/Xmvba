-- Competition rules, end to end, against the real migrations.
-- Run with: npm run test:db   (needs a local Postgres; see README)

\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
$$;

-- Runs p_sql and asserts it fails with a message matching p_pattern.
create function tests.throws(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_pattern then
      raise exception 'Expected error matching "%", got "%" for: %', p_pattern, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'Expected an error matching "%" but it succeeded: %', p_pattern, p_sql;
end;
$$;

create function tests.eq(p_actual anyelement, p_expected anyelement, p_what text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '%: expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Users: 60 players + 1 organiser. uuid pattern 00000000-0000-0000-0000-0000000000NN.
create function tests.u(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
grant execute on function tests.u(int) to anon, authenticated;

insert into auth.users (id, email)
select tests.u(n), 'player' || n || '@example.com' from generate_series(1, 60) n;
insert into auth.users (id, email) values (tests.u(999), 'organiser@example.com');
update public.profiles set role = 'admin' where id = tests.u(999);

create table tests.ctx (k text primary key, v uuid);
grant all on tests.ctx to anon, authenticated;

do $$
declare
  v_event uuid := (select id from events where is_active);
  v_pos   text[] := array['setter','outside_hitter','opposite','middle_blocker','libero','utility'];
  n       int;
begin
  insert into tests.ctx values ('event', v_event);

  -- Signed-out callers are refused.
  perform tests.as_user(null);
  perform tests.throws(format($q$select register_player(%L,'A','A','91234567',null,null,2010,'setter',null,null,false,true,true,null)$q$, v_event), 'sign in');

  -- Validation.
  perform tests.as_user(tests.u(1));
  perform tests.throws(format($q$select register_player(%L,'A','A','xx',null,null,2010,'setter',null,null,false,true,true,null)$q$, v_event), 'mobile');
  perform tests.throws(format($q$select register_player(%L,'A','A','91234567',null,null,1900,'setter',null,null,false,true,true,null)$q$, v_event), 'graduating year');
  perform tests.throws(format($q$select register_player(%L,'A','A','91234567',null,null,2010,'setter','setter',null,false,true,true,null)$q$, v_event), 'different');
  perform tests.throws(format($q$select register_player(%L,'A','A','91234567',null,null,2010,'quarterback',null,null,false,true,true,null)$q$, v_event), 'primary position');

  -- Register 60 players across batches and positions.
  for n in 1..60 loop
    perform tests.as_user(tests.u(n));
    perform register_player(v_event, 'Player ' || n || ' Tan', 'P' || n, '9100' || lpad(n::text, 4, '0'), null, null,
                            2000 + (n % 15), v_pos[1 + (n % 6)], case when n % 2 = 0 then 'utility' end,
                            null, false, true, true, 'Note ' || n);
  end loop;
  perform tests.eq((select count(*)::int from players), 60, 'players registered');
  perform tests.eq((select email from player_private pp join players p on p.id = pp.player_id where p.user_id = tests.u(1)), 'player1@example.com', 'email defaults to sign-in email');

  -- Registering again edits rather than duplicates.
  perform tests.as_user(tests.u(1));
  perform register_player(v_event, 'Marcus Lim', 'Marcus', '91000001', null, null, 2008, 'setter', null, null, false, true, true, 'Captain');
  perform tests.eq((select count(*)::int from players where user_id = tests.u(1)), 1, 'one player row per user');
  perform tests.eq((select display_name from players where user_id = tests.u(1)), 'Marcus', 'profile updated');
end $$;

-- ---------------------------------------------------------------------------
-- Team creation, requests, invitations, capacity
-- ---------------------------------------------------------------------------
do $$
declare
  v_event uuid := (select v from tests.ctx where k = 'event');
  v_a     uuid;
  v_req   uuid;
  v_inv   uuid;
  n       int;
  p       uuid;
begin
  -- P1 creates XMS Legends.
  perform tests.as_user(tests.u(1));
  v_a := create_team(v_event, 'XMS Legends', 'Mostly 2008–2011 batch but happy for anyone to join.', '2008–2011', true, 8,
                     '{"setter":1,"middle_blocker":1,"utility":2}');
  insert into tests.ctx values ('team_a', v_a);
  perform tests.eq(team_member_count(v_a), 1, 'captain is on the roster');
  perform tests.eq((select status::text from teams where id = v_a), 'forming', 'new team is forming');
  perform tests.eq((select count(*)::int from team_position_needs where team_id = v_a), 3, 'needs stored');
  perform tests.eq((select status::text from registration_payments where team_id = v_a), 'not_required', 'no fee by default');

  -- A captain can't make a second team, and names are unique (case-insensitive).
  perform tests.throws(format($q$select create_team(%L,'Another',null,null,true,1,null)$q$, v_event), 'already in a team');
  perform tests.as_user(tests.u(2));
  perform tests.throws(format($q$select create_team(%L,'xms legends',null,null,true,1,null)$q$, v_event), 'already exists');

  -- Unregistered user can't create a team.
  perform tests.as_user(tests.u(999));
  perform tests.throws(format($q$select create_team(%L,'Org Team',null,null,true,1,null)$q$, v_event), 'player profile');

  -- Join request: not automatic.
  perform tests.as_user(tests.u(2));
  v_req := request_to_join(v_a, 'Usually play OH but can cover opposite.');
  perform tests.eq(team_member_count(v_a), 1, 'request does not add the player');
  perform tests.throws(format('select request_to_join(%L, null)', v_a), 'pending request');
  perform tests.eq((select count(*)::int from notifications where user_id = tests.u(1) and kind = 'join_request'), 1, 'captain notified');

  -- Only the captain can respond.
  perform tests.as_user(tests.u(3));
  perform tests.throws(format('select respond_join_request(%L, true)', v_req), 'captain');

  perform tests.as_user(tests.u(1));
  perform respond_join_request(v_req, true);
  perform tests.eq(team_member_count(v_a), 2, 'accepted player is on the roster');
  perform tests.eq((select is_free_agent from player_directory where user_id = tests.u(2)), false, 'joined player left the pool');
  perform tests.throws(format('select respond_join_request(%L, false)', v_req), 'already been handled');

  -- Rejection leaves the player in the pool.
  perform tests.as_user(tests.u(3));
  v_req := request_to_join(v_a, null);
  perform tests.as_user(tests.u(1));
  perform respond_join_request(v_req, false);
  perform tests.eq(team_member_count(v_a), 2, 'rejected player not added');
  perform tests.eq((select is_free_agent from player_directory where user_id = tests.u(3)), true, 'rejected player still in pool');

  -- Invitation from the pool → accept.
  p := (select id from players where user_id = tests.u(3));
  v_inv := invite_player(v_a, p, 'We need a middle!');
  perform tests.throws(format('select invite_player(%L, %L, null)', v_a, p), 'already invited');
  perform tests.as_user(tests.u(4));
  perform tests.throws(format('select respond_invitation(%L, true)', v_inv), 'not found');
  perform tests.as_user(tests.u(3));
  perform respond_invitation(v_inv, true);
  perform tests.eq(team_member_count(v_a), 3, 'invited player joined');

  -- Fill the team to 12 with requests.
  for n in 4..12 loop
    perform tests.as_user(tests.u(n));
    v_req := request_to_join(v_a, null);
    perform tests.as_user(tests.u(1));
    perform respond_join_request(v_req, true);
  end loop;
  perform tests.eq(team_member_count(v_a), 12, 'team at maximum');

  -- 13th player: request refused, and even a stale pending request can't be accepted.
  perform tests.as_user(tests.u(13));
  perform tests.throws(format('select request_to_join(%L, null)', v_a), 'full');
  perform tests.as_user(tests.u(1));
  perform tests.throws(format('select invite_player(%L, %L, null)', v_a, (select id from players where user_id = tests.u(13))), 'full');
end $$;

do $$
declare
  v_event uuid := (select v from tests.ctx where k = 'event');
  v_a     uuid := (select v from tests.ctx where k = 'team_a');
  v_b     uuid;
  v_req1  uuid;
  v_req2  uuid;
  v_inv   uuid;
begin
  -- Team B by P13.
  perform tests.as_user(tests.u(13));
  v_b := create_team(v_event, 'Class of 2012', null, '2012', true, 3, '{"libero":1}');
  insert into tests.ctx values ('team_b', v_b);

  -- A player already on a team can't request another.
  perform tests.as_user(tests.u(2));
  perform tests.throws(format('select request_to_join(%L, null)', v_b), 'already in a team');

  perform tests.as_user(tests.u(14));
  v_req1 := request_to_join(v_b, null);
  perform tests.as_user(tests.u(13));
  perform respond_join_request(v_req1, true);
  perform tests.eq(team_member_count(v_b), 2, 'B has two');

  -- Stale requests are cancelled when a player joins elsewhere.
  perform tests.as_user(tests.u(15));
  v_req2 := request_to_join(v_b, null);
  perform tests.as_user(tests.u(13));
  v_inv := invite_player(v_b, (select id from players where user_id = tests.u(16)), null);
  -- P15 joins B, so no pending rows remain for them.
  perform respond_join_request(v_req2, true);
  perform tests.eq((select count(*)::int from join_requests jr join players p on p.id = jr.player_id
                    where p.user_id = tests.u(15) and jr.status = 'pending'), 0, 'no pending requests after joining');
  perform cancel_invitation(v_inv);
  perform tests.eq((select status::text from team_invitations where id = v_inv), 'cancelled', 'invitation cancelled');

  -- Leaving: captain can't, player can (before lock).
  perform tests.as_user(tests.u(13));
  perform tests.throws(format('select leave_team(%L)', v_event), 'Captains');
  perform tests.as_user(tests.u(15));
  perform leave_team(v_event);
  perform tests.eq(team_member_count(v_b), 2, 'left player removed');
  perform tests.eq((select is_free_agent from player_directory where user_id = tests.u(15)), true, 'left player back in pool');

  -- Captain removes a player; can't remove themself.
  perform tests.as_user(tests.u(13));
  perform tests.throws(format('select remove_member(%L, %L)', v_b, (select id from players where user_id = tests.u(13))), 'captain');
  perform remove_member(v_b, (select id from players where user_id = tests.u(14)));
  perform tests.eq(team_member_count(v_b), 1, 'removed');

  -- Invite link joins directly (the captain sent the link).
  perform tests.as_user(tests.u(14));
  perform tests.eq(join_with_invite_code((select invite_code from team_secrets where team_id = v_b)), v_b, 'joined via link');
  perform tests.throws($q$select join_with_invite_code('nope')$q$, 'no longer valid');

  -- Submitting with fewer than the minimum is refused.
  perform tests.as_user(tests.u(13));
  perform tests.throws(format('select submit_team(%L)', v_b), 'at least 10');

  -- Captaincy transfer.
  perform transfer_captaincy(v_b, (select id from players where user_id = tests.u(14)));
  perform tests.eq((select p.user_id from teams t join players p on p.id = t.captain_player_id where t.id = v_b), tests.u(14), 'captain transferred');
  perform tests.throws(format('select update_team(%L, %L, null, null, true, true, null)', v_b, 'Renamed'), 'captain');
  perform tests.as_user(tests.u(14));
  perform update_team(v_b, 'Class of 2012 Reunion', null, '2012', true, true, '{"setter":2}');
  perform transfer_captaincy(v_b, (select id from players where user_id = tests.u(13)));
end $$;

-- ---------------------------------------------------------------------------
-- Fees, submission, approval, slots, waitlist, reserved slot
-- ---------------------------------------------------------------------------
do $$
declare
  v_event uuid := (select v from tests.ctx where k = 'event');
  v_a     uuid := (select v from tests.ctx where k = 'team_a');
  v_b     uuid := (select v from tests.ctx where k = 'team_b');
  v_c     uuid;
  v_d     uuid;
  v_r     uuid;
  n       int;
  v_req   uuid;
begin
  -- Only organisers change settings.
  perform tests.as_user(tests.u(1));
  perform tests.throws(format('select admin_update_settings(%L,2,1,1,10,12,true,5000,null,false)', v_event), 'organisers');

  perform tests.as_user(tests.u(999));
  perform admin_update_settings(v_event, 2, 1, 1, 10, 12, true, 5000, 'PayNow to 9xxx', false);
  perform tests.eq((select status::text from registration_payments where team_id = v_a), 'unpaid', 'fee applied to existing teams');

  -- A submits → payment pending; can't be confirmed until paid.
  perform tests.as_user(tests.u(1));
  perform tests.eq(submit_team(v_a)::text, 'payment_pending', 'submitted with fee outstanding');
  perform tests.throws(format('select submit_team(%L)', v_a), 'already been submitted');
  perform tests.as_user(tests.u(999));
  perform tests.throws(format('select admin_confirm_team(%L)', v_a), 'fee');
  perform admin_set_payment(v_a, 'paid', 'PN-123');
  perform tests.eq((select status::text from teams where id = v_a), 'admin_review', 'payment moves team to review');
  perform admin_confirm_team(v_a);
  perform tests.eq((select status::text from teams where id = v_a), 'confirmed', 'A confirmed');
  perform tests.eq((select roster_locked from teams where id = v_a), true, 'confirmation locks roster');
  perform tests.eq(open_slots_used(v_event), 1, 'one open slot used');

  -- Locked roster: player can't leave, captain can't remove; organiser can.
  perform tests.as_user(tests.u(2));
  perform tests.throws(format('select leave_team(%L)', v_event), 'locked');
  perform tests.as_user(tests.u(1));
  perform tests.throws(format('select remove_member(%L, %L)', v_a, (select id from players where user_id = tests.u(12))), 'locked');
  perform tests.as_user(tests.u(999));
  perform remove_member(v_a, (select id from players where user_id = tests.u(12)));
  perform tests.eq(team_member_count(v_a), 11, 'organiser removed from locked roster');

  -- Fill B to 10 and confirm it (fee waived).
  for n in 16..23 loop
    perform tests.as_user(tests.u(n));
    v_req := request_to_join(v_b, null);
    perform tests.as_user(tests.u(13));
    perform respond_join_request(v_req, true);
  end loop;
  perform tests.eq(team_member_count(v_b), 10, 'B at minimum');
  perform tests.as_user(tests.u(13));
  perform submit_team(v_b);
  perform tests.as_user(tests.u(999));
  perform admin_set_payment(v_b, 'waived', null);
  perform admin_confirm_team(v_b);
  perform tests.eq(open_slots_used(v_event), 2, 'both open slots used');

  -- C reaches 10 after the open slots are filled → submits straight to waitlist.
  perform tests.as_user(tests.u(24));
  v_c := create_team(v_event, 'Late Bloomers', null, null, true, 1, null);
  insert into tests.ctx values ('team_c', v_c);
  for n in 25..33 loop
    perform tests.as_user(tests.u(n));
    v_req := request_to_join(v_c, null);
    perform tests.as_user(tests.u(24));
    perform respond_join_request(v_req, true);
  end loop;
  perform tests.as_user(tests.u(24));
  perform tests.eq(submit_team(v_c)::text, 'waitlist', 'submitted after slots filled → waitlist');
  perform tests.as_user(tests.u(999));
  perform admin_set_payment(v_c, 'paid', null);
  perform tests.eq((select status::text from teams where id = v_c), 'waitlist', 'payment keeps waitlist team on waitlist');
  perform tests.throws(format('select admin_confirm_team(%L)', v_c), 'open slots are filled');
  perform tests.throws(format('select admin_promote_team(%L)', v_c), 'no open slot');

  -- Defending champions: reserved slot is separate from the open slots.
  perform tests.as_user(tests.u(34));
  v_r := create_team(v_event, 'Defending Champs', null, null, true, 12, null);
  for n in 35..43 loop
    perform tests.as_user(tests.u(n));
    v_req := request_to_join(v_r, null);
    perform tests.as_user(tests.u(34));
    perform respond_join_request(v_req, true);
  end loop;
  perform tests.as_user(tests.u(999));
  perform admin_set_reserved(v_r, true);
  perform tests.throws(format('select admin_set_reserved(%L, true)', v_c), 'reserved slot');
  perform tests.as_user(tests.u(34));
  perform tests.eq(submit_team(v_r)::text, 'payment_pending', 'reserved team not waitlisted');
  perform tests.as_user(tests.u(999));
  perform admin_set_payment(v_r, 'paid', null);
  perform admin_confirm_team(v_r);
  perform tests.eq((select status::text from teams where id = v_r), 'confirmed', 'reserved team confirmed');
  perform tests.eq(open_slots_used(v_event), 2, 'reserved team does not use an open slot');

  -- B withdraws → slot frees → promote C → confirm C.
  perform admin_withdraw_team(v_b, true);
  perform tests.eq(team_member_count(v_b), 0, 'withdrawn roster released');
  perform tests.eq((select is_free_agent from player_directory where user_id = tests.u(16)), true, 'released players back in pool');
  perform tests.eq(open_slots_used(v_event), 1, 'slot freed');
  perform admin_promote_team(v_c);
  perform tests.eq((select status::text from teams where id = v_c), 'admin_review', 'promoted to review (already paid)');
  perform admin_confirm_team(v_c);
  perform tests.eq(open_slots_used(v_event), 2, 'C took the freed slot');

  -- Organiser transfers a player between teams despite locks; capacity still enforced.
  perform admin_transfer_player((select id from players where user_id = tests.u(25)), v_a);
  perform tests.eq(team_member_count(v_a), 12, 'transfer in');
  perform tests.throws(format('select admin_transfer_player(%L, %L)', (select id from players where user_id = tests.u(26)), v_a), 'full');
  perform tests.eq(team_member_count(v_c), 9, 'failed transfer rolled back — player stays on C');
  perform tests.throws(format('select admin_transfer_player(%L, %L)', (select id from players where user_id = tests.u(24)), v_a), 'captain');

  -- Rejected team can fix and resubmit.
  perform tests.as_user(tests.u(44));
  v_d := create_team(v_event, 'Fresh Start', null, null, true, 1, null);
  insert into tests.ctx values ('team_d', v_d);
  perform tests.as_user(tests.u(999));
  perform admin_reject_team(v_d, 'Please add a libero');
  perform tests.eq((select count(*)::int from admin_notes where team_id = v_d), 1, 'rejection reason kept as note');

  -- Organiser can reopen a team (e.g. to undo a mistaken decision).
  perform admin_reopen_team(v_c);
  perform tests.eq((select status::text from teams where id = v_c), 'forming', 'reopened');
end $$;

-- ---------------------------------------------------------------------------
-- Registration closed
-- ---------------------------------------------------------------------------
do $$
declare
  v_event uuid := (select v from tests.ctx where k = 'event');
  v_d     uuid := (select v from tests.ctx where k = 'team_d');
begin
  perform tests.as_user(tests.u(999));
  perform admin_update_settings(v_event, 2, 1, 1, 10, 12, false, 5000, null, false);
  perform tests.as_user(tests.u(50));
  perform tests.throws(format('select request_to_join(%L, null)', v_d), 'closed');
  perform tests.throws(format('select create_team(%L, %L, null, null, true, 1, null)', v_event, 'Too Late'), 'closed');
  perform tests.as_user(tests.u(999));
  perform admin_update_settings(v_event, 2, 1, 1, 10, 12, true, 5000, null, false);
end $$;

-- ---------------------------------------------------------------------------
-- Privacy (RLS) — run as the real API roles
-- ---------------------------------------------------------------------------
select null from tests.as_user(null);
set role anon;
select null from tests.eq((select count(*)::int from player_private), 0, 'anon sees no contact details');
select null from tests.eq((select count(*)::int from team_secrets), 0, 'anon sees no invite codes');
select null from tests.eq((select count(*)::int from admin_notes), 0, 'anon sees no admin notes');
select null from tests.eq((select count(*)::int > 0 from players), true, 'anon sees public player profiles');
select null from tests.eq((select count(*)::int > 0 from team_overview), true, 'anon sees team overview');
select null from tests.throws($q$insert into teams (event_id, name, captain_player_id) select event_id, 'Hack', id from players limit 1$q$, 'permission denied');
reset role;

-- A player with no team sees only their own contact details.
select null from tests.as_user(tests.u(55));
set role authenticated;
select null from tests.eq((select count(*)::int from player_private), 1, 'free agent sees only own contact');
select null from tests.eq((select count(*)::int from admin_notes), 0, 'player sees no admin notes');
select null from tests.eq((select count(*)::int from team_secrets), 0, 'non-captain sees no invite codes');
select null from tests.throws($q$update players set grad_year = 1999$q$, 'permission denied');
select null from tests.throws($q$select admin_confirm_team((select v from tests.ctx where k = 'team_d'))$q$, 'organisers');
reset role;

-- Captain of A sees their roster's contacts, but not other teams'.
select null from tests.as_user(tests.u(1));
set role authenticated;
select null from tests.eq((select count(*)::int from player_private), (select team_member_count((select v from tests.ctx where k = 'team_a'))),
                'captain sees exactly their roster''s contacts');
select null from tests.eq((select count(*)::int from team_secrets), 1, 'captain sees own invite code');
reset role;

-- A team member sees own + captain's contact.
select null from tests.as_user(tests.u(2));
set role authenticated;
select null from tests.eq((select count(*)::int from player_private), 2, 'member sees own + captain contact');
reset role;

-- Pending requester becomes visible to the captain they asked.
select null from tests.as_user(tests.u(56));
select null from request_to_join((select v from tests.ctx where k = 'team_d'), 'hi');
select null from tests.as_user(tests.u(44));
set role authenticated;
select null from tests.eq((select count(*)::int from player_private), 2, 'captain sees pending requester contact');
select null from tests.eq((select count(*)::int from join_requests), 1, 'captain sees their team''s requests');
reset role;

-- Organiser sees everything.
select null from tests.as_user(tests.u(999));
set role authenticated;
select null from tests.eq((select count(*)::int from player_private), 60, 'organiser sees all contacts');
select null from tests.eq((select count(*)::int > 0 from admin_notes), true, 'organiser sees notes');
reset role;

-- Notifications are private to their owner.
select null from tests.as_user(tests.u(1));
set role authenticated;
select null from tests.eq((select count(*)::int from notifications where user_id <> tests.u(1)), 0, 'only own notifications');
select null from mark_notifications_read();
select null from tests.eq((select count(*)::int from notifications where read_at is null), 0, 'marked read');
reset role;

\echo 'All rules tests passed.'
