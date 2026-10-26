# Xinmin Alumni Volleyball Team Lobby — Design

This document is the plan the app was built from: architecture, schema, user
flows, page structure, permissions and phased implementation.

## 1. Recommended architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | **Next.js (App Router) + TypeScript** | Server Components render pages with data already in them — fast on phones opened from WhatsApp links. Server Actions handle every button without a separate API. |
| Styling | **Tailwind CSS v4** | Mobile-first utility classes, colour tokens in one place (`globals.css`). |
| Data + auth | **Supabase** (Postgres, Row Level Security, Auth) | One managed service for DB, Google sign-in and email magic links. |
| Business rules | **Postgres functions (RPC)** | Every rule that must never break — one team per player, max 12, min 10 to qualify, slot allocation — runs inside the database in a single transaction, with the team row locked. Two captains accepting the same player at the same second cannot both succeed. The UI cannot bypass them. |
| Hosting | Vercel (or any Node host) + Supabase cloud | No servers to maintain. |

```
Phone browser ──▶ Next.js (Vercel)
                    │  Server Components: read via Supabase (user's JWT, RLS applies)
                    │  Server Actions:    call RPC functions (rules enforced in Postgres)
                    ▼
                 Supabase ── Auth (Google, magic link)
                          └─ Postgres: tables + RLS + SECURITY DEFINER functions + triggers
```

Key principle: **the browser never writes tables directly.** All mutations go
through named database functions (`create_team`, `request_to_join`,
`respond_join_request`, `admin_confirm_team`, …). Tables only grant `SELECT`
(filtered by RLS) to signed-in users and the public.

## 2. Database schema

