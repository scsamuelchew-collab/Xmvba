-- Xinmin Alumni Volleyball Team Lobby — core schema.
--
-- Design rule: the browser never writes tables directly. Signed-in users and
-- the public only get SELECT (filtered by RLS). Every change goes through a
-- SECURITY DEFINER function below, which checks who is calling and enforces
-- the competition rules inside one transaction.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('player', 'admin');

create type public.team_status as enum (
  'forming',          -- recruiting; may or may not have reached the minimum
  'payment_pending',  -- submitted, fee outstanding
  'admin_review',     -- submitted (and paid if applicable), awaiting organiser
  'confirmed',        -- holds a competition slot
  'waitlist',         -- submitted after the open slots were filled
  'rejected',         -- organiser sent it back; captain can fix and resubmit
  'withdrawn'         -- pulled out; no longer in the competition
);

create type public.request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');

create type public.payment_status as enum ('not_required', 'unpaid', 'paid', 'waived');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users (profiles), events and configurable settings
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  role        public.user_role not null default 'player',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name          text not null,
  sport         text not null default 'volleyball',
  event_date    date not null,
  start_time    time,
  end_time      time,
  venue         text,
  format_label  text,                 -- e.g. '4-Way Round Robin'
  tagline       text,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Only one event is "the current event" at a time.
create unique index events_one_active on public.events (is_active) where is_active;

create table public.event_settings (
  event_id              uuid primary key references public.events (id) on delete cascade,
  open_slots            int not null default 2 check (open_slots >= 0),
  reserved_slots        int not null default 1 check (reserved_slots >= 0),
  reserved_label        text not null default 'Defending champion',
  other_slots           int not null default 1 check (other_slots >= 0),
  other_slots_label     text not null default 'Current Xinmin B Division school team',
  min_roster            int not null default 10 check (min_roster >= 1),
  max_roster            int not null default 12,
  registration_open     boolean not null default true,
  fee_cents             int not null default 0 check (fee_cents >= 0),
  payment_instructions  text,
  require_gender        boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (max_roster >= min_roster)
);

-- Position catalogue per sport, with the suggested squad structure.
create table public.positions (
  code         text primary key,
  sport        text not null,
  label        text not null,
  short_label  text not null,
  sort_order   int not null default 0,
  guide_min    int,
  guide_max    int,
  is_flexible  boolean not null default false
);

insert into public.positions (code, sport, label, short_label, sort_order, guide_min, guide_max, is_flexible) values
  ('setter',         'volleyball', 'Setter',             'S',   1, 1, 2, false),
  ('outside_hitter', 'volleyball', 'Outside Hitter',     'OH',  2, 2, 3, false),
  ('opposite',       'volleyball', 'Opposite',           'OPP', 3, 1, 2, false),
  ('middle_blocker', 'volleyball', 'Middle Blocker',     'MB',  4, 2, 3, false),
  ('libero',         'volleyball', 'Libero',             'L',   5, 1, 2, false),
  ('utility',        'volleyball', 'Utility / Flexible', 'UTL', 6, null, null, true);

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------

create table public.players (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  display_name        text not null check (char_length(display_name) between 1 and 40),
  grad_year           int not null check (grad_year between 1960 and 2100),
  primary_position    text not null references public.positions (code),
  secondary_position  text references public.positions (code),
  experience          text check (char_length(experience) <= 60),
  has_team            boolean not null default false,  -- "I already have a team" at sign-up
  open_to_mixed       boolean not null default true,
  looking_for_team    boolean not null default true,   -- shown in the Player Pool when teamless
  note                text check (char_length(note) <= 280),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (event_id, user_id),
  check (secondary_position is null or secondary_position <> primary_position)
);

create index players_event_idx on public.players (event_id);

