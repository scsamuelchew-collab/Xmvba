import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelInvitation,
  disbandTeam,
  invitePlayer,
  regenerateInviteCode,
  removeMember,
  respondJoinRequest,
  submitTeam,
  transferCaptaincy,
  updateTeam,
} from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ChoiceGroup } from "@/components/choice";
import { SLOT_DISCLAIMER, SquadGuide } from "@/components/event-bits";
import { NeedsPicker } from "@/components/needs-picker";
import { ShareButtons } from "@/components/share";
import { PlayerCard, RosterMeter, StageTracker, TeamStatusBadge } from "@/components/team-bits";
import { Badge, Card, Empty, Field, inputClass, LinkButton, Notice, PageTitle, SectionTitle } from "@/components/ui";
import {
  getContacts,
  getInviteCode,
  getPayment,
  getPlayersByIds,
  getPool,
  getRoster,
  getTeam,
  getTeamInvitations,
  getTeamRequests,
} from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { formatAgo, formatMoney, positionLabeler, whatsappChat } from "@/lib/format";
import { requireEvent, requireViewer } from "@/lib/guards";
import { canSubmit, matchScore } from "@/lib/status";

export const metadata: Metadata = { title: "Manage team" };

export default async function ManageTeam({ params, searchParams }: PageProps<"/teams/[id]/manage">) {
  const { id } = await params;
  const sp = await searchParams;
  const { event, settings, positions } = await requireEvent();
  const viewer = await requireViewer(`/teams/${id}/manage`);
  const team = await getTeam(id);
  if (!team || team.event_id !== event.id) notFound();
  const isCaptain = viewer.player?.id === team.captain_player_id;
  if (!isCaptain && !viewer.isAdmin) notFound();

  const [roster, requests, invitations, code, payment, pool] = await Promise.all([
    getRoster(id),
    getTeamRequests(id, "pending"),
    getTeamInvitations(id, "pending"),
    getInviteCode(id),
    getPayment(id),
    getPool(event.id),
  ]);
  const requesters = await getPlayersByIds(requests.map((r) => r.player_id));
  const invitees = await getPlayersByIds(invitations.map((i) => i.player_id));
  const contacts = await getContacts([...roster.map((p) => p.id), ...requests.map((r) => r.player_id)]);
  const label = positionLabeler(positions);
  const submit = canSubmit(team, settings);
  const full = team.member_count >= settings.max_roster;
  const locked = team.roster_locked;
  const inviteUrl = code ? `${await siteUrl()}/join/${code}` : null;

  const invitedIds = new Set(invitations.map((i) => i.player_id));
  const requestedIds = new Set(requests.map((r) => r.player_id));
  const suggestions = pool
    .filter((p) => !invitedIds.has(p.id) && !requestedIds.has(p.id))
    .map((p) => ({ p, score: matchScore(team.needs, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PageTitle eyebrow={isCaptain ? "Captain’s room" : "Organiser view"} title={team.name}>
        <span className="flex flex-wrap items-center gap-2">
          <TeamStatusBadge team={team} settings={settings} />
          {locked && <Badge tone="grey">🔒 Roster locked</Badge>}
          <Link href={`/teams/${id}`} className="font-semibold text-navy-700 underline">
            View public team room
          </Link>
        </span>
      </PageTitle>

      {sp.created && (
        <Notice tone="green">
          <strong>Team room created!</strong> Share your invite link below with teammates you already have, and check the
          Player Pool for alumni looking for a team. {SLOT_DISCLAIMER}
        </Notice>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Progress + submit */}
        <Card>
          <RosterMeter count={team.member_count} settings={settings} big />
          <div className="mt-4">
            <StageTracker team={team} settings={settings} />
          </div>
          <div className="mt-4">
            {team.status === "forming" || team.status === "rejected" ? (
              <ActionForm
                action={submitTeam}
                confirm={`Submit ${team.name} with ${team.member_count} players for organiser approval?`}
              >
                <input type="hidden" name="team_id" value={id} />
                <SubmitButton size="lg" variant="gold" full disabled={!submit.ok} pendingText="Submitting…">
                  {submit.ok ? "Submit for Approval" : `Submit for Approval — ${submit.reason}`}
                </SubmitButton>
                <p className="mt-2 text-xs text-muted">
                  Submitting completes your registration. Slots go to the first {settings.open_slots} fully completed and
                  approved teams.
                </p>
              </ActionForm>
            ) : team.status === "payment_pending" ? (
              <Notice tone="blue">
                <strong>Payment pending:</strong> {formatMoney(payment?.amount_cents ?? settings.fee_cents)} registration fee.{" "}
                {settings.payment_instructions ?? "The organiser will share payment details."}
              </Notice>
            ) : team.status === "admin_review" ? (
              <Notice tone="blue">Submitted — the organiser is reviewing your team.</Notice>
            ) : team.status === "waitlist" ? (
              <Notice>
                Your team is on the <strong>waitlist</strong>. If a confirmed team withdraws, the organiser can promote you.
              </Notice>
            ) : team.status === "confirmed" ? (
              <Notice tone="green">
                <strong>✅ TEAM CONFIRMED.</strong> Roster changes now need organiser approval.
              </Notice>
            ) : null}
            {team.status === "rejected" && (
              <div className="mt-2">
                <Notice tone="red">The organiser sent your team back for changes. Check My Lobby for their note, then resubmit.</Notice>
              </div>
            )}
          </div>
        </Card>

        {/* Invite link */}
        <Card>
          <SectionTitle>Invite your teammates</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Anyone who opens this link and signs in joins your roster straight away. Share it only with people you want on
            the team.
          </p>
          {inviteUrl && !locked && !full ? (
            <>
              <p className="mb-3 truncate rounded-lg bg-surface px-3 py-2 font-mono text-sm text-navy-900">{inviteUrl}</p>
              <ShareButtons
                url={inviteUrl}
                text={`Join ${team.name} for the ${event.name}! Tap to join our team:`}
              />
              <ActionForm action={regenerateInviteCode} confirm="Create a new link? The old one will stop working." className="mt-2">
                <input type="hidden" name="team_id" value={id} />
                <SubmitButton variant="ghost" size="sm" full>
                  Reset link
                </SubmitButton>
              </ActionForm>
            </>
          ) : (
            <p className="text-sm font-semibold text-navy-900">
              {locked ? "Roster is locked — invites are paused." : "Your team is full."}
            </p>
          )}
        </Card>
      </div>

      {/* Join requests */}
      <section>
        <SectionTitle>Join requests ({requests.length})</SectionTitle>
        {requests.length === 0 ? (
          <Empty title="No requests waiting">Players who press “Join Team” on your team room appear here.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {requests.map((r) => {
              const p = requesters.find((x) => x.id === r.player_id);
              if (!p) return null;
              const c = contacts.get(p.id);
              return (
                <PlayerCard key={r.id} player={p} label={label} highlight={matchScore(team.needs, p) >= 2}>
                  {r.message && <p className="mb-2 text-sm text-navy-900">💬 {r.message}</p>}
                  {c && (
                    <p className="mb-2 text-sm text-muted">
                      {c.full_name} ·{" "}
                      <a href={whatsappChat(c.mobile)} className="font-semibold text-emerald-700 underline" target="_blank" rel="noopener noreferrer">
                        {c.mobile}
                      </a>
                    </p>
                  )}
                  <p className="mb-2 text-xs text-muted">Requested {formatAgo(r.created_at)}</p>
                  <ActionForm action={respondJoinRequest}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <SubmitButton name="decision" value="accept" variant="success" full disabled={full || locked}>
                        Accept
                      </SubmitButton>
                      <SubmitButton name="decision" value="reject" variant="danger" full>
                        Reject
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </PlayerCard>
              );
            })}
          </div>
        )}
      </section>

      {/* Recruit from pool */}
      {!full && !locked && (
        <section>
          <SectionTitle
            action={
              <LinkButton href={`/pool?team=${id}`} variant="ghost" size="sm">
                Full Player Pool →
              </LinkButton>
            }
          >
            Recruit from the Player Pool
          </SectionTitle>
          {suggestions.length === 0 ? (
            <Empty title="No free agents right now">Share the Player Pool link in your batch chats to bring more alumni in.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map(({ p, score }) => (
                <PlayerCard key={p.id} player={p} label={label} highlight={score >= 2}>
                  {score >= 2 && <p className="mb-2 text-xs font-bold uppercase text-court-500">Matches a position you need</p>}
                  <ActionForm action={invitePlayer}>
                    <input type="hidden" name="team_id" value={id} />
                    <input type="hidden" name="player_id" value={p.id} />
                    <SubmitButton full pendingText="Inviting…">
                      Invite to {team.name}
                    </SubmitButton>
                  </ActionForm>
                </PlayerCard>
              ))}
            </div>
          )}
        </section>
      )}

      {invitations.length > 0 && (
        <section>
          <SectionTitle>Invitations sent ({invitations.length})</SectionTitle>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {invitations.map((inv) => {
              const p = invitees.find((x) => x.id === inv.player_id);
              return (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <p className="font-semibold text-navy-900">
                      {p?.display_name} <span className="font-normal text-muted">· {p?.grad_year} · {label(p?.primary_position)}</span>
                    </p>
                    <p className="text-xs text-muted">Waiting for reply · sent {formatAgo(inv.created_at)}</p>
                  </div>
                  <ActionForm action={cancelInvitation}>
                    <input type="hidden" name="invitation_id" value={inv.id} />
                    <SubmitButton variant="ghost" size="sm">
                      Cancel
                    </SubmitButton>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Roster with contacts */}
      <section>
        <SectionTitle>Roster & contacts</SectionTitle>
        <ul className="grid gap-2">
          {roster.map((p) => {
            const c = contacts.get(p.id);
            const isCap = p.id === team.captain_player_id;
            return (
              <li key={p.id} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy-900">
                      {c?.full_name ?? p.display_name} {isCap && <Badge tone="gold">Captain</Badge>}
                    </p>
                    <p className="text-sm text-muted">
                      Class of {p.grad_year} · {label(p.primary_position)}
                      {p.secondary_position && ` / ${label(p.secondary_position)}`}
                    </p>
                    {c && (
                      <a href={whatsappChat(c.mobile)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-emerald-700 underline">
                        WhatsApp {c.mobile}
                      </a>
                    )}
                  </div>
                </div>
                {!isCap && (!locked || viewer.isAdmin) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-navy-700">Options</summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <ActionForm action={transferCaptaincy} confirm={`Make ${p.display_name} the captain? You'll lose captain controls.`}>
                        <input type="hidden" name="team_id" value={id} />
                        <input type="hidden" name="player_id" value={p.id} />
                        <SubmitButton variant="outline" size="sm" full>
                          Make captain
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={removeMember} confirm={`Remove ${p.display_name} from ${team.name}?`}>
                        <input type="hidden" name="team_id" value={id} />
                        <input type="hidden" name="player_id" value={p.id} />
                        <SubmitButton variant="danger" size="sm" full>
                          Remove
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Edit details */}
      <section>
        <SectionTitle>Team details & positions needed</SectionTitle>
        <Card>
          <ActionForm action={updateTeam} className="space-y-4">
            <input type="hidden" name="team_id" value={id} />
            <Field label="Team name">
              <input name="name" required minLength={2} maxLength={40} defaultValue={team.name} className={inputClass} />
            </Field>
            <Field label="Approx. batch" optional>
              <input name="approx_batch" maxLength={40} defaultValue={team.approx_batch ?? ""} className={inputClass} />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-navy-900">Recruitment</p>
              <ChoiceGroup
                name="recruiting"
                defaultValue={team.recruiting ? "yes" : "no"}
                options={[
                  { value: "yes", label: "Open — accept requests" },
                  { value: "no", label: "Closed" },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-navy-900">Mixed batches</p>
              <ChoiceGroup
                name="mixed_batch"
                defaultValue={team.mixed_batch ? "yes" : "no"}
                options={[
                  { value: "yes", label: "Anyone welcome" },
                  { value: "no", label: "Own batch only" },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-navy-900">Still looking for</p>
              <NeedsPicker positions={positions} initial={team.needs} />
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-semibold text-navy-700">Suggested squad structure</summary>
                <div className="mt-2">
                  <SquadGuide positions={positions} settings={settings} />
                </div>
              </details>
            </div>
            <Field label="Description" optional>
              <textarea name="description" rows={3} maxLength={400} defaultValue={team.description ?? ""} className={inputClass} />
            </Field>
            <SubmitButton full pendingText="Saving…">
              Save changes
            </SubmitButton>
          </ActionForm>
        </Card>
      </section>

      {(team.status === "forming" || team.status === "rejected" || viewer.isAdmin) && (
        <section>
          <ActionForm
            action={disbandTeam}
            confirm={`Disband ${team.name}? Everyone on the roster goes back to the Player Pool. This can't be undone.`}
          >
            <input type="hidden" name="team_id" value={id} />
            <SubmitButton variant="danger" full pendingText="Disbanding…">
              Disband team
            </SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
