import type { Metadata } from "next";
import Link from "next/link";
import { invitePlayer } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PlayerCard } from "@/components/team-bits";
import { Badge, cx, Empty, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { getPool, getTeam, getTeamInvitations, getViewer } from "@/lib/data";
import { positionLabeler } from "@/lib/format";
import { requireEvent } from "@/lib/guards";
import { matchScore } from "@/lib/status";

export const metadata: Metadata = { title: "Player Pool" };

export default async function PoolPage({ searchParams }: PageProps<"/pool">) {
  const sp = await searchParams;
  const pos = typeof sp.pos === "string" ? sp.pos : "";
  const year = typeof sp.year === "string" ? parseInt(sp.year, 10) : NaN;
  const { event, settings, positions } = await requireEvent();
  const [pool, viewer] = await Promise.all([getPool(event.id), getViewer()]);
  const label = positionLabeler(positions);

  // Captains (and organisers managing a team via ?team=) get invite buttons.
  const myTeamId =
    viewer?.membership?.role === "captain"
      ? viewer.membership.team_id
      : viewer?.isAdmin && typeof sp.team === "string"
        ? sp.team
        : null;
  const myTeam = myTeamId ? await getTeam(myTeamId) : null;
  const invited = myTeam ? new Set((await getTeamInvitations(myTeam.id, "pending")).map((i) => i.player_id)) : new Set<string>();
  const canInvite =
    !!myTeam && !myTeam.roster_locked && myTeam.member_count < settings.max_roster && settings.registration_open;

  let players = pool.filter(
    (p) => (!pos || p.primary_position === pos || p.secondary_position === pos) && (Number.isNaN(year) || p.grad_year === year)
  );
  if (myTeam) players = [...players].sort((a, b) => matchScore(myTeam.needs, b) - matchScore(myTeam.needs, a));
  const years = [...new Set(pool.map((p) => p.grad_year))].sort((a, b) => a - b);
  const qs = (next: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { pos, year: Number.isNaN(year) ? "" : String(year), team: typeof sp.team === "string" ? sp.team : "", ...next };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/pool?${s}` : "/pool";
  };

  return (
    <div className="space-y-5">
      <PageTitle eyebrow={event.name} title="Player Pool">
        Alumni who want to play but don’t have a team yet. {pool.length} player{pool.length === 1 ? "" : "s"} looking.
      </PageTitle>

      {!viewer?.player && (
        <div className="rounded-2xl bg-gold-500 p-4 text-navy-950">
          <p className="font-display text-xl font-extrabold uppercase">No team? Join the pool.</p>
          <p className="mb-3 text-sm">Captains browse this list and invite players directly.</p>
          <LinkButton href="/register" variant="primary" full>
            Register as a player
          </LinkButton>
        </div>
      )}

      {myTeam && (
        <p className="rounded-xl bg-navy-50 px-3 py-2 text-sm text-navy-900">
          Inviting for <strong>{myTeam.name}</strong> ({myTeam.member_count}/{settings.max_roster}). Players matching your
          needed positions are listed first.
        </p>
      )}

      <div className="space-y-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip href={qs({ pos: "" })} active={!pos}>
            All positions
          </Chip>
          {positions.map((p) => (
            <Chip key={p.code} href={qs({ pos: p.code })} active={pos === p.code}>
              {p.label}
            </Chip>
          ))}
        </div>
        <form action="/pool" className="flex gap-2">
          {pos && <input type="hidden" name="pos" value={pos} />}
          {typeof sp.team === "string" && <input type="hidden" name="team" value={sp.team} />}
          <select name="year" defaultValue={Number.isNaN(year) ? "" : String(year)} className={cx(inputClass, "flex-1")} aria-label="Graduating year">
            <option value="">Any graduating year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                Class of {y}
              </option>
            ))}
          </select>
          <button className="min-h-12 rounded-xl bg-navy-900 px-4 font-semibold text-white">Filter</button>
        </form>
      </div>

      {players.length === 0 ? (
        <Empty title="No players match">Try another position or year.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => {
            const score = myTeam ? matchScore(myTeam.needs, p) : 0;
            return (
              <PlayerCard key={p.id} player={p} label={label} highlight={score >= 2}>
                {myTeam &&
                  (invited.has(p.id) ? (
                    <Badge tone="blue">Invited — waiting for reply</Badge>
                  ) : canInvite ? (
                    <ActionForm action={invitePlayer}>
                      <input type="hidden" name="team_id" value={myTeam.id} />
                      <input type="hidden" name="player_id" value={p.id} />
                      <SubmitButton full pendingText="Inviting…">
                        Invite to {myTeam.name}
                      </SubmitButton>
                    </ActionForm>
                  ) : null)}
              </PlayerCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        "shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap",
        active ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-navy-900"
      )}
    >
      {children}
    </Link>
  );
}
