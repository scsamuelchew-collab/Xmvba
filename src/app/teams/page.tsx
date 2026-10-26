import type { Metadata } from "next";
import Link from "next/link";
import { SlotsBanner } from "@/components/event-bits";
import { TeamCard } from "@/components/team-bits";
import { cx, Empty, LinkButton, PageTitle } from "@/components/ui";
import { getTeams, getViewer } from "@/lib/data";
import { requireEvent } from "@/lib/guards";
import { slotSummary } from "@/lib/status";

export const metadata: Metadata = { title: "Join a Team" };

export default async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  const sp = await searchParams;
  const need = typeof sp.need === "string" ? sp.need : "";
  const { event, settings, positions } = await requireEvent();
  const [teams, viewer] = await Promise.all([getTeams(event.id), getViewer()]);
  const slots = slotSummary(settings, teams);
  const visible = teams
    .filter((t) => t.status !== "withdrawn")
    .filter((t) => !need || (t.needs[need] ?? 0) > 0);

  return (
    <div className="space-y-5">
      <PageTitle eyebrow={event.name} title="Join a Team">
        Pick a team, open its room and request to join. The captain approves every new player.
      </PageTitle>
      <SlotsBanner slots={slots} settings={settings} compact />

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Teams looking for…</p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <FilterChip href="/teams" active={!need}>
            Any position
          </FilterChip>
          {positions.map((p) => (
            <FilterChip key={p.code} href={`/teams?need=${p.code}`} active={need === p.code}>
              {p.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Empty title={need ? "No team is asking for that position right now" : "No teams yet"}>
          You can still request to join any team, or enter the Player Pool so captains can find you.
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <TeamCard key={t.id} team={t} settings={settings} positions={positions} slots={slots} viewerTeamId={viewer?.membership?.team_id} />
          ))}
        </div>
      )}

      {!viewer?.membership && (
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkButton href="/teams/new" variant="outline" size="lg" full>
            Create a Team instead
          </LinkButton>
          <LinkButton href={viewer?.player ? "/me" : "/register"} variant="gold" size="lg" full>
            I Don’t Have a Team
          </LinkButton>
        </div>
      )}
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
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
