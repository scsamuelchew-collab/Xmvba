import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminAddNote, adminDeleteNote, adminTeamAction, adminTransferPlayer, removeMember } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RosterMeter, StageTracker, TeamStatusBadge } from "@/components/team-bits";
import { Badge, Card, cx, Field, inputClass, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { getContacts, getNotes, getPayment, getRoster, getTeam, getTeams } from "@/lib/data";
import { formatAgo, formatMoney, positionLabeler, whatsappChat } from "@/lib/format";
import { requireAdmin, requireEvent } from "@/lib/guards";
import { canSubmit, slotSummary } from "@/lib/status";

export const metadata: Metadata = { title: "Team · Organiser" };

export default async function AdminTeam({ params }: PageProps<"/admin/teams/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { event, settings, positions } = await requireEvent();
  const team = await getTeam(id);
  if (!team || team.event_id !== event.id) notFound();
  const [roster, payment, notes, teams] = await Promise.all([getRoster(id), getPayment(id), getNotes({ teamId: id }), getTeams(event.id)]);
  const contacts = await getContacts(roster.map((p) => p.id));
  const label = positionLabeler(positions);
  const slots = slotSummary(settings, teams);
  const captainContact = contacts.get(team.captain_player_id);
  const others = teams.filter((t) => t.id !== id && t.status !== "withdrawn");
  const eligible = team.member_count >= settings.min_roster && team.member_count <= settings.max_roster;
  const submitted = !!team.submitted_at;
  const paid = payment?.status !== "unpaid";
  const slotFree = team.is_reserved || !slots.full;


  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Organiser · Team" title={team.name}>
        <span className="flex flex-wrap items-center gap-2">
          <TeamStatusBadge team={team} settings={settings} />
          {team.is_reserved && <Badge tone="navy">🏆 {settings.reserved_label}</Badge>}
          {team.roster_locked && <Badge>🔒 Roster locked</Badge>}
          <Link href={`/teams/${id}`} className="font-semibold text-navy-700 underline">
            Public page
          </Link>
          <Link href={`/teams/${id}/manage`} className="font-semibold text-navy-700 underline">
            Captain view
          </Link>
        </span>
      </PageTitle>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Captain</dt>
            <dd className="font-semibold">{captainContact?.full_name ?? team.captain_name}</dd>
            <dt className="text-muted">Contact</dt>
            <dd>
              {captainContact ? (
                <>
                  <a href={whatsappChat(captainContact.mobile)} className="font-semibold text-emerald-700 underline" target="_blank" rel="noopener noreferrer">
                    {captainContact.mobile}
                  </a>
                  {captainContact.email && <span className="block text-muted">{captainContact.email}</span>}
                </>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted">Batch</dt>
            <dd>{team.approx_batch ?? "—"} {team.mixed_batch ? "(mixed OK)" : "(own batch)"}</dd>
            <dt className="text-muted">Declared players</dt>
            <dd>{team.declared_existing_players} at creation</dd>
            <dt className="text-muted">Submitted</dt>
            <dd>{team.submitted_at ? formatAgo(team.submitted_at) : "Not yet"}</dd>
            <dt className="text-muted">Payment</dt>
            <dd className="font-semibold">
              {payment?.status === "not_required" ? "Not required" : `${payment?.status} · ${formatMoney(payment?.amount_cents ?? 0)}`}
              {payment?.reference && <span className="block font-normal text-muted">Ref: {payment.reference}</span>}
            </dd>
          </dl>
          <div className="mt-4">
            <RosterMeter count={team.member_count} settings={settings} />
          </div>
          {team.description && <p className="mt-3 rounded-xl bg-surface p-3 text-sm">{team.description}</p>}
        </Card>

        <Card>
          <SectionTitle>Approval</SectionTitle>
          <StageTracker team={team} settings={settings} />
          <div className="mt-4 space-y-2">
            {team.status !== "confirmed" && team.status !== "withdrawn" && (
              <>
                {!eligible && <Notice tone="red">Not eligible: needs {settings.min_roster}–{settings.max_roster} players.</Notice>}
                {!submitted && <Notice tone="blue">The captain hasn’t submitted yet. {canSubmit(team, settings).ok ? "They have enough players." : ""}</Notice>}
                {!paid && <Notice tone="blue">Registration fee not yet marked paid.</Notice>}
                {!slotFree && <Notice>All {settings.open_slots} open slots are filled — waitlist or withdraw a confirmed team first.</Notice>}
                <Op teamId={id} op="confirm" variant="success" confirm={`Approve and confirm ${team.name}? This uses a competition slot and locks the roster.`}>
                  ✅ Approve & Confirm
                </Op>
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              {team.status === "waitlist" ? (
                <Op teamId={id} op="promote" variant="gold">Promote from waitlist</Op>
              ) : team.status !== "withdrawn" ? (
                <Op teamId={id} op="waitlist" confirm={`Move ${team.name} to the waitlist?`}>Move to waitlist</Op>
              ) : null}
              {team.status === "withdrawn" || team.status === "rejected" ? (
                <Op teamId={id} op="reopen">Reopen as forming</Op>
              ) : null}
              {team.roster_locked ? <Op teamId={id} op="unlock">🔓 Unlock roster</Op> : <Op teamId={id} op="lock">🔒 Lock roster</Op>}
              {team.is_reserved ? (
                <Op teamId={id} op="unreserve">Release reserved slot</Op>
              ) : (
                <Op teamId={id} op="reserve" confirm={`Give ${team.name} the ${settings.reserved_label} reserved slot?`}>🏆 Reserved slot</Op>
              )}
            </div>
            {team.status !== "withdrawn" && team.status !== "rejected" && (
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-semibold text-red-700">Reject / send back to captain</summary>
                <ActionForm action={adminTeamAction} className="mt-2 space-y-2">
                  <input type="hidden" name="team_id" value={id} />
                  <input type="hidden" name="op" value="reject" />
                  <textarea name="reason" rows={2} placeholder="Reason (sent to the captain)" className={inputClass} />
                  <SubmitButton variant="danger" full>
                    Reject team
                  </SubmitButton>
                </ActionForm>
              </details>
            )}
            {team.status !== "withdrawn" && (
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-semibold text-red-700">Withdraw team</summary>
                <ActionForm action={adminTeamAction} confirm={`Withdraw ${team.name} from the competition?`} className="mt-2 space-y-2">
                  <input type="hidden" name="team_id" value={id} />
                  <input type="hidden" name="op" value="withdraw" />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="release" className="size-5 accent-navy-900" /> Release all players back to the Player Pool
                  </label>
                  <SubmitButton variant="danger" full>
                    Withdraw team
                  </SubmitButton>
                </ActionForm>
              </details>
            )}
          </div>
        </Card>
      </div>

      <section>
        <SectionTitle>Payment</SectionTitle>
        <Card>
          <ActionForm action={adminTeamAction} className="space-y-3">
            <input type="hidden" name="team_id" value={id} />
            <input type="hidden" name="op" value="payment" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select name="payment_status" defaultValue={payment?.status ?? "unpaid"} className={inputClass}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="waived">Waived</option>
                  <option value="not_required">Not required</option>
                </select>
              </Field>
              <Field label="Reference" optional>
                <input name="reference" maxLength={100} defaultValue={payment?.reference ?? ""} placeholder="PayNow ref" className={inputClass} />
              </Field>
            </div>
            <SubmitButton full>Save payment status</SubmitButton>
          </ActionForm>
        </Card>
      </section>

      <section>
        <SectionTitle>Roster ({roster.length})</SectionTitle>
        <ul className="grid gap-2">
          {roster.map((p) => {
            const c = contacts.get(p.id);
            const isCap = p.id === team.captain_player_id;
            return (
              <li key={p.id} className="rounded-2xl border border-line bg-white p-4">
                <p className="font-semibold text-navy-900">
                  {c?.full_name ?? p.display_name} {isCap && <Badge tone="gold">Captain</Badge>}
                </p>
                <p className="text-sm text-muted">
                  Class of {p.grad_year} · {label(p.primary_position)}
                  {p.secondary_position && ` / ${label(p.secondary_position)}`}
                  {c?.gender && ` · ${c.gender}`}
                </p>
                {c && (
                  <p className="text-sm">
                    <a href={whatsappChat(c.mobile)} className="font-semibold text-emerald-700 underline" target="_blank" rel="noopener noreferrer">
                      {c.mobile}
                    </a>
                    {c.email && <span className="text-muted"> · {c.email}</span>}
                  </p>
                )}
                {!isCap && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-navy-700">Remove / transfer</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <ActionForm action={adminTransferPlayer} className="flex gap-2">
                        <input type="hidden" name="player_id" value={p.id} />
                        <select name="to_team" required defaultValue="" className={cx(inputClass, "flex-1")} aria-label="Transfer to">
                          <option value="" disabled>
                            Transfer to…
                          </option>
                          {others.map((t) => (
                            <option key={t.id} value={t.id} disabled={t.member_count >= settings.max_roster}>
                              {t.name} ({t.member_count}/{settings.max_roster})
                            </option>
                          ))}
                        </select>
                        <SubmitButton size="md">Move</SubmitButton>
                      </ActionForm>
                      <ActionForm action={removeMember} confirm={`Remove ${p.display_name} from ${team.name}? They go back to the Player Pool.`}>
                        <input type="hidden" name="team_id" value={id} />
                        <input type="hidden" name="player_id" value={p.id} />
                        <SubmitButton variant="danger" full>
                          Remove to Player Pool
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

      <section>
        <SectionTitle>Admin notes (private)</SectionTitle>
        <Card>
          <ActionForm action={adminAddNote} resetOnSuccess hideOk className="space-y-2">
            <input type="hidden" name="team_id" value={id} />
            <textarea name="body" required rows={2} maxLength={2000} placeholder="Only organisers can see these notes." className={inputClass} />
            <SubmitButton full>Add note</SubmitButton>
          </ActionForm>
          <ul className="mt-4 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-surface p-3 text-sm">
                <p className="whitespace-pre-wrap text-navy-900">{n.body}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  {formatAgo(n.created_at)}
                  <ActionForm action={adminDeleteNote} confirm="Delete this note?">
                    <input type="hidden" name="note_id" value={n.id} />
                    <button className="font-semibold text-red-700 underline">Delete</button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Op({
  teamId,
  op,
  children,
  variant = "outline",
  confirm,
}: {
  teamId: string;
  op: string;
  children: React.ReactNode;
  variant?: "outline" | "success" | "danger" | "gold" | "primary";
  confirm?: string;
}) {
  return (
    <ActionForm action={adminTeamAction} confirm={confirm}>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton variant={variant} size="md" full>
        {children}
      </SubmitButton>
    </ActionForm>
  );
}