-- Contact details live apart from the public profile so RLS can hide them
-- as a whole: public pages only ever see the players table.
create table public.player_private (
  player_id   uuid primary key references public.players (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 1 and 100),
  mobile      text not null check (char_length(mobile) between 6 and 20),
  email       text,
  gender      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

create table public.teams (
  id                         uuid primary key default gen_random_uuid(),
  event_id                   uuid not null references public.events (id) on delete cascade,
  name                       text not null check (char_length(name) between 2 and 40),
  captain_player_id          uuid not null references public.players (id),
  description                text check (char_length(description) <= 400),
  approx_batch               text check (char_length(approx_batch) <= 40),
  mixed_batch                boolean not null default true,
  declared_existing_players  int not null default 1 check (declared_existing_players between 0 and 30),
  recruiting                 boolean not null default true,
  status                     public.team_status not null default 'forming',
  roster_locked              boolean not null default false,
  is_reserved                boolean not null default false,  -- holds the defending champion slot
  submitted_at               timestamptz,
  confirmed_at               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create unique index teams_event_name_unique on public.teams (event_id, lower(name));
create index teams_event_idx on public.teams (event_id);

-- The invite-link code is a secret, so it is kept off the public teams table.
create table public.team_secrets (
  team_id      uuid primary key references public.teams (id) on delete cascade,
  invite_code  text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.team_position_needs (
  team_id   uuid not null references public.teams (id) on delete cascade,
  position  text not null references public.positions (code),
  count     int not null check (count between 1 and 12),
  primary key (team_id, position)
);

create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  -- UNIQUE: a player can only ever be on one team.
  player_id   uuid not null unique references public.players (id) on delete cascade,
  role        text not null default 'player' check (role in ('captain', 'player')),
  added_by    uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index team_members_team_idx on public.team_members (team_id);

create table public.join_requests (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  message      text check (char_length(message) <= 280),
  status       public.request_status not null default 'pending',
  decided_by   uuid references public.profiles (id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index join_requests_one_pending on public.join_requests (team_id, player_id) where status = 'pending';
create index join_requests_player_idx on public.join_requests (player_id);

create table public.team_invitations (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  invited_by   uuid references public.profiles (id),
  message      text check (char_length(message) <= 280),
  status       public.request_status not null default 'pending',
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index team_invitations_one_pending on public.team_invitations (team_id, player_id) where status = 'pending';
create index team_invitations_player_idx on public.team_invitations (player_id);

create table public.registration_payments (
  team_id       uuid primary key references public.teams (id) on delete cascade,
  amount_cents  int not null default 0 check (amount_cents >= 0),
  status        public.payment_status not null default 'not_required',
  reference     text check (char_length(reference) <= 100),
  paid_at       timestamptz,
  marked_by     uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.admin_notes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  team_id     uuid references public.teams (id) on delete cascade,
  player_id   uuid references public.players (id) on delete cascade,
  author_id   uuid references public.profiles (id),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  check (team_id is not null or player_id is not null)
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- updated_at triggers
create trigger set_updated_at before update on public.profiles for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.events for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.event_settings for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.players for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.player_private for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.teams for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.team_secrets for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.join_requests for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.team_invitations for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.registration_payments for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- New auth user → profile
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers used by RLS and the functions below
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_player_id(p_event uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from players where event_id = p_event and user_id = auth.uid();
$$;

create or replace function public.is_captain(p_team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from teams t join players p on p.id = t.captain_player_id
    where t.id = p_team and p.user_id = auth.uid()
  );
$$;

create or replace function public.is_team_member(p_team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members m join players p on p.id = m.player_id
    where m.team_id = p_team and p.user_id = auth.uid()
  );
$$;

-- Contact details are visible to: organisers, the player themself, the
-- captain of a team the player is on or has a pending request/invitation
-- with, and team members for their own captain.
create or replace function public.can_view_player_private(p_player uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  with my_captained as (
    select t.id from teams t join players p on p.id = t.captain_player_id
    where p.user_id = auth.uid()
  )
  select public.is_admin()
    or exists (select 1 from players where id = p_player and user_id = auth.uid())
    or exists (select 1 from team_members m where m.player_id = p_player and m.team_id in (select id from my_captained))
    or exists (select 1 from join_requests r where r.player_id = p_player and r.status = 'pending' and r.team_id in (select id from my_captained))
    or exists (select 1 from team_invitations i where i.player_id = p_player and i.status = 'pending' and i.team_id in (select id from my_captained))
    or exists (
      select 1 from teams t
      join team_members m on m.team_id = t.id
      join players me on me.id = m.player_id
      where t.captain_player_id = p_player and me.user_id = auth.uid()
    );
$$;

create or replace function public.team_member_count(p_team uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from team_members where team_id = p_team;
$$;

-- Internal: notifications. Not callable from the API.
create or replace function public._notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql security definer
set search_path = public
as $$
  insert into notifications (user_id, kind, title, body, link)
  select p_user, p_kind, p_title, p_body, p_link where p_user is not null;
$$;

create or replace function public._notify_player(p_player uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql security definer
set search_path = public
as $$
  select public._notify_user(user_id, p_kind, p_title, p_body, p_link) from players where id = p_player;
$$;

create or replace function public._notify_captain(p_team uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql security definer
set search_path = public
as $$
  select public._notify_player(captain_player_id, p_kind, p_title, p_body, p_link) from teams where id = p_team;
$$;

create or replace function public._notify_team(p_team uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql security definer
set search_path = public
as $$
  select public._notify_player(player_id, p_kind, p_title, p_body, p_link) from team_members where team_id = p_team;
$$;

create or replace function public._notify_admins(p_kind text, p_title text, p_body text, p_link text)
returns void
language sql security definer
set search_path = public
as $$
  select public._notify_user(id, p_kind, p_title, p_body, p_link) from profiles where role = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Roster guard: the hard limits, enforced however a member is added
-- ---------------------------------------------------------------------------

create or replace function public.tg_team_members_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_team    teams;
  v_s       event_settings;
  v_count   int;
begin
  -- Lock the team row so two concurrent accepts can't both take the last spot.
  select * into v_team from teams where id = new.team_id for update;
  select * into v_s from event_settings where event_id = v_team.event_id;

  if not exists (select 1 from players where id = new.player_id and event_id = v_team.event_id) then
    raise exception 'This player is not registered for this event.';
  end if;
  if exists (select 1 from team_members where player_id = new.player_id) then
    raise exception 'This player is already in a team. Players may only register for one team.';
  end if;
  if v_team.status = 'withdrawn' then
    raise exception 'This team has withdrawn from the competition.';
  end if;

  select count(*) into v_count from team_members where team_id = new.team_id;
  if v_count >= v_s.max_roster then
    raise exception 'This team is full (% / % players).', v_count, v_s.max_roster;
  end if;

  if not public.is_admin() then
    if v_team.roster_locked then
      raise exception 'This team''s roster is locked. Roster changes need organiser approval.';
    end if;
    if not v_s.registration_open then
      raise exception 'Registration is closed.';
    end if;
  end if;

  return new;
end;
$$;

create trigger team_members_guard
  before insert on public.team_members
  for each row execute function public.tg_team_members_before_insert();

-- Joining a team closes every other open request and invitation for that
-- player, which (with the derived pool) takes them out of the Player Pool.
create or replace function public.tg_team_members_after_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update join_requests set status = 'cancelled', decided_at = now()
    where player_id = new.player_id and status = 'pending';
  update team_invitations set status = 'cancelled', decided_at = now()
    where player_id = new.player_id and status = 'pending';
  return new;
end;
$$;

create trigger team_members_after_insert
  after insert on public.team_members
  for each row execute function public.tg_team_members_after_insert();

create or replace function public.tg_team_members_before_delete()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin()
     and exists (select 1 from teams where id = old.team_id and roster_locked) then
    raise exception 'This team''s roster is locked. Roster changes need organiser approval.';
  end if;
  return old;
end;
$$;

create trigger team_members_delete_guard
  before delete on public.team_members
  for each row execute function public.tg_team_members_before_delete();

-- A submitted (not yet confirmed) team that drops under the minimum goes back
-- to forming and must resubmit.
create or replace function public.tg_team_members_after_delete()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update teams t set status = 'forming', submitted_at = null
  from event_settings s
  where t.id = old.team_id
    and s.event_id = t.event_id
    and t.status in ('payment_pending', 'admin_review', 'waitlist')
    and (select count(*) from team_members where team_id = t.id) < s.min_roster;
  return old;
end;
$$;

create trigger team_members_after_delete
  after delete on public.team_members
  for each row execute function public.tg_team_members_after_delete();

-- ---------------------------------------------------------------------------
-- Public read views
-- ---------------------------------------------------------------------------

create view public.team_overview with (security_invoker = true) as
select
  t.id, t.event_id, t.name, t.captain_player_id, t.description, t.approx_batch,
  t.mixed_batch, t.declared_existing_players, t.recruiting, t.status,
  t.roster_locked, t.is_reserved, t.submitted_at, t.confirmed_at,
  t.created_at, t.updated_at,
  cp.display_name as captain_name,
  cp.grad_year    as captain_grad_year,
  (select count(*) from team_members m where m.team_id = t.id)::int as member_count,
  coalesce((
    select jsonb_object_agg(n.position, n.count) from team_position_needs n where n.team_id = t.id
  ), '{}'::jsonb) as needs
from teams t
join players cp on cp.id = t.captain_player_id;

create view public.player_directory with (security_invoker = true) as
select
  p.*,
  m.team_id,
  t.name as team_name,
  (m.team_id is null) as is_free_agent
from players p
left join team_members m on m.player_id = p.id
left join teams t on t.id = m.team_id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.events                enable row level security;
alter table public.event_settings        enable row level security;
alter table public.positions             enable row level security;
alter table public.players               enable row level security;
alter table public.player_private        enable row level security;
alter table public.teams                 enable row level security;
alter table public.team_secrets          enable row level security;
alter table public.team_position_needs   enable row level security;
alter table public.team_members          enable row level security;
alter table public.join_requests         enable row level security;
alter table public.team_invitations      enable row level security;
alter table public.registration_payments enable row level security;
alter table public.admin_notes           enable row level security;
alter table public.notifications         enable row level security;

create policy "own profile or admin" on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "public read" on public.events              for select using (true);
create policy "public read" on public.event_settings      for select using (true);
create policy "public read" on public.positions           for select using (true);
create policy "public read" on public.players             for select using (true);
create policy "public read" on public.teams               for select using (true);
create policy "public read" on public.team_position_needs for select using (true);
create policy "public read" on public.team_members        for select using (true);

create policy "restricted contact details" on public.player_private for select
  to authenticated using (public.can_view_player_private(player_id));

create policy "captain or admin" on public.team_secrets for select
  to authenticated using (public.is_captain(team_id) or public.is_admin());

create policy "own, captain or admin" on public.join_requests for select
  to authenticated using (
    public.is_admin() or public.is_captain(team_id)
    or player_id in (select id from public.players where user_id = auth.uid())
  );

create policy "own, captain or admin" on public.team_invitations for select
  to authenticated using (
    public.is_admin() or public.is_captain(team_id)
    or player_id in (select id from public.players where user_id = auth.uid())
  );

create policy "team or admin" on public.registration_payments for select
  to authenticated using (public.is_admin() or public.is_team_member(team_id));

create policy "admin only" on public.admin_notes for select
  to authenticated using (public.is_admin());

create policy "own notifications" on public.notifications for select
  to authenticated using (user_id = auth.uid());

-- Belt and braces: no direct writes from the API roles at all.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers for the API functions
-- ---------------------------------------------------------------------------

create or replace function public._require_user()
returns uuid
language plpgsql stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  return auth.uid();
end;
$$;

create or replace function public._require_admin()
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only organisers can do this.';
  end if;
end;
$$;

create or replace function public._require_captain_or_admin(p_team uuid)
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.is_captain(p_team) or public.is_admin()) then
    raise exception 'Only the team captain can do this.';
  end if;
end;
$$;

create or replace function public._set_needs(p_team uuid, p_needs jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_key text;
  v_val text;
begin
  delete from team_position_needs where team_id = p_team;
  if p_needs is null then
    return;
  end if;
  for v_key, v_val in select key, value from jsonb_each_text(p_needs) loop
    if not exists (select 1 from positions where code = v_key) then
      raise exception 'Unknown position: %', v_key;
    end if;
    if v_val::int > 0 then
      insert into team_position_needs (team_id, position, count) values (p_team, v_key, least(v_val::int, 12));
    end if;
  end loop;
end;
$$;

-- Confirmed teams using open (non-reserved) slots.
create or replace function public.open_slots_used(p_event uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from teams where event_id = p_event and status = 'confirmed' and not is_reserved;
$$;

-- ---------------------------------------------------------------------------
-- Player API
-- ---------------------------------------------------------------------------

create or replace function public.register_player(
  p_event         uuid,
  p_full_name     text,
  p_display_name  text,
  p_mobile        text,
  p_email         text,
  p_gender        text,
  p_grad_year     int,
  p_primary       text,
  p_secondary     text,
  p_experience    text,
  p_has_team      boolean,
  p_open_to_mixed boolean,
  p_looking       boolean,
  p_note          text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid       uuid := public._require_user();
  v_s         event_settings;
  v_sport     text;
  v_id        uuid;
  v_secondary text := nullif(trim(coalesce(p_secondary, '')), '');
  v_mobile    text := trim(coalesce(p_mobile, ''));
  v_email     text := nullif(trim(coalesce(p_email, '')), '');
begin
  select * into v_s from event_settings where event_id = p_event;
  if not found then
    raise exception 'Event not found.';
  end if;
  select sport into v_sport from events where id = p_event;

  if char_length(trim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'Please enter your full name.';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'Please enter the name to show on team pages.';
  end if;
  if v_mobile !~ '^\+?[0-9 ()-]{6,20}$' then
    raise exception 'Please enter a valid mobile number.';
  end if;
  if p_grad_year is null or p_grad_year < 1960 or p_grad_year > extract(year from now())::int then
    raise exception 'Please enter a valid graduating year.';
  end if;
  if not exists (select 1 from positions where code = p_primary and sport = v_sport) then
    raise exception 'Please choose your primary position.';
  end if;
  if v_secondary is not null then
    if not exists (select 1 from positions where code = v_secondary and sport = v_sport) then
      raise exception 'Unknown secondary position.';
    end if;
    if v_secondary = p_primary then
      raise exception 'Secondary position must be different from your primary position.';
    end if;
  end if;
  if v_s.require_gender and nullif(trim(coalesce(p_gender, '')), '') is null then
    raise exception 'Please select your gender.';
  end if;
  if char_length(coalesce(p_note, '')) > 280 then
    raise exception 'Note is too long (280 characters max).';
  end if;

  if v_email is null then
    select email into v_email from profiles where id = v_uid;
  end if;

  select id into v_id from players where event_id = p_event and user_id = v_uid;

  if v_id is null then
    if not v_s.registration_open then
      raise exception 'Registration is closed.';
    end if;
    insert into players (event_id, user_id, display_name, grad_year, primary_position, secondary_position,
                         experience, has_team, open_to_mixed, looking_for_team, note)
    values (p_event, v_uid, trim(p_display_name), p_grad_year, p_primary, v_secondary,
            nullif(trim(coalesce(p_experience, '')), ''), coalesce(p_has_team, false),
            coalesce(p_open_to_mixed, true), coalesce(p_looking, true), nullif(trim(coalesce(p_note, '')), ''))
    returning id into v_id;

    insert into player_private (player_id, full_name, mobile, email, gender)
    values (v_id, trim(p_full_name), v_mobile, v_email, nullif(trim(coalesce(p_gender, '')), ''));
  else
    update players set
      display_name       = trim(p_display_name),
      grad_year          = p_grad_year,
      primary_position   = p_primary,
      secondary_position = v_secondary,
      experience         = nullif(trim(coalesce(p_experience, '')), ''),
      has_team           = coalesce(p_has_team, has_team),
      open_to_mixed      = coalesce(p_open_to_mixed, open_to_mixed),
      looking_for_team   = coalesce(p_looking, looking_for_team),
      note               = nullif(trim(coalesce(p_note, '')), '')
    where id = v_id;

    update player_private set
      full_name = trim(p_full_name),
      mobile    = v_mobile,
      email     = v_email,
      gender    = nullif(trim(coalesce(p_gender, '')), '')
    where player_id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.set_looking_for_team(p_event uuid, p_looking boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public._require_user();
  update players set looking_for_team = p_looking where event_id = p_event and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Team API (captain)
-- ---------------------------------------------------------------------------

create or replace function public.create_team(
  p_event        uuid,
  p_name         text,
  p_description  text,
  p_approx_batch text,
  p_mixed        boolean,
  p_existing     int,
  p_needs        jsonb
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_user();
  v_s      event_settings;
  v_player uuid;
  v_team   uuid;
  v_name   text := trim(coalesce(p_name, ''));
begin
  select * into v_s from event_settings where event_id = p_event;
  if not found then
    raise exception 'Event not found.';
  end if;
  v_player := public.my_player_id(p_event);
  if v_player is null then
    raise exception 'Please complete your player profile first.';
  end if;
  if exists (select 1 from team_members where player_id = v_player) then
    raise exception 'You are already in a team. Players may only register for one team.';
  end if;
  if not v_s.registration_open and not public.is_admin() then
    raise exception 'Registration is closed.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'Team name must be 2–40 characters.';
  end if;
  if exists (select 1 from teams where event_id = p_event and lower(name) = lower(v_name)) then
    raise exception 'A team called "%" already exists. Please pick another name.', v_name;
  end if;

  insert into teams (event_id, name, captain_player_id, description, approx_batch, mixed_batch, declared_existing_players)
  values (p_event, v_name, v_player, nullif(trim(coalesce(p_description, '')), ''),
          nullif(trim(coalesce(p_approx_batch, '')), ''), coalesce(p_mixed, true),
          greatest(0, least(coalesce(p_existing, 1), 30)))
  returning id into v_team;

  insert into team_members (team_id, player_id, role, added_by) values (v_team, v_player, 'captain', v_uid);
  insert into team_secrets (team_id) values (v_team);
  insert into registration_payments (team_id, amount_cents, status)
  values (v_team, v_s.fee_cents, case when v_s.fee_cents > 0 then 'unpaid'::payment_status else 'not_required'::payment_status end);
  perform public._set_needs(v_team, p_needs);

  return v_team;
end;
$$;

create or replace function public.update_team(
  p_team         uuid,
  p_name         text,
  p_description  text,
  p_approx_batch text,
  p_mixed        boolean,
  p_recruiting   boolean,
  p_needs        jsonb
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
  v_name text := trim(coalesce(p_name, ''));
begin
  perform public._require_user();
  perform public._require_captain_or_admin(p_team);
  select * into v_team from teams where id = p_team;
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'Team name must be 2–40 characters.';
  end if;
  if exists (select 1 from teams where event_id = v_team.event_id and lower(name) = lower(v_name) and id <> p_team) then
    raise exception 'A team called "%" already exists. Please pick another name.', v_name;
  end if;

  update teams set
    name         = v_name,
    description  = nullif(trim(coalesce(p_description, '')), ''),
    approx_batch = nullif(trim(coalesce(p_approx_batch, '')), ''),
    mixed_batch  = coalesce(p_mixed, mixed_batch),
    recruiting   = coalesce(p_recruiting, recruiting)
  where id = p_team;

  if p_needs is not null then
    perform public._set_needs(p_team, p_needs);
  end if;
end;
$$;

create or replace function public.request_to_join(p_team uuid, p_message text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_team   teams;
  v_s      event_settings;
  v_player uuid;
  v_name   text;
  v_id     uuid;
begin
  perform public._require_user();
  select * into v_team from teams where id = p_team;
  if not found then
    raise exception 'Team not found.';
  end if;
  select * into v_s from event_settings where event_id = v_team.event_id;
  v_player := public.my_player_id(v_team.event_id);
  if v_player is null then
    raise exception 'Please register as a player first.';
  end if;
  if exists (select 1 from team_members where player_id = v_player) then
    raise exception 'You are already in a team. Players may only register for one team.';
  end if;
  if not v_s.registration_open then
    raise exception 'Registration is closed.';
  end if;
  if v_team.status = 'withdrawn' then
    raise exception 'This team has withdrawn from the competition.';
  end if;
  if v_team.roster_locked then
    raise exception 'This team''s roster is locked.';
  end if;
  if not v_team.recruiting then
    raise exception 'This team is not recruiting right now.';
  end if;
  if public.team_member_count(p_team) >= v_s.max_roster then
    raise exception 'This team is full.';
  end if;
  if exists (select 1 from join_requests where team_id = p_team and player_id = v_player and status = 'pending') then
    raise exception 'You already have a pending request with this team.';
  end if;
  if exists (select 1 from team_invitations where team_id = p_team and player_id = v_player and status = 'pending') then
    raise exception 'This team has already invited you — accept the invitation in My Lobby.';
  end if;

  insert into join_requests (team_id, player_id, message)
  values (p_team, v_player, nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_id;

  select display_name into v_name from players where id = v_player;
  perform public._notify_captain(p_team, 'join_request', v_name || ' wants to join ' || v_team.name,
                                 nullif(trim(coalesce(p_message, '')), ''), '/teams/' || p_team || '/manage');
  return v_id;
end;
$$;

create or replace function public.cancel_join_request(p_request uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public._require_user();
  update join_requests r set status = 'cancelled', decided_at = now()
  where r.id = p_request and r.status = 'pending'
    and r.player_id in (select id from players where user_id = auth.uid());
  if not found then
    raise exception 'Request not found or already handled.';
  end if;
end;
$$;

create or replace function public.respond_join_request(p_request uuid, p_accept boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_req  join_requests;
  v_team teams;
begin
  perform public._require_user();
  select * into v_req from join_requests where id = p_request for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  perform public._require_captain_or_admin(v_req.team_id);
  if v_req.status <> 'pending' then
    raise exception 'This request has already been handled.';
  end if;
  select * into v_team from teams where id = v_req.team_id;

  if p_accept then
    insert into team_members (team_id, player_id, role, added_by) values (v_req.team_id, v_req.player_id, 'player', auth.uid());
    update join_requests set status = 'accepted', decided_by = auth.uid(), decided_at = now() where id = p_request;
    perform public._notify_player(v_req.player_id, 'request_accepted', 'You''re in! Welcome to ' || v_team.name,
                                  null, '/teams/' || v_req.team_id);
  else
    update join_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_request;
    perform public._notify_player(v_req.player_id, 'request_rejected', v_team.name || ' couldn''t take you this time',
                                  'Try another team, or stay in the Player Pool so captains can find you.', '/teams');
  end if;
end;
$$;

create or replace function public.invite_player(p_team uuid, p_player uuid, p_message text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
  v_s    event_settings;
  v_id   uuid;
begin
  perform public._require_user();
  perform public._require_captain_or_admin(p_team);
  select * into v_team from teams where id = p_team;
  select * into v_s from event_settings where event_id = v_team.event_id;

  if not exists (select 1 from players where id = p_player and event_id = v_team.event_id) then
    raise exception 'Player not found.';
  end if;
  if exists (select 1 from team_members where player_id = p_player) then
    raise exception 'This player is already in a team.';
  end if;
  if not v_s.registration_open then
    raise exception 'Registration is closed.';
  end if;
  if v_team.status = 'withdrawn' then
    raise exception 'This team has withdrawn from the competition.';
  end if;
  if v_team.roster_locked then
    raise exception 'Your roster is locked. Ask the organiser to unlock it first.';
  end if;
  if public.team_member_count(p_team) >= v_s.max_roster then
    raise exception 'Your team is full.';
  end if;
  if exists (select 1 from team_invitations where team_id = p_team and player_id = p_player and status = 'pending') then
    raise exception 'You have already invited this player.';
  end if;
  if exists (select 1 from join_requests where team_id = p_team and player_id = p_player and status = 'pending') then
    raise exception 'This player has already asked to join — accept their request instead.';
  end if;

  insert into team_invitations (team_id, player_id, invited_by, message)
  values (p_team, p_player, auth.uid(), nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_id;

  perform public._notify_player(p_player, 'invitation', v_team.name || ' invited you to join their team',
                                nullif(trim(coalesce(p_message, '')), ''), '/me');
  return v_id;
end;
$$;

create or replace function public.cancel_invitation(p_invitation uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv team_invitations;
begin
  perform public._require_user();
  select * into v_inv from team_invitations where id = p_invitation for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'Invitation not found or already handled.';
  end if;
  perform public._require_captain_or_admin(v_inv.team_id);
  update team_invitations set status = 'cancelled', decided_at = now() where id = p_invitation;
end;
$$;

create or replace function public.respond_invitation(p_invitation uuid, p_accept boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv  team_invitations;
  v_team teams;
  v_name text;
begin
  perform public._require_user();
  select * into v_inv from team_invitations where id = p_invitation for update;
  if not found or not exists (select 1 from players where id = v_inv.player_id and user_id = auth.uid()) then
    raise exception 'Invitation not found.';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invitation has already been handled.';
  end if;
  select * into v_team from teams where id = v_inv.team_id;
  select display_name into v_name from players where id = v_inv.player_id;

  if p_accept then
    insert into team_members (team_id, player_id, role, added_by) values (v_inv.team_id, v_inv.player_id, 'player', auth.uid());
    update team_invitations set status = 'accepted', decided_at = now() where id = p_invitation;
    perform public._notify_captain(v_inv.team_id, 'invitation_accepted', v_name || ' accepted your invitation',
                                   null, '/teams/' || v_inv.team_id || '/manage');
  else
    update team_invitations set status = 'rejected', decided_at = now() where id = p_invitation;
    perform public._notify_captain(v_inv.team_id, 'invitation_rejected', v_name || ' declined your invitation',
                                   null, '/teams/' || v_inv.team_id || '/manage');
  end if;
end;
$$;

-- Invite links: anyone holding the captain's link can look the team up …
create or replace function public.team_for_invite_code(p_code text)
returns table (team_id uuid, team_name text, event_id uuid)
language sql stable security definer
set search_path = public
as $$
  select t.id, t.name, t.event_id
  from team_secrets s join teams t on t.id = s.team_id
  where s.invite_code = p_code;
$$;

-- … and join directly: the captain invited them by sharing it.
create or replace function public.join_with_invite_code(p_code text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_team   teams;
  v_player uuid;
  v_name   text;
begin
  perform public._require_user();
  select t.* into v_team from team_secrets s join teams t on t.id = s.team_id where s.invite_code = p_code;
  if not found then
    raise exception 'This invite link is no longer valid. Ask your captain for a new one.';
  end if;
  v_player := public.my_player_id(v_team.event_id);
  if v_player is null then
    raise exception 'Please register as a player first.';
  end if;
  if exists (select 1 from team_members where team_id = v_team.id and player_id = v_player) then
    return v_team.id;
  end if;

  insert into team_members (team_id, player_id, role, added_by) values (v_team.id, v_player, 'player', auth.uid());

  select display_name into v_name from players where id = v_player;
  perform public._notify_captain(v_team.id, 'joined_via_link', v_name || ' joined ' || v_team.name || ' via your invite link',
                                 null, '/teams/' || v_team.id || '/manage');
  return v_team.id;
end;
$$;

create or replace function public.regenerate_invite_code(p_team uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
begin
  perform public._require_user();
  perform public._require_captain_or_admin(p_team);
  update team_secrets set invite_code = v_code where team_id = p_team;
  return v_code;
end;
$$;

create or replace function public.leave_team(p_event uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_team   teams;
  v_name   text;
begin
  perform public._require_user();
  v_player := public.my_player_id(p_event);
  select t.* into v_team from team_members m join teams t on t.id = m.team_id where m.player_id = v_player;
  if not found then
    raise exception 'You are not in a team.';
  end if;
  if v_team.captain_player_id = v_player then
    raise exception 'Captains can''t leave their own team. Hand the captaincy to a teammate first, or disband the team.';
  end if;

  delete from team_members where player_id = v_player;

  select display_name into v_name from players where id = v_player;
  perform public._notify_captain(v_team.id, 'member_left', v_name || ' left ' || v_team.name, null,
                                 '/teams/' || v_team.id || '/manage');
end;
$$;

create or replace function public.remove_member(p_team uuid, p_player uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  perform public._require_user();
  perform public._require_captain_or_admin(p_team);
  select * into v_team from teams where id = p_team;
  if v_team.captain_player_id = p_player then
    raise exception 'The captain can''t be removed. Hand the captaincy to someone else first.';
  end if;

  delete from team_members where team_id = p_team and player_id = p_player;
  if not found then
    raise exception 'That player is not on this team.';
  end if;

  perform public._notify_player(p_player, 'removed', 'You were removed from ' || v_team.name,
                                'You''re back in the Player Pool so other captains can find you.', '/me');
end;
$$;

create or replace function public.transfer_captaincy(p_team uuid, p_player uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  perform public._require_user();
  perform public._require_captain_or_admin(p_team);
  select * into v_team from teams where id = p_team for update;
  if not exists (select 1 from team_members where team_id = p_team and player_id = p_player) then
    raise exception 'The new captain must already be on the team.';
  end if;
  update team_members set role = 'player' where team_id = p_team and player_id = v_team.captain_player_id;
  update team_members set role = 'captain' where team_id = p_team and player_id = p_player;
  update teams set captain_player_id = p_player where id = p_team;
  perform public._notify_player(p_player, 'captaincy', 'You are now captain of ' || v_team.name, null,
                                '/teams/' || p_team || '/manage');
end;
$$;

create or replace function public.disband_team(p_team uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  perform public._require_user();
  perform public._require_captain_or_admin(p_team);
  select * into v_team from teams where id = p_team for update;
  if v_team.status not in ('forming', 'rejected', 'withdrawn') and not public.is_admin() then
    raise exception 'A submitted team can''t be disbanded by the captain. Please contact the organiser.';
  end if;
  perform public._notify_team(p_team, 'disbanded', v_team.name || ' has been disbanded',
                              'You''re back in the Player Pool.', '/me');
  delete from teams where id = p_team;
end;
$$;

-- Captain completes registration: the team leaves "forming" and enters the
-- organiser's queue. This does NOT confirm a slot.
create or replace function public.submit_team(p_team uuid)
returns public.team_status
language plpgsql security definer
set search_path = public
as $$
declare
  v_team   teams;
  v_s      event_settings;
  v_count  int;
  v_pay    payment_status;
  v_status team_status;
begin
  perform public._require_user();
  perform public._require_captain_or_admin(p_team);
  select * into v_team from teams where id = p_team for update;
  select * into v_s from event_settings where event_id = v_team.event_id;

  if v_team.status not in ('forming', 'rejected') then
    raise exception 'This team has already been submitted.';
  end if;
  if not v_s.registration_open and not public.is_admin() then
    raise exception 'Registration is closed.';
  end if;
  v_count := public.team_member_count(p_team);
  if v_count < v_s.min_roster then
    raise exception 'You need at least % players to submit (you have %).', v_s.min_roster, v_count;
  end if;
  if v_count > v_s.max_roster then
    raise exception 'Teams can have at most % players (you have %).', v_s.max_roster, v_count;
  end if;

  select status into v_pay from registration_payments where team_id = p_team;

  if not v_team.is_reserved and public.open_slots_used(v_team.event_id) >= v_s.open_slots then
    v_status := 'waitlist';
  elsif v_pay = 'unpaid' then
    v_status := 'payment_pending';
  else
    v_status := 'admin_review';
  end if;

  update teams set status = v_status, submitted_at = now() where id = p_team;

  perform public._notify_admins('team_submitted', v_team.name || ' submitted their registration',
                                v_count || ' players', '/admin/teams/' || p_team);
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organiser API
-- ---------------------------------------------------------------------------

create or replace function public.admin_confirm_team(p_team uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team  teams;
  v_s     event_settings;
  v_count int;
  v_pay   payment_status;
  v_used  int;
begin
  perform public._require_admin();
  select * into v_team from teams where id = p_team for update;
  if not found then
    raise exception 'Team not found.';
  end if;
  -- Serialise confirmations per event so two organisers can't both fill the last slot.
  select * into v_s from event_settings where event_id = v_team.event_id for update;

  if v_team.status = 'confirmed' then
    raise exception 'This team is already confirmed.';
  end if;
  if v_team.status = 'withdrawn' then
    raise exception 'This team has withdrawn. Reopen it first.';
  end if;
  if v_team.submitted_at is null then
    raise exception 'The captain has not submitted the team''s registration yet.';
  end if;
  v_count := public.team_member_count(p_team);
  if v_count < v_s.min_roster then
    raise exception 'Not eligible: % players, minimum is %.', v_count, v_s.min_roster;
  end if;
  if v_count > v_s.max_roster then
    raise exception 'Not eligible: % players, maximum is %.', v_count, v_s.max_roster;
  end if;
  select status into v_pay from registration_payments where team_id = p_team;
  if v_pay = 'unpaid' then
    raise exception 'The registration fee has not been marked as paid.';
  end if;

  if v_team.is_reserved then
    select count(*) into v_used from teams
      where event_id = v_team.event_id and status = 'confirmed' and is_reserved;
    if v_used >= v_s.reserved_slots then
      raise exception 'The reserved slot is already filled.';
    end if;
  else
    v_used := public.open_slots_used(v_team.event_id);
    if v_used >= v_s.open_slots then
      raise exception 'All % open slots are filled. Move this team to the waitlist instead.', v_s.open_slots;
    end if;
  end if;

  update teams set status = 'confirmed', confirmed_at = now(), roster_locked = true where id = p_team;
  perform public._notify_team(p_team, 'confirmed', '✅ ' || v_team.name || ' is CONFIRMED',
                              'Your team has secured a competition slot. See you on court!', '/teams/' || p_team);
end;
$$;

create or replace function public.admin_reject_team(p_team uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  perform public._require_admin();
  select * into v_team from teams where id = p_team for update;
  if not found then
    raise exception 'Team not found.';
  end if;
  update teams set status = 'rejected', confirmed_at = null, roster_locked = false where id = p_team;
  if nullif(trim(coalesce(p_reason, '')), '') is not null then
    insert into admin_notes (event_id, team_id, author_id, body)
    values (v_team.event_id, p_team, auth.uid(), 'Sent back: ' || trim(p_reason));
  end if;
  perform public._notify_captain(p_team, 'rejected', v_team.name || ' needs changes before approval',
                                 nullif(trim(coalesce(p_reason, '')), ''), '/teams/' || p_team || '/manage');
end;
$$;

create or replace function public.admin_waitlist_team(p_team uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  perform public._require_admin();
  select * into v_team from teams where id = p_team for update;
  if not found then
    raise exception 'Team not found.';
  end if;
  if v_team.status = 'withdrawn' then
    raise exception 'This team has withdrawn. Reopen it first.';
  end if;
  update teams set status = 'waitlist', confirmed_at = null, roster_locked = false,
                   submitted_at = coalesce(submitted_at, now())
  where id = p_team;
  perform public._notify_captain(p_team, 'waitlist', v_team.name || ' is on the waitlist',
                                 'If a confirmed team withdraws, the organiser can promote you.', '/teams/' || p_team);
end;
$$;

-- Move a waitlisted team back into the approval queue once a slot is free.
create or replace function public.admin_promote_team(p_team uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
  v_s    event_settings;
  v_pay  payment_status;
begin
  perform public._require_admin();
  select * into v_team from teams where id = p_team for update;
  if not found or v_team.status <> 'waitlist' then
    raise exception 'Only waitlisted teams can be promoted.';
  end if;
  select * into v_s from event_settings where event_id = v_team.event_id;
  if not v_team.is_reserved and public.open_slots_used(v_team.event_id) >= v_s.open_slots then
    raise exception 'There is no open slot to promote into yet.';
  end if;
  select status into v_pay from registration_payments where team_id = p_team;
  update teams set status = case when v_pay = 'unpaid' then 'payment_pending'::team_status else 'admin_review'::team_status end
  where id = p_team;
  perform public._notify_captain(p_team, 'promoted', v_team.name || ' moved off the waitlist',
                                 'A slot opened up — your team is back in organiser review.', '/teams/' || p_team);
end;
$$;

create or replace function public.admin_withdraw_team(p_team uuid, p_release_players boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  perform public._require_admin();
  select * into v_team from teams where id = p_team for update;
  if not found then
    raise exception 'Team not found.';
  end if;
  perform public._notify_team(p_team, 'withdrawn', v_team.name || ' has withdrawn from the competition', null, '/me');
  update teams set status = 'withdrawn', confirmed_at = null, roster_locked = false where id = p_team;
  if coalesce(p_release_players, false) then
    delete from team_members where team_id = p_team;
  end if;
end;
$$;

create or replace function public.admin_reopen_team(p_team uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update teams set status = 'forming', submitted_at = null, confirmed_at = null, roster_locked = false
  where id = p_team;
  if not found then
    raise exception 'Team not found.';
  end if;
end;
$$;

create or replace function public.admin_set_payment(p_team uuid, p_status public.payment_status, p_reference text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  perform public._require_admin();
  select * into v_team from teams where id = p_team for update;
  if not found then
    raise exception 'Team not found.';
  end if;

  update registration_payments set
    status    = p_status,
    reference = coalesce(nullif(trim(coalesce(p_reference, '')), ''), reference),
    paid_at   = case when p_status = 'paid' then now() else null end,
    marked_by = auth.uid()
  where team_id = p_team;

  if p_status in ('paid', 'waived', 'not_required') and v_team.status = 'payment_pending' then
    update teams set status = 'admin_review' where id = p_team;
  elsif p_status = 'unpaid' and v_team.status = 'admin_review' then
    update teams set status = 'payment_pending' where id = p_team;
  end if;

  if p_status = 'paid' then
    perform public._notify_captain(p_team, 'payment', 'Payment received for ' || v_team.name, null, '/teams/' || p_team);
  end if;
end;
$$;

create or replace function public.admin_set_roster_lock(p_team uuid, p_locked boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update teams set roster_locked = p_locked where id = p_team;
  if not found then
    raise exception 'Team not found.';
  end if;
end;
$$;

create or replace function public.admin_set_reserved(p_team uuid, p_reserved boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_team teams;
  v_s    event_settings;
begin
  perform public._require_admin();
  select * into v_team from teams where id = p_team for update;
  if not found then
    raise exception 'Team not found.';
  end if;
  select * into v_s from event_settings where event_id = v_team.event_id for update;
  if p_reserved and (select count(*) from teams where event_id = v_team.event_id and is_reserved and id <> p_team and status <> 'withdrawn') >= v_s.reserved_slots then
    raise exception 'All % reserved slot(s) are already assigned.', v_s.reserved_slots;
  end if;
  if not p_reserved and v_team.status = 'confirmed'
     and public.open_slots_used(v_team.event_id) >= v_s.open_slots then
    raise exception 'Unreserving would push this confirmed team into an open slot, but none are free.';
  end if;
  update teams set is_reserved = p_reserved where id = p_team;
end;
$$;

-- Move a player to another team, or out to the Player Pool (p_to_team null).
create or replace function public.admin_transfer_player(p_player uuid, p_to_team uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_from teams;
  v_to   teams;
begin
  perform public._require_admin();
  select t.* into v_from from team_members m join teams t on t.id = m.team_id where m.player_id = p_player;
  if found and v_from.captain_player_id = p_player then
    raise exception 'This player captains %. Hand the captaincy to someone else first.', v_from.name;
  end if;
  if p_to_team is not null and v_from.id = p_to_team then
    raise exception 'The player is already on that team.';
  end if;

  delete from team_members where player_id = p_player;

  if p_to_team is not null then
    select * into v_to from teams where id = p_to_team;
    insert into team_members (team_id, player_id, role, added_by) values (p_to_team, p_player, 'player', auth.uid());
    perform public._notify_player(p_player, 'transferred', 'The organiser moved you to ' || v_to.name, null, '/teams/' || p_to_team);
  else
    perform public._notify_player(p_player, 'transferred', 'The organiser moved you to the Player Pool', null, '/me');
  end if;
end;
$$;

create or replace function public.admin_add_note(p_event uuid, p_team uuid, p_player uuid, p_body text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._require_admin();
  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'Note is empty.';
  end if;
  insert into admin_notes (event_id, team_id, player_id, author_id, body)
  values (p_event, p_team, p_player, auth.uid(), trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_delete_note(p_note uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  delete from admin_notes where id = p_note;
end;
$$;

create or replace function public.admin_update_settings(
  p_event                uuid,
  p_open_slots           int,
  p_reserved_slots       int,
  p_other_slots          int,
  p_min_roster           int,
  p_max_roster           int,
  p_registration_open    boolean,
  p_fee_cents            int,
  p_payment_instructions text,
  p_require_gender       boolean
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_min_roster < 1 or p_max_roster < p_min_roster then
    raise exception 'Maximum roster must be at least the minimum roster.';
  end if;
  if p_open_slots < 0 or p_reserved_slots < 0 or p_other_slots < 0 or p_fee_cents < 0 then
    raise exception 'Numbers can''t be negative.';
  end if;

  update event_settings set
    open_slots           = p_open_slots,
    reserved_slots       = p_reserved_slots,
    other_slots          = p_other_slots,
    min_roster           = p_min_roster,
    max_roster           = p_max_roster,
    registration_open    = p_registration_open,
    fee_cents            = p_fee_cents,
    payment_instructions = nullif(trim(coalesce(p_payment_instructions, '')), ''),
    require_gender       = p_require_gender
  where event_id = p_event;
  if not found then
    raise exception 'Event not found.';
  end if;

  -- Keep outstanding fees in step with the configured fee.
  update registration_payments rp set
    amount_cents = p_fee_cents,
    status = case
      when p_fee_cents = 0 and rp.status = 'unpaid' then 'not_required'::payment_status
      when p_fee_cents > 0 and rp.status = 'not_required' then 'unpaid'::payment_status
      else rp.status end
  from teams t
  where t.id = rp.team_id and t.event_id = p_event and rp.status in ('unpaid', 'not_required');
end;
$$;

create or replace function public.admin_update_event(
  p_event        uuid,
  p_name         text,
  p_event_date   date,
  p_start_time   time,
  p_end_time     time,
  p_venue        text,
  p_format_label text,
  p_tagline      text
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update events set
    name         = trim(p_name),
    event_date   = p_event_date,
    start_time   = p_start_time,
    end_time     = p_end_time,
    venue        = nullif(trim(coalesce(p_venue, '')), ''),
    format_label = nullif(trim(coalesce(p_format_label, '')), ''),
    tagline      = nullif(trim(coalesce(p_tagline, '')), '')
  where id = p_event;
end;
$$;

create or replace function public.admin_set_role(p_email text, p_role public.user_role)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_role = 'player' and lower(p_email) = lower((select email from profiles where id = auth.uid())) then
    raise exception 'You can''t remove your own organiser access.';
  end if;
  update profiles set role = p_role where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'No account with that email has signed in yet. Ask them to sign in once first.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications API
-- ---------------------------------------------------------------------------

create or replace function public.mark_notifications_read()
returns void
language sql security definer
set search_path = public
as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

-- Supabase grants EXECUTE to PUBLIC by default; start from nothing.
revoke execute on all functions in schema public from public, anon, authenticated;

-- RLS helpers (evaluated for every role) and read-only lookups.
grant execute on function
  public.is_admin(), public.my_player_id(uuid), public.is_captain(uuid), public.is_team_member(uuid),
  public.can_view_player_private(uuid), public.team_member_count(uuid), public.open_slots_used(uuid),
  public.team_for_invite_code(text)
to anon, authenticated;

-- Signed-in API.
grant execute on function
  public.register_player(uuid, text, text, text, text, text, int, text, text, text, boolean, boolean, boolean, text),
  public.set_looking_for_team(uuid, boolean),
  public.create_team(uuid, text, text, text, boolean, int, jsonb),
  public.update_team(uuid, text, text, text, boolean, boolean, jsonb),
  public.request_to_join(uuid, text),
  public.cancel_join_request(uuid),
  public.respond_join_request(uuid, boolean),
  public.invite_player(uuid, uuid, text),
  public.cancel_invitation(uuid),
  public.respond_invitation(uuid, boolean),
  public.join_with_invite_code(text),
  public.regenerate_invite_code(uuid),
  public.leave_team(uuid),
  public.remove_member(uuid, uuid),
  public.transfer_captaincy(uuid, uuid),
  public.disband_team(uuid),
  public.submit_team(uuid),
  public.admin_confirm_team(uuid),
  public.admin_reject_team(uuid, text),
  public.admin_waitlist_team(uuid),
  public.admin_promote_team(uuid),
  public.admin_withdraw_team(uuid, boolean),
  public.admin_reopen_team(uuid),
  public.admin_set_payment(uuid, public.payment_status, text),
  public.admin_set_roster_lock(uuid, boolean),
  public.admin_set_reserved(uuid, boolean),
  public.admin_transfer_player(uuid, uuid),
  public.admin_add_note(uuid, uuid, uuid, text),
  public.admin_delete_note(uuid),
  public.admin_update_settings(uuid, int, int, int, int, int, boolean, int, text, boolean),
  public.admin_update_event(uuid, text, date, time, time, text, text, text),
  public.admin_set_role(text, public.user_role),
  public.mark_notifications_read()
to authenticated;
