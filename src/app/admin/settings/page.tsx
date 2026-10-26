import type { Metadata } from "next";
import { adminSetRole, adminUpdateSettings } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ChoiceGroup } from "@/components/choice";
import { Card, Field, inputClass, PageTitle, SectionTitle } from "@/components/ui";
import { requireAdmin, requireEvent } from "@/lib/guards";

export const metadata: Metadata = { title: "Settings · Organiser" };

export default async function AdminSettings() {
  await requireAdmin();
  const { event, settings } = await requireEvent();
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

  return (
    <div className="space-y-6">
      <PageTitle title="Event Settings">Everything here is configurable per event — nothing is hard-coded.</PageTitle>
      <ActionForm action={adminUpdateSettings} className="space-y-6">
        <Card>
          <SectionTitle>Registration</SectionTitle>
          <ChoiceGroup
            name="registration_open"
            defaultValue={settings.registration_open ? "open" : "closed"}
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
          />
          <p className="mt-2 text-xs text-muted">Closing stops new players, teams, requests and invitations. Organisers can still make changes.</p>
        </Card>

        <Card>
          <SectionTitle>Slots & rosters</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Open alumni slots">
              <input name="open_slots" type="number" min={0} inputMode="numeric" defaultValue={settings.open_slots} className={inputClass} />
            </Field>
            <Field label="Reserved slots" hint={settings.reserved_label}>
              <input name="reserved_slots" type="number" min={0} inputMode="numeric" defaultValue={settings.reserved_slots} className={inputClass} />
            </Field>
            <Field label="Other teams" hint={settings.other_slots_label}>
              <input name="other_slots" type="number" min={0} inputMode="numeric" defaultValue={settings.other_slots} className={inputClass} />
            </Field>
            <Field label="Min players">
              <input name="min_roster" type="number" min={1} inputMode="numeric" defaultValue={settings.min_roster} className={inputClass} />
            </Field>
            <Field label="Max players">
              <input name="max_roster" type="number" min={1} inputMode="numeric" defaultValue={settings.max_roster} className={inputClass} />
            </Field>
            <Field label="Fee per team ($)" hint="0 = no fee">
              <input name="fee" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={(settings.fee_cents / 100).toString()} className={inputClass} />
            </Field>
          </div>
          <div className="mt-3 space-y-3">
            <Field label="Payment instructions" optional hint="Shown to captains when payment is pending.">
              <textarea name="payment_instructions" rows={2} defaultValue={settings.payment_instructions ?? ""} className={inputClass} />
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="require_gender" defaultChecked={settings.require_gender} className="size-5 accent-navy-900" />
              Ask players for their gender at registration
            </label>
          </div>
        </Card>

        <Card>
          <SectionTitle>Event</SectionTitle>
          <div className="space-y-3">
            <Field label="Event name">
              <input name="name" required defaultValue={event.name} className={inputClass} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Date">
                <input name="event_date" type="date" required defaultValue={event.event_date} className={inputClass} />
              </Field>
              <Field label="Start">
                <input name="start_time" type="time" defaultValue={hhmm(event.start_time)} className={inputClass} />
              </Field>
              <Field label="End">
                <input name="end_time" type="time" defaultValue={hhmm(event.end_time)} className={inputClass} />
              </Field>
            </div>
            <Field label="Venue" optional>
              <input name="venue" defaultValue={event.venue ?? ""} className={inputClass} />
            </Field>
            <Field label="Format" optional>
              <input name="format_label" defaultValue={event.format_label ?? ""} placeholder="4-Way Round Robin" className={inputClass} />
            </Field>
            <Field label="Tagline" optional>
              <input name="tagline" defaultValue={event.tagline ?? ""} className={inputClass} />
            </Field>
          </div>
        </Card>

        <SubmitButton size="lg" full pendingText="Saving…">
          Save settings
        </SubmitButton>
      </ActionForm>

      <Card>
        <SectionTitle>Organisers</SectionTitle>
        <p className="mb-3 text-sm text-muted">Give a co-organiser access. They must have signed in once first.</p>
        <ActionForm action={adminSetRole} resetOnSuccess className="space-y-3">
          <input name="email" type="email" required placeholder="their@email.com" className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <SubmitButton name="role" value="admin">
              Make organiser
            </SubmitButton>
            <SubmitButton name="role" value="player" variant="danger">
              Remove organiser
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
