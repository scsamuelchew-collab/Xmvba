# Xinmin Alumni Volleyball Team Lobby

A mobile-first web app for the **Xinmin Alumni Volleyball Friendly 2026**
(21 November 2026, 9:00am–2:00pm, 4-way round robin). Alumni can create a
team, join one, or enter the **Player Pool**, so nobody misses out just
because their own batch can't field ten players.

- **Players**: register (name, year, positions…), join the Player Pool,
  request to join teams, accept captain invitations, leave before lock.
- **Captains**: create a team room, share a WhatsApp invite link, accept or
  reject requests, invite pool players (matched to the positions they need),
  manage the roster and submit for approval.
- **Organisers**: dashboard, approve/confirm teams into slots, waitlist and
  promotion, payments, roster lock, transfers, private notes, settings, CSV
  export.

The design document — architecture, schema, flows, pages, permissions and
build phases — is in [`docs/DESIGN.md`](docs/DESIGN.md).

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS v4 ·
Supabase (Postgres + Row Level Security + Auth).

Every rule that matters lives in the database (`supabase/migrations`), not the
UI: one team per player, maximum 12, minimum 10 to submit/confirm, slot
allocation, the waitlist, and who can see contact details.

## Set up

1. **Create a Supabase project.**
2. **Apply the migrations** (`supabase/migrations/*.sql`, in order) — with the
   Supabase CLI (`supabase link` then `supabase db push`) or by pasting them
   into the SQL editor. The second migration creates the 2026 event.
3. **Auth** → Providers: enable **Email** (magic link) and **Google**.
   URL configuration: set the Site URL to your deployed URL and add
   `https://<your-domain>/auth/callback` (and
   `http://localhost:3000/auth/callback` for local dev) to Redirect URLs.
4. **Environment**: copy `.env.example` to `.env.local` and fill in the
   project URL, the anon/publishable key and your site URL.
5. `npm install` then `npm run dev`.

### Make yourself an organiser

Sign in once, then run in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

After that you can add co-organisers from **Organiser → Settings**.

### Deploy

Deploy this folder to Vercel (set the project root to `xinmin-volleyball`)
with the three `NEXT_PUBLIC_*` environment variables.

## Future events

Nothing is hard-coded to 2026. Slots, reserved slots, roster sizes, the fee,
gender question, registration open/closed, date, time and format are all
editable under **Organiser → Settings**. For a new event (or another sport),
insert a row into `events` + `event_settings` (and `positions` for a new
sport) and mark it `is_active`.

## Tests

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript |
| `npm run test:unit` | Status / stage / waitlist / matching logic |
| `npm run test:db` | Applies the migrations to a scratch database and asserts every rule and privacy policy (needs `psql` and a local Postgres via `PG*` env vars) |
| `npm run test:e2e` | Builds the app and drives it in a phone-sized Chromium against the real migrations, through a small test-only stand-in for the Supabase API (`tests/e2e/fake-supabase.mjs`). Screenshots go to `tests/.artifacts/`. |

CI runs all four (`.github/workflows/xinmin-volleyball.yml`).
