import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createTeam } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ChoiceGroup } from "@/components/choice";
import { SLOT_DISCLAIMER, SquadGuide } from "@/components/event-bits";
import { NeedsPicker } from "@/components/needs-picker";
import { Card, Field, inputClass, Notice, PageTitle } from "@/components/ui";
import { getContacts } from "@/lib/data";
import { requireEvent, requireViewer } from "@/lib/guards";

export const metadata: Metadata = { title: "Create a Team" };

export default async function NewTeamPage() {
  const { event, settings, positions } = await requireEvent();
  const viewer = await requireViewer("/teams/new");
  if (!viewer.player) redirect("/register?next=/teams/new");
  if (viewer.membership) redirect(`/teams/${viewer.membership.team_id}`);
  const contact = (await getContacts([viewer.player.id])).get(viewer.player.id);

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle eyebrow={event.name} title="Create a Team">
        You’ll be the captain. You get a team room and an invite link to share on WhatsApp.
      </PageTitle>

      <div className="mb-4">
        <Notice>
          <strong>Heads up:</strong> {SLOT_DISCLAIMER}
        </Notice>
      </div>
      {!settings.registration_open && (
        <div className="mb-4">
          <Notice tone="red">Registration is closed, so new teams can’t be created.</Notice>
        </div>
      )}

      <Card>
        <ActionForm action={createTeam} className="space-y-5">
          <Field label="Team name">
            <input name="name" required minLength={2} maxLength={40} placeholder="e.g. XMS Legends" className={inputClass} />
          </Field>

          <div className="rounded-xl bg-surface p-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Captain</p>
            <p className="font-semibold text-navy-900">
              {contact?.full_name ?? viewer.player.display_name} · Class of {viewer.player.grad_year}
            </p>
            <p className="text-muted">Contact: {contact?.mobile} (only organisers see this)</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Approx. batch" optional hint="e.g. 2008–2011">
              <input name="approx_batch" maxLength={40} defaultValue={String(viewer.player.grad_year)} className={inputClass} />
            </Field>
            <Field label="Players you already have" hint="Including you">
              <input name="existing_players" type="number" inputMode="numeric" min={1} max={settings.max_roster} defaultValue={1} className={inputClass} />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-navy-900">Allow mixed batches?</p>
            <ChoiceGroup
              name="mixed_batch"
              required
              defaultValue="yes"
              options={[
                { value: "yes", label: "Yes, anyone welcome" },
                { value: "no", label: "No, own batch only" },
              ]}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-navy-900">Positions you’re looking for</p>
            <NeedsPicker positions={positions} />
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold text-navy-700">Suggested squad structure</summary>
              <div className="mt-2">
                <SquadGuide positions={positions} settings={settings} />
              </div>
            </details>
          </div>

          <Field label="Description" optional hint="e.g. “Mostly 2008–2011 batch but happy for anyone to join.”">
            <textarea name="description" rows={3} maxLength={400} className={inputClass} />
          </Field>

          <label className="flex items-start gap-3 rounded-xl border border-gold-400 bg-gold-100 p-3 text-sm text-navy-900">
            <input type="checkbox" name="acknowledge" required className="mt-0.5 size-5 shrink-0 accent-navy-900" />I understand
            creating a team does not secure a competition slot.
          </label>

          <SubmitButton size="lg" full pendingText="Creating team…">
            Create Team Room
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
