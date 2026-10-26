import type { Metadata } from "next";
import Link from "next/link";
import { TeamStatusBadge } from "@/components/team-bits";
import { Card, cx, Empty, LinkButton, PageTitle, SectionTitle, Stat } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { requireAdmin, requireEvent } from "@/lib/guards";
import { isWaitlistTeam, slotSummary } from "@/lib/status";
import { feesOutstanding, loadOverview, TEAM_FILTERS } from "./admin-data";

export const metadata: Metadata = { title: "Organiser dashboard" };

export default async function AdminDashboard() {
  await requireAdmin();
  const { event, settings, positions } = await requireEvent();
  const { teams, players, payments } = await loadOverview(event.id);
  const slots = slotSummary(settings, teams);
  const active = teams.filter((t) => t.status !== "withdrawn");
  const free = players.filter((p) => p.is_free_agent);
  const unpaid = feesOutstanding(teams, payments);
  const queue = teams.filter((t) => t.status === "admin_review" || t.status === "payment_pending");

  // Supply vs demand per position: who's free vs what teams say they need.
  const supply = positions.map((p) => {
    const freePrimary = free.filter((x) => x.primary_position === p.code).length;
    const freeAny = free.filter((x) => x.primary_position === p.code || x.secondary_position === p.code).length;
    const needed = active.filter((t) => t.status !== "confirmed").reduce((n, t) => n + (t.needs[p.code] ?? 0), 0);
    const all = players.filter((x) => x.primary_position === p.code).length;
    return { p, freePrimary, freeAny, needed, all };
  });
  const byYear = new Map<number, number>();
  for (const p of players) byYear.set(p.grad_year, (byYear.get(p.grad_year) ?? 0) + 1);
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  const maxYear = Math.max(1, ...years.map(([, n]) => n));
  const mixedTeams = active.filter((t) => {
    const ys = new Set(players.filter((p) => p.team_id === t.id).map((p) => p.grad_year));
    return ys.size > 1;
  }).length;

  return (
    <div className="space-y-6">
      <PageTitle eyebrow={event.name} title="Organiser Dashboard">
        {settings.registration_open ? "Registration is open." : "Registration is closed."}{" "}
        <Link href="/admin/settings" className="font-semibold text-navy-700 underline">
          Settings
        </Link>
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open slots left" value={`${slots.remaining}/${slots.open}`} tone={slots.full ? "navy" : "gold"} href="/admin/teams?filter=confirmed" />
        <Stat label="Registered players" value={players.length} href="/admin/players" />
        <Stat label="Players without team" value={free.length} href="/admin/players?filter=free" />
        <Stat label="Active teams" value={active.length} href="/admin/teams" />
        <Stat label={`Teams with ${settings.min_roster}+`} value={active.filter((t) => t.member_count >= settings.min_roster).length} href="/admin/teams" />
        <Stat label="Confirmed teams" value={teams.filter((t) => t.status === "confirmed").length} href="/admin/teams?filter=confirmed" />
        <Stat label="Waitlist teams" value={teams.filter((t) => isWaitlistTeam(t, slots)).length} href="/admin/teams?filter=waitlist" />
        <Stat
          label="Fees outstanding"
          value={settings.fee_cents > 0 ? `${unpaid.length} · ${formatMoney(unpaid.length * settings.fee_cents)}` : "No fee"}
          href="/admin/teams?filter=pending"
        />
      </div>

      <section>
        <SectionTitle>Quick filters</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/admin/players" variant="outline" size="sm">
            All Players
          </LinkButton>
          <LinkButton href="/admin/players?filter=free" variant="outline" size="sm">
            Player Pool
          </LinkButton>
          {TEAM_FILTERS.filter((f) => f.key !== "withdrawn").map((f) => (
            <LinkButton key={f.key} href={f.key === "all" ? "/admin/teams" : `/admin/teams?filter=${f.key}`} variant="outline" size="sm">
              {f.label}
            </LinkButton>
          ))}
          <a href="/admin/export" className="inline-flex min-h-10 items-center rounded-xl bg-navy-900 px-3 text-sm font-semibold text-white">
            ⬇ Export rosters (CSV)
          </a>
        </div>
      </section>

      <section>
        <SectionTitle>Needs your attention ({queue.length})</SectionTitle>
        {queue.length === 0 ? (
          <Empty title="Nothing waiting">Submitted teams appear here for payment and approval.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {queue.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/teams/${t.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 hover:border-navy-700">
                  <div className="flex-1">
                    <p className="font-bold text-navy-900">{t.name}</p>
                    <p className="text-sm text-muted">
                      {t.member_count} players · captain {t.captain_name}
                    </p>
                  </div>
                  <TeamStatusBadge team={t} settings={settings} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle>Positions: free agents vs. needed</SectionTitle>
          <Card>
            <ul className="space-y-3">
              {supply.map(({ p, freePrimary, freeAny, needed, all }) => (
                <li key={p.code}>
                  <div className="flex items-baseline justify-between text-sm">
                    <Link href={`/admin/players?pos=${p.code}`} className="font-semibold text-navy-900 underline-offset-2 hover:underline">
                      {p.label}
                    </Link>
                    <span className="text-muted">
                      <strong className={cx(needed > freeAny ? "text-red-700" : "text-emerald-700")}>{freeAny} free</strong> ·{" "}
                      {needed} needed · {all} total
                    </span>
                  </div>
                  <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-navy-50">
                    <div className="bg-navy-900" style={{ width: `${Math.min(100, (freePrimary / Math.max(1, needed, freeAny)) * 100)}%` }} />
                    <div className="bg-navy-700/40" style={{ width: `${Math.min(100, ((freeAny - freePrimary) / Math.max(1, needed, freeAny)) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Dark = free agents with it as primary, light = as secondary. Red means teams need more than the pool has.</p>
          </Card>
        </section>

        <section>
          <SectionTitle>Players by graduating year</SectionTitle>
          <Card>
            {years.length === 0 ? (
              <p className="text-sm text-muted">No players yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {years.map(([y, n]) => (
                  <li key={y}>
                    <Link href={`/admin/players?year=${y}`} className="flex items-center gap-2 text-sm">
                      <span className="w-12 font-semibold text-navy-900">{y}</span>
                      <span className="h-5 rounded bg-gold-500" style={{ width: `${(n / maxYear) * 70}%` }} />
                      <span className="text-muted">{n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              {mixedTeams} of {active.length} active teams mix graduating batches.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
