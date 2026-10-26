import Link from "next/link";
import { needsLines } from "@/lib/format";
import {
  canRequestToJoin,
  currentStage,
  isWaitlistTeam,
  STAGES,
  teamStatusLabel,
  type SlotSummary,
} from "@/lib/status";
import type { DirectoryPlayer, EventSettings, Position, TeamOverview } from "@/lib/types";
import { Badge, buttonClass, cx } from "./ui";

export function TeamStatusBadge({ team, settings }: { team: TeamOverview; settings: EventSettings }) {
  const s = teamStatusLabel(team, settings);
  return (
    <Badge tone={s.tone}>
      {team.status === "confirmed" && "✅ "}
      {s.label}
    </Badge>
  );
}

export function RosterMeter({ count, settings, big }: { count: number; settings: EventSettings; big?: boolean }) {
  const pct = Math.min(100, (count / settings.max_roster) * 100);
  const minPct = (settings.min_roster / settings.max_roster) * 100;
  const reached = count >= settings.min_roster;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={cx("font-display font-extrabold text-navy-900", big ? "text-4xl" : "text-2xl")}>
          {count}
          <span className="text-muted"> / {settings.max_roster}</span>
        </span>
        <span className={cx("text-xs font-semibold", reached ? "text-emerald-700" : "text-muted")}>
          {reached ? "Minimum reached" : `${settings.min_roster - count} more to reach ${settings.min_roster}`}
        </span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded-full bg-navy-50" aria-hidden>
        <div
          className={cx("h-full rounded-full transition-all", reached ? "bg-emerald-500" : "bg-gold-500")}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute -top-1 h-4.5 w-0.5 bg-navy-900" style={{ left: `${minPct}%` }} title="Minimum" />
      </div>
    </div>
  );
}

export function NeedsChips({ needs, positions, empty }: { needs: Record<string, number>; positions: Position[]; empty?: string }) {
  const lines = needsLines(needs, positions);
  if (lines.length === 0) return empty ? <p className="text-sm text-muted">{empty}</p> : null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {lines.map((l) => (
        <li key={l} className="rounded-lg bg-navy-50 px-2.5 py-1 text-sm font-semibold text-navy-800">
          {l}
        </li>
      ))}
    </ul>
  );
}

export function TeamCard({
  team,
  settings,
  positions,
  slots,
  viewerTeamId,
}: {
  team: TeamOverview;
  settings: EventSettings;
  positions: Position[];
  slots: SlotSummary;
  viewerTeamId?: string | null;
}) {
  const join = canRequestToJoin(team, settings);
  const isMine = viewerTeamId === team.id;
  const waitlist = isWaitlistTeam(team, slots) && team.status !== "waitlist";
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-white shadow-sm">
      <Link href={`/teams/${team.id}`} className="block p-4 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <TeamStatusBadge team={team} settings={settings} />
          {team.is_reserved && <Badge tone="navy">🏆 Reserved slot</Badge>}
          {waitlist && <Badge tone="amber">Waitlist</Badge>}
          {isMine && <Badge tone="gold">Your team</Badge>}
        </div>
        <h3 className="mt-2 font-display text-2xl font-extrabold uppercase leading-tight text-navy-900">{team.name}</h3>
        <p className="text-sm text-muted">
          Captain {team.captain_name} · {team.approx_batch ? `Batch ${team.approx_batch}` : `Class of ${team.captain_grad_year}`}
          {team.mixed_batch && " · Mixed batches welcome"}
        </p>
        <div className="mt-3">
          <RosterMeter count={team.member_count} settings={settings} />
        </div>
        {team.status !== "confirmed" && Object.keys(team.needs).length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Looking for</p>
            <NeedsChips needs={team.needs} positions={positions} />
          </div>
        )}
      </Link>
      <div className="mt-auto border-t border-line p-3">
        {isMine ? (
          <Link href={`/teams/${team.id}`} className={buttonClass("outline", "md", true)}>
            Open team room
          </Link>
        ) : join.ok ? (
          <Link href={`/teams/${team.id}#join`} className={buttonClass("primary", "md", true)}>
            Join Team
          </Link>
        ) : (
          <button type="button" disabled className={buttonClass("primary", "md", true)}>
            {join.reason}
          </button>
        )}
      </div>
    </article>
  );
}

export function StageTracker({ team, settings }: { team: TeamOverview; settings: EventSettings }) {
  const current = currentStage(team, settings);
  const feeSkipped = settings.fee_cents === 0;
  return (
    <ol className="grid gap-2">
      {STAGES.map((label, i) => {
        const done = i < current || (i === 5 && current === 5);
        const active = i === current && current !== 5;
        const text = i === 1 ? `Minimum ${settings.min_roster} Players Reached` : label;
        const skipped = i === 3 && feeSkipped;
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={cx(
                "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                done && "bg-emerald-500 text-white",
                active && "bg-gold-500 text-navy-950 ring-4 ring-gold-100",
                !done && !active && "bg-navy-50 text-muted"
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={cx("text-sm", active ? "font-bold text-navy-900" : done ? "text-navy-900" : "text-muted")}>
              {text}
              {skipped && <span className="text-muted"> — no fee this year</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function PlayerCard({
  player,
  label,
  children,
  highlight,
}: {
  player: DirectoryPlayer;
  label: (code: string | null) => string;
  children?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <article className={cx("flex flex-col rounded-2xl border bg-white p-4 shadow-sm", highlight ? "border-gold-500 ring-2 ring-gold-100" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold leading-tight text-navy-900">{player.display_name}</h3>
          <p className="text-sm font-semibold text-court-500">Class of {player.grad_year}</p>
        </div>
        {player.is_free_agent ? (
          <Badge tone="amber">Looking for Team</Badge>
        ) : (
          <Badge tone="green">In a team</Badge>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Primary</dt>
        <dd className="font-semibold text-navy-900">{label(player.primary_position)}</dd>
        <dt className="text-muted">Secondary</dt>
        <dd className="font-semibold text-navy-900">{label(player.secondary_position) || "—"}</dd>
        {player.experience && (
          <>
            <dt className="text-muted">Level</dt>
            <dd className="text-navy-900">{player.experience}</dd>
          </>
        )}
      </dl>
      {player.note && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm italic text-navy-800">“{player.note}”</p>}
      {!player.open_to_mixed && <p className="mt-2 text-xs text-muted">Prefers own batch</p>}
      {children && <div className="mt-3">{children}</div>}
    </article>
  );
}
