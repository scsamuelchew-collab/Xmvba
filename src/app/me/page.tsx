import type { Metadata } from "next";
import Link from "next/link";
import {
  cancelJoinRequest,
  leaveTeam,
  markNotificationsRead,
  respondInvitation,
  setLookingForTeam,
  signOut,
} from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TeamCard } from "@/components/team-bits";
import { Badge, buttonClass, Card, cx, Empty, LinkButton, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { getMyInvitations, getMyRequests, getNotifications, getTeams, getTeamsByIds } from "@/lib/data";
import { formatAgo, positionLabeler } from "@/lib/format";
import { requireEvent, requireViewer } from "@/lib/guards";
import { slotSummary } from "@/lib/status";

export const metadata: Metadata = { title: "My Lobby" };

export default async function MyLobby({ searchParams }: PageProps<"/me">) {
  const sp = await searchParams;
  const { event, settings, positions } = await requireEvent();
  const viewer = await requireViewer("/me");
  const player = viewer.player;
  const label = positionLabeler(positions);

  const [notifications, requests, invitations, teams] = await Promise.all([
    getNotifications(viewer.userId),
    player ? getMyRequests(player.id) : [],
    player ? getMyInvitations(player.id) : [],
    getTeams(event.id),
  ]);
  const slots = slotSummary(settings, teams);
  const teamMap = await getTeamsByIds([...new Set([...requests.map((r) => r.team_id), ...invitations.map((i) => i.team_id)])]);
  const myTeam = viewer.membership ? teams.find((t) => t.id === viewer.membership!.team_id) : undefined;
  const pendingInvites = invitations.filter((i) => i.status === "pending");
  const recentRequests = requests.filter((r) => r.status === "pending" || Date.now() - new Date(r.created_at).getTime() < 14 * 864e5);
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      <PageTitle eyebrow={event.name} title="My Lobby">
        {player ? `Hi ${player.display_name}!` : viewer.email}
      </PageTitle>

      {sp.registered && (
        <Notice tone="green">
          <strong>You’re registered!</strong>{" "}
          {viewer.membership ? "" : "You’re in the Player Pool — captains can now invite you. You can also request to join any team."}
        </Notice>
      )}

      {!player ? (
        <Card>
          <p className="mb-3 text-[15px] text-navy-900">You haven’t registered as a player for {event.name} yet.</p>
          <LinkButton href="/register" variant="gold" size="lg" full>
            Register as a player
          </LinkButton>
        </Card>
      ) : (
        <>
          {/* Invitations first: the one thing that needs a reply. */}
          {pendingInvites.length > 0 && (
            <section>
              <SectionTitle>Invitations ({pendingInvites.length})</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {pendingInvites.map((inv) => {
                  const t = teamMap.get(inv.team_id);
                  return (
                    <Card key={inv.id} className="border-gold-500 ring-2 ring-gold-100">
                      <p className="text-xs font-bold uppercase tracking-wide text-court-500">Team invitation</p>
                      <Link href={`/teams/${inv.team_id}`} className="font-display text-2xl font-extrabold uppercase text-navy-900 underline-offset-2 hover:underline">
                        {t?.name ?? "A team"}
                      </Link>
                      {t && (
                        <p className="text-sm text-muted">
                          Captain {t.captain_name} · {t.member_count}/{settings.max_roster} players
                        </p>
                      )}
                      {inv.message && <p className="mt-2 text-sm italic text-navy-900">“{inv.message}”</p>}
                      <ActionForm action={respondInvitation} className="mt-3">
                        <input type="hidden" name="invitation_id" value={inv.id} />
                        <div className="grid grid-cols-2 gap-2">
                          <SubmitButton name="decision" value="accept" variant="success" full disabled={!!viewer.membership}>
                            Accept
                          </SubmitButton>
                          <SubmitButton name="decision" value="reject" variant="danger" full>
                            Decline
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>My team</SectionTitle>
            {myTeam ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <TeamCard team={myTeam} settings={settings} positions={positions} slots={slots} viewerTeamId={myTeam.id} />
                <div className="space-y-2">
                  {viewer.membership?.role === "captain" ? (
                    <LinkButton href={`/teams/${myTeam.id}/manage`} variant="gold" size="lg" full>
                      Manage team (captain)
                    </LinkButton>
                  ) : myTeam.roster_locked ? (
                    <p className="text-sm text-muted">Roster locked — contact the organiser for changes.</p>
                  ) : (
                    <ActionForm action={leaveTeam} confirm={`Leave ${myTeam.name}? You'll go back to the Player Pool.`}>
                      <SubmitButton variant="danger" full pendingText="Leaving…">
                        Leave team
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </div>
            ) : (
              <Card>
                <p className="text-[15px] text-navy-900">You’re not on a team yet.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <LinkButton href="/teams" full>
                    Browse teams
                  </LinkButton>
                  <LinkButton href="/teams/new" variant="outline" full>
                    Create a team
                  </LinkButton>
                </div>
                <ActionForm action={setLookingForTeam} className="mt-4 border-t border-line pt-3">
                  <input type="hidden" name="looking" value={player.looking_for_team ? "false" : "true"} />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm">
                      Player Pool:{" "}
                      {player.looking_for_team ? <Badge tone="green">Visible to captains</Badge> : <Badge>Hidden</Badge>}
                    </p>
                    <SubmitButton variant="ghost" size="sm">
                      {player.looking_for_team ? "Hide me" : "Show me"}
                    </SubmitButton>
                  </div>
                </ActionForm>
              </Card>
            )}
          </section>

          {recentRequests.length > 0 && (
            <section>
              <SectionTitle>My join requests</SectionTitle>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
                {recentRequests.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/teams/${r.team_id}`} className="font-semibold text-navy-900 underline-offset-2 hover:underline">
                        {teamMap.get(r.team_id)?.name ?? "Team"}
                      </Link>
                      <p className="text-xs text-muted">Sent {formatAgo(r.created_at)}</p>
                    </div>
                    <Badge tone={r.status === "accepted" ? "green" : r.status === "pending" ? "blue" : r.status === "rejected" ? "red" : "grey"}>
                      {r.status}
                    </Badge>
                    {r.status === "pending" && (
                      <ActionForm action={cancelJoinRequest}>
                        <input type="hidden" name="request_id" value={r.id} />
                        <SubmitButton variant="ghost" size="sm">
                          Withdraw
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionTitle
              action={
                <LinkButton href="/register" variant="ghost" size="sm">
                  Edit
                </LinkButton>
              }
            >
              My profile
            </SectionTitle>
            <Card>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">Name</dt>
                <dd className="font-semibold">{player.display_name}</dd>
                <dt className="text-muted">Class of</dt>
                <dd className="font-semibold">{player.grad_year}</dd>
                <dt className="text-muted">Primary</dt>
                <dd className="font-semibold">{label(player.primary_position)}</dd>
                <dt className="text-muted">Secondary</dt>
                <dd className="font-semibold">{label(player.secondary_position) || "—"}</dd>
              </dl>
            </Card>
          </section>
        </>
      )}

      <section>
        <SectionTitle
          action={
            unread > 0 ? (
              <ActionForm action={markNotificationsRead} hideOk>
                <SubmitButton variant="ghost" size="sm">
                  Mark all read
                </SubmitButton>
              </ActionForm>
            ) : null
          }
        >
          Notifications {unread > 0 && <Badge tone="red">{unread} new</Badge>}
        </SectionTitle>
        {notifications.length === 0 ? (
          <Empty title="Nothing yet">Join requests, invitations and approvals will show up here.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {notifications.map((n) => {
              const body = (
                <>
                  <p className={cx("text-[15px]", n.read_at ? "text-navy-900" : "font-bold text-navy-900")}>
                    {!n.read_at && <span className="mr-2 inline-block size-2 rounded-full bg-court-500 align-middle" />}
                    {n.title}
                  </p>
                  {n.body && <p className="text-sm text-muted">{n.body}</p>}
                  <p className="text-xs text-muted">{formatAgo(n.created_at)}</p>
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="block px-4 py-3 hover:bg-surface">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form action={signOut}>
        <button type="submit" className={buttonClass("ghost", "md", true)}>
          Sign out
        </button>
      </form>
    </div>
  );
}
