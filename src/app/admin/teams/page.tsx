import type { Metadata } from "next";
import Link from "next/link";
import { RosterMeter, TeamStatusBadge } from "@/components/team-bits";
import { Badge, cx, Empty, PageTitle } from "@/components/ui";
import { formatAgo } from "@/lib/format";
import { requireAdmin, requireEvent } from "@/lib/guards";
import { filterTeams, loadOverview, TEAM_FILTERS, type TeamFilter } from "../admin-data";

export const metadata: Metadata = { title: "Teams · Organiser" };

const PAY_LABEL = { not_required: "No fee", unpaid: "Unpaid", paid: "Paid", waived: "Waived" } as const;

export default async function AdminTeams({ searchParams }: PageProps<"/admin/teams">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = (TEAM_FILTERS.find((f) => f.key === sp.filter)?.key ?? "all") as TeamFilter;
  const { event, settings } = await requireEvent();
  const { teams, payments } = await loadOverview(event.id);
  const list = filterTeams(teams, settings, filter);

  return (
    <div className="space-y-4">
      <PageTitle title="Teams" />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TEAM_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/teams" : `/admin/teams?filter=${f.key}`}
            className={cx(
              "shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap",
              filter === f.key ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-navy-900"
            )}
          >
            {f.label} ({filterTeams(teams, settings, f.key).length})
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title="No teams in this view" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((t) => {
            const pay = payments.get(t.id);
            return (
              <li key={t.id}>
                <Link href={`/admin/teams/${t.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-sm hover:border-navy-700">
                  <div className="flex flex-wrap gap-1.5">
                    <TeamStatusBadge team={t} settings={settings} />
                    {t.is_reserved && <Badge tone="navy">Reserved</Badge>}
                    {t.roster_locked && <Badge>🔒 Locked</Badge>}
                    {pay && <Badge tone={pay.status === "unpaid" ? "red" : pay.status === "paid" ? "green" : "grey"}>{PAY_LABEL[pay.status]}</Badge>}
                  </div>
                  <p className="mt-2 font-display text-2xl font-extrabold uppercase text-navy-900">{t.name}</p>
                  <p className="mb-2 text-sm text-muted">
                    Captain {t.captain_name} · created {formatAgo(t.created_at)}
                    {t.submitted_at && ` · submitted ${formatAgo(t.submitted_at)}`}
                  </p>
                  <RosterMeter count={t.member_count} settings={settings} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
