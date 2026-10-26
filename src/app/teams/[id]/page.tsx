import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelJoinRequest, leaveTeam, requestToJoin, respondInvitation } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SLOT_DISCLAIMER } from "@/components/event-bits";
import { ShareButtons } from "@/components/share";
import { NeedsChips, RosterMeter, StageTracker, TeamStatusBadge } from "@/components/team-bits";
import { Badge, Card, inputClass, LinkButton, Notice, SectionTitle } from "@/components/ui";
import { getMyInvitations, getMyRequests, getRoster, getTeam, getTeams, getViewer } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { positionLabeler } from "@/lib/format";
import { requireEvent } from "@/lib/guards";
import { canRequestToJoin, isWaitlistTeam, slotSummary } from "@/lib/status";

export async function generateMetadata({ params }: PageProps<"/teams/[id]">): Promise<Metadata> {
  const team = await getTeam((await params).id);
  return { title: team?.name ?? "Team" };
}

export default async function TeamRoom({ params, searchParams }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { event, settings, positions } = await requireEvent();
  const team = await getTeam(id);
  if (!team || team.event_id !== event.id) notFound();

  const [roster, viewer, allTeams] = await Promise.all([getRoster(id), getViewer(), getTeams(event.id)]);
  const label = positionLabeler(positions);
  const slots = slotSummary(settings, allTeams);
  const isCaptain = !!viewer?.player && viewer.player.id === team.captain_player_id;
  const isMember = viewer?.membership?.team_id === id;
  const canManage = isCaptain || !!viewer?.isAdmin;
  const join = canRequestToJoin(team, settings);

  const [myRequests, myInvites] = viewer?.player
    ? await Promise.all([getMyRequests(viewer.player.id), getMyInvitations(viewer.player.id)])
    : [[], []];
  const pendingRequest = myRequests.find((r) => r.team_id === id && r.status === "pending");
  const pendingInvite = myInvites.find((i) => i.team_id === id && i.status === "pending");

  return (
    <div className="space-y-5">
      {sp.joined && (
        <Notice tone="green">
          You’re on <strong>{team.name}</strong>! You’ve been removed from the Player Pool.
        </Notice>
      )}

      <section className="court-lines -mx-4 -mt-5 bg-navy-900 px-4 pt-5 pb-5 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:p-7">
        <div className="flex flex-wrap items-center gap-1.5">
          <TeamStatusBadge team={team} settings={settings} />
          {team.is_reserved && <Badge tone="gold">🏆 {settings.reserved_label}</Badge>}
          {isWaitlistTeam(team, slots) && team.status !== "waitlist" && <Badge tone="amber">Waitlist team</Badge>}
          <Badge tone={team.recruiting && join.ok ? "green" : "grey"}>
            {team.recruiting && join.ok ? "Open for recruitment" : "Closed for recruitment"}
          </Badge>
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-gold-400">Team</p>
        <h1 className="font-display text-5xl font-black uppercase leading-[0.9]">{team.name}</h1>
        <p className="mt-2 text-navy-100">
          Captain <strong className="text-white">{team.captain_name}</strong>
          {team.approx_batch && <> · Batch {team.approx_batch}</>}
          {team.mixed_batch ? " · Mixed batches welcome" : " · Own batch"}
        </p>
        {team.status === "confirmed" && (
          <p className="mt-4 inline-block rounded-xl bg-emerald-500 px-4 py-2 font-display text-2xl font-black uppercase tracking-wide text-white">
            ✅ Team Confirmed
          </p>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <RosterMeter count={team.member_count} settings={settings} big />
            <p className="mt-2 text-sm text-muted">
              Players: {team.member_count} / {settings.max_roster} · minimum {settings.min_roster} to qualify
            </p>
            {team.status !== "confirmed" && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Looking for</p>
                <NeedsChips needs={team.needs} positions={positions} empty="Not specified — any position welcome." />
              </div>
            )}
            {team.description && <p className="mt-4 rounded-xl bg-surface p-3 text-[15px] text-navy-900">{team.description}</p>}
          </Card>

          <div id="join" className="scroll-mt-20">
            {canManage && (
              <LinkButton href={`/teams/${id}/manage`} variant="gold" size="lg" full className="mb-3">
                {isCaptain ? "Manage your team" : "Manage team (organiser)"}
              </LinkButton>
            )}
            {joinPanel()}
          </div>

          <section>
            <SectionTitle>Roster</SectionTitle>
            <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {roster.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-right font-display text-lg font-bold text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-900">
                      {p.display_name}
                      {p.role === "captain" && <span className="ml-2 rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-navy-950">Captain</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {label(p.primary_position)}
                      {p.secondary_position && ` / ${label(p.secondary_position)}`}
                    </p>
                  </div>
                  <span className="font-display text-lg font-bold text-court-500">{p.grad_year}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          <Card>
            <SectionTitle>Registration</SectionTitle>
            <StageTracker team={team} settings={settings} />
          </Card>
          {team.status !== "confirmed" && <Notice>{SLOT_DISCLAIMER}</Notice>}
          <Card>
            <p className="mb-2 text-sm font-semibold text-navy-900">Know someone who should play?</p>
            <ShareButtons
              url={`${await siteUrl()}/teams/${id}`}
              text={`${team.name} is recruiting for the ${event.name}! ${team.member_count}/${settings.max_roster} players.`}
            />
          </Card>
        </aside>
      </div>
    </div>
  );

  function joinPanel() {
    if (isMember) {
      const locked = team!.roster_locked;
      return (
        <Card>
          <p className="font-semibold text-navy-900">You’re on this team. 🏐</p>
          {!isCaptain && !locked && (
            <ActionForm action={leaveTeam} confirm={`Leave ${team!.name}? You'll go back to the Player Pool.`} className="mt-3">
              <SubmitButton variant="danger" full pendingText="Leaving…">
                Leave team
              </SubmitButton>
            </ActionForm>
          )}
          {!isCaptain && locked && <p className="mt-1 text-sm text-muted">The roster is locked. Contact the organiser for changes.</p>}
        </Card>
      );
    }
    // A team nobody can join says so before asking anyone to sign in or register.
    if (!join.ok && !pendingInvite && !pendingRequest) {
      return (
        <Card>
          <button type="button" disabled className="min-h-14 w-full rounded-xl bg-slate-200 font-semibold text-slate-600">
            Join Team — {join.reason}
          </button>
        </Card>
      );
    }
    if (!viewer) {
      return (
        <Card>
          <p className="mb-3 text-[15px] text-navy-900">Sign in to request a spot on {team!.name}.</p>
          <LinkButton href={`/login?next=${encodeURIComponent(`/teams/${id}#join`)}`} size="lg" full>
            Sign in to Join
          </LinkButton>
        </Card>
      );
    }
    if (!viewer.player) {
      return (
        <Card>
          <p className="mb-3 text-[15px] text-navy-900">Quick player profile first — it takes a minute.</p>
          <LinkButton href={`/register?next=${encodeURIComponent(`/teams/${id}#join`)}`} size="lg" full>
            Create my player profile
          </LinkButton>
        </Card>
      );
    }
    if (viewer.membership) {
      return (
        <Card>
          <p className="text-[15px] text-navy-900">
            You’re already on another team. Players may only register for one team.{" "}
            <Link href={`/teams/${viewer.membership.team_id}`} className="font-semibold text-navy-700 underline">
              Go to your team
            </Link>
          </p>
        </Card>
      );
    }
    if (pendingInvite) {
      return (
        <Card className="border-gold-500 ring-2 ring-gold-100">
          <p className="font-semibold text-navy-900">{team!.name} has invited you to join!</p>
          {pendingInvite.message && <p className="mt-1 text-sm italic text-muted">“{pendingInvite.message}”</p>}
          <ActionForm action={respondInvitation} className="mt-3">
            <input type="hidden" name="invitation_id" value={pendingInvite.id} />
            <div className="grid grid-cols-2 gap-2">
              <SubmitButton name="decision" value="accept" variant="success" full>
                Accept
              </SubmitButton>
              <SubmitButton name="decision" value="reject" variant="danger" full>
                Decline
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>
      );
    }
    if (pendingRequest) {
      return (
        <Card>
          <Badge tone="blue">Request pending</Badge>
          <p className="mt-2 text-[15px] text-navy-900">The captain will accept or reject your request. We’ll notify you in My Lobby.</p>
          <ActionForm action={cancelJoinRequest} className="mt-3">
            <input type="hidden" name="request_id" value={pendingRequest.id} />
            <SubmitButton variant="ghost" full pendingText="Withdrawing…">
              Withdraw request
            </SubmitButton>
          </ActionForm>
        </Card>
      );
    }
    return (
      <Card>
        <ActionForm action={requestToJoin} hideOk={false}>
          <input type="hidden" name="team_id" value={id} />
          <label className="mb-1.5 block text-sm font-semibold text-navy-900" htmlFor="join-msg">
            Message to the captain <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="join-msg"
            name="message"
            rows={2}
            maxLength={280}
            placeholder={`e.g. Class of ${viewer.player.grad_year}, usually play ${label(viewer.player.primary_position)}.`}
            className={inputClass}
          />
          <div className="mt-3">
            <SubmitButton size="lg" full pendingText="Sending request…">
              Request to Join
            </SubmitButton>
          </div>
          <p className="mt-2 text-center text-xs text-muted">You’re not added automatically — the captain approves every player.</p>
        </ActionForm>
      </Card>
    );
  }
}