All tables carry `created_at` / `updated_at` (maintained by a trigger) where
rows change over time.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `profiles` *(the "users" table)* | One row per auth user | `id` → `auth.users`, `email`, `role` (`player` \| `admin`) |
| `events` | An event (this year's friendly; future events) | `slug`, `name`, `sport`, `event_date`, `start_time`, `end_time`, `venue`, `format_label`, `is_active` |
| `event_settings` | Configurable rules per event (1:1) | `total_teams`, `open_slots`, `reserved_slots`, `min_roster`, `max_roster`, `registration_open`, `fee_cents`, `require_gender`, `school_team_name` |
| `positions` | Position catalogue per sport + squad guidance | `code`, `sport`, `label`, `short_label`, `guide_min`, `guide_max` |
| `players` | Public player profile, one per user per event | `event_id`, `user_id`, `display_name` (first name), `grad_year`, `primary_position`, `secondary_position`, `experience`, `has_team`, `open_to_mixed`, `looking_for_team`, `note` |
| `player_private` | Contact details — never public | `player_id`, `full_name`, `mobile`, `email`, `gender` |
| `teams` | Team rooms | `event_id`, `name`, `captain_player_id`, `description`, `approx_batch`, `mixed_batch`, `declared_existing_players`, `recruiting`, `status`, `roster_locked`, `is_reserved`, `submitted_at`, `confirmed_at` |
| `team_secrets` | Invite-link code (captain/admin only) | `team_id`, `invite_code` |
| `team_position_needs` | "Looking for 1 Setter, 2 Flexible" | `team_id`, `position`, `count` |
| `team_members` | Roster | `team_id`, `player_id` **UNIQUE** (one team per player), `role` |
| `join_requests` | Player → team | `team_id`, `player_id`, `message`, `status` (pending/accepted/rejected/cancelled/withdrawn) |
| `team_invitations` | Team → player | `team_id`, `player_id`, `invited_by`, `message`, `status` |
| `registration_payments` | Fee per team | `team_id`, `amount_cents`, `status` (unpaid/paid/waived), `paid_at`, `reference` |
| `admin_notes` | Private organiser notes on a team or player | `team_id`, `player_id`, `author_id`, `body` |
| `notifications` | In-app notifications | `user_id`, `kind`, `title`, `body`, `link`, `read_at` |

Team `status` values: `forming`, `payment_pending`, `admin_review`,
`confirmed`, `waitlist`, `rejected`, `withdrawn`.

The six confirmation stages shown to users are derived from these:

1. Forming Team — `forming`, fewer than `min_roster`
2. Minimum 10 Players Reached — `forming`, at least `min_roster`
3. Registration Submitted — `submitted_at` set
4. Payment Pending — `payment_pending`
5. Admin Review — `admin_review`
6. Confirmed — `confirmed` (✅ TEAM CONFIRMED)

Database-enforced invariants:

- `team_members.player_id` is unique, so **a player can only be in one team**.
- A trigger on `team_members` locks the team row and rejects the insert if the
  roster is at `max_roster` (**never more than 12**), the roster is locked, or
  registration is closed (organisers are exempt from the last two).
- Submitting or confirming a team requires `min_roster` ≤ members ≤
  `max_roster` (**not eligible with fewer than 10**).
- Confirming a non-reserved team requires a free open slot: confirmed
  non-reserved teams < `open_slots`. Otherwise the team goes to the waitlist.
- Joining a team cancels the player's other pending requests and invitations.
  The Player Pool is derived (players with no `team_members` row), so joining
  removes them from it automatically.
- One pending request/invitation per (team, player) via partial unique indexes.

## 3. User flows

**I don't have a team (Player Pool)**
Home → "I Don't Have a Team" → sign in (Google or email link) → registration
form (short, one screen) → appears in the Player Pool → receives invitations
on "My Lobby" → Accept → joins roster, leaves the pool.

**Join a team**
Home → "Join a Team" → team list (filter by position needed) → team room →
"Request to Join" (+ optional message) → captain sees request → Accept/Reject
→ player notified; on accept the roster count updates and the player's other
requests close.

**Create a team**
Home → "Create a Team" → sign in → player profile (if new) → team form (name,
batch, mixed batch, existing players, positions needed, description) → the
"does not secure a slot" notice is shown on the form and the team room →
captain gets a team room plus a WhatsApp-shareable invite link.

**Captain recruiting**
Manage Team → see requests (accept/reject) → browse Player Pool filtered to
the positions still needed → Invite → player accepts → roster updates →
update "Looking for" → at 10+ players "Submit for Approval".

**Organiser**
Admin dashboard (counts + quick filters) → team view: mark paid, approve &
confirm (uses a slot), waitlist, reject, lock/unlock roster, remove/transfer
players, private notes → players view: search by name/year/position/team →
settings: slots, roster sizes, fee, registration open/closed → export CSV.

**Withdrawal + promotion**
Organiser withdraws a confirmed team → slot frees → "Promote" the next
waitlisted team (oldest submission first) → it goes back to Admin Review →
confirm.

## 4. Page structure

| Route | Who | Content |
| --- | --- | --- |
| `/` | Everyone | **Find Your Team**: event facts, slots remaining, "No team? No problem.", three actions, team list, rules, squad guide |
| `/teams` | Everyone | All team rooms as cards, filter by position needed |
| `/teams/new` | Signed-in player | Create team form |
| `/teams/[id]` | Everyone | Team room: status, stage tracker, count, needs, roster, join button |
| `/teams/[id]/manage` | Captain / admin | Requests, invite from pool, invite link, needs, roster removal, submit |
| `/join/[code]` | Signed-in player | Accept a captain's invite link |
| `/pool` | Everyone (invite buttons for captains) | Player Pool cards, filter by position / year |
| `/register` | Signed-in | Player registration / edit profile |
| `/me` | Signed-in | My Lobby: my team, invitations, requests, notifications, leave team |
| `/rules` | Everyone | Registration rules + suggested squad structure |
| `/login`, `/auth/callback` | Everyone | Google / magic-link sign-in |
| `/admin` | Admin | Dashboard stats, quick filters, analytics |
| `/admin/teams`, `/admin/teams/[id]` | Admin | Team list + full team view with actions |
| `/admin/players` | Admin | Search/filter players, transfer, contacts |
| `/admin/settings` | Admin | Event settings |
| `/admin/export` | Admin | CSV download of all rosters |

## 5. Permissions model

| Data | Public (signed out) | Player | Captain (own team) | Admin |
| --- | --- | --- | --- | --- |
| Event + settings | read | read | read | read/write |
| `players` (first name, year, positions, note) | read | read; edit own | read | read/write |
| `player_private` (full name, mobile, email, gender) | — | own only | members of their team + players with a pending request/invitation with their team | all |
| Teams, rosters, needs | read | read | edit own team via RPC | all |
| `team_secrets` (invite code) | — | — | own team | all |
| Join requests / invitations | — | own | their team's | all |
| Payments | — | — | own team | read/write |
| Admin notes | — | — | — | read/write |
| Notifications | — | own | own | own |

Implementation: RLS policies for reads; `REVOKE INSERT/UPDATE/DELETE` from
`anon`/`authenticated` on all tables; mutations only through `SECURITY
DEFINER` functions that check `auth.uid()`, `is_admin()` and
`is_captain(team)`. Admins are set with `role = 'admin'` on `profiles` (see
README for the one-line bootstrap SQL).

## 6. Implementation plan

- **Phase 1** — schema, auth (Google + magic link), player registration, team
  creation, team list, team room, Player Pool.
- **Phase 2** — join requests, captain approvals, invitations (pool invite +
  invite link), position matching (pool filtered/sorted by a team's needs).
- **Phase 3** — admin dashboard, team approval, payment tracking, slot
  allocation, waitlist + promotion, roster lock, transfers, notes, settings.
- **Phase 4** — mobile polish, in-app notifications (bell + My Lobby), CSV
  export, WhatsApp share links, admin analytics (positions, batches, funnel).

Testing: `supabase/tests/*.sql` run against a real Postgres and assert every
invariant above; unit tests cover the status/stage derivation.
