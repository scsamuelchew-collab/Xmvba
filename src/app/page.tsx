import { EventFacts, RulesList, SlotBreakdown, SlotsBanner, SquadGuide } from "@/components/event-bits";
import { TeamCard } from "@/components/team-bits";
import { Card, Empty, LinkButton, SectionTitle } from "@/components/ui";
import { getEventContext, getTeams, getViewer } from "@/lib/data";
import { slotSummary } from "@/lib/status";
import { NoEvent } from "./no-event";

export default async function FindYourTeam() {
  const ctx = await getEventContext();
  if (!ctx) return <NoEvent />;
  const { event, settings, positions } = ctx;
  const [teams, viewer] = await Promise.all([getTeams(event.id), getViewer()]);
  const slots = slotSummary(settings, teams);
  const active = teams.filter((t) => t.status !== "withdrawn");
  const myTeamId = viewer?.membership?.team_id ?? null;

  const registerHref = viewer?.player ? "/me" : "/register";
  const createHref = viewer?.membership ? `/teams/${myTeamId}` : "/teams/new";

  return (
    <div className="space-y-8">
      <section className="court-lines -mx-4 -mt-5 bg-navy-900 px-4 pt-6 pb-6 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-400">{event.name}</p>
        <h1 className="mt-1 font-display text-5xl font-black uppercase leading-[0.9] sm:text-6xl">Find Your Team</h1>
        <div className="mt-5">
          <EventFacts event={event} settings={settings} />
        </div>
      </section>

      <SlotsBanner slots={slots} settings={settings} />

      <section>
        <h2 className="font-display text-4xl font-black uppercase leading-none text-navy-900">
          No team? <span className="text-court-500">No problem.</span>
        </h2>
        <p className="mt-3 text-lg font-semibold text-navy-900">Want to play but don’t have enough batchmates?</p>
        <p className="mt-2 text-[15px] text-muted">
          Create a team, join an existing alumni team, or enter the Player Pool and we’ll help connect you with other
          Xinmin volleyball alumni. <strong className="text-navy-900">Mixed graduating batches are welcome.</strong>
        </p>
        <p className="mt-3 font-display text-xl font-bold uppercase text-navy-800">
          {event.tagline ?? "Reconnect. Compete. Support the next generation."}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <LinkButton href={createHref} variant="primary" size="lg" full>
            {viewer?.membership ? "Go to My Team" : "Create a Team"}
          </LinkButton>
          <LinkButton href="#teams" variant="outline" size="lg" full>
            Join a Team
          </LinkButton>
          <LinkButton href={registerHref} variant="gold" size="lg" full>
            I Don’t Have a Team
          </LinkButton>
        </div>
        {!settings.registration_open && (
          <p className="mt-3 text-sm font-semibold text-red-700">Registration is closed. Contact the organiser for changes.</p>
        )}
      </section>

      <section id="teams" className="scroll-mt-20">
        <SectionTitle
          action={
            <LinkButton href="/teams" variant="ghost" size="sm">
              All teams →
            </LinkButton>
          }
        >
          Team Rooms ({active.length})
        </SectionTitle>
        {active.length === 0 ? (
          <Empty title="No teams yet — be the first!">Create a team room and start recruiting across batches.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((t) => (
              <TeamCard key={t.id} team={t} settings={settings} positions={positions} slots={slots} viewerTeamId={myTeamId} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle>Registration Rules</SectionTitle>
          <RulesList settings={settings} />
        </section>
        <div className="space-y-6">
          <section>
            <SectionTitle>Competition Slots</SectionTitle>
            <SlotBreakdown settings={settings} />
          </section>
          <section>
            <SectionTitle>Suggested Squad</SectionTitle>
            <Card>
              <SquadGuide positions={positions} settings={settings} />
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
