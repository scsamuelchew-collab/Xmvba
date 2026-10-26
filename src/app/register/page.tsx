import type { Metadata } from "next";
import { registerPlayer } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ChoiceGroup } from "@/components/choice";
import { Card, Field, inputClass, Notice, PageTitle } from "@/components/ui";
import { getContacts } from "@/lib/data";
import { requireEvent, requireViewer } from "@/lib/guards";

export const metadata: Metadata = { title: "Player registration" };

const LEVELS = ["Casual / social", "Played in school", "Club / league", "Competitive (varsity / national)"];

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "";
  const { event, settings, positions } = await requireEvent();
  const viewer = await requireViewer(`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  const player = viewer.player;
  const contact = player ? (await getContacts([player.id])).get(player.id) : undefined;
  const editing = !!player;
  const thisYear = new Date().getFullYear();

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle eyebrow={event.name} title={editing ? "Your player profile" : "Join the Player Pool"}>
        {editing
          ? "Keep this up to date so captains know where you play."
          : "Tell us where you play. Captains browse the Player Pool and can invite you — you can also request to join any team."}
      </PageTitle>

      {!editing && !settings.registration_open && (
        <div className="mb-4">
          <Notice tone="red">Registration is closed for this event.</Notice>
        </div>
      )}

      <Card>
        <ActionForm action={registerPlayer} className="space-y-5">
          <input type="hidden" name="next" value={next} />

          <fieldset className="space-y-4">
            <legend className="mb-2 font-display text-lg font-bold uppercase text-navy-900">About you</legend>
            <Field label="Full name">
              <input name="full_name" required autoComplete="name" defaultValue={contact?.full_name ?? ""} className={inputClass} />
            </Field>
            <Field label="Name shown on team pages" optional hint="Defaults to your first name. Only this, your year and positions are public.">
              <input name="display_name" autoComplete="nickname" maxLength={40} defaultValue={player?.display_name ?? ""} placeholder="e.g. Wei Ming" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mobile number">
                <input name="mobile" type="tel" required inputMode="tel" autoComplete="tel" placeholder="9123 4567" defaultValue={contact?.mobile ?? ""} className={inputClass} />
              </Field>
              <Field label="Graduating year">
                <input
                  name="grad_year"
                  type="number"
                  required
                  inputMode="numeric"
                  min={1960}
                  max={thisYear}
                  placeholder="e.g. 2010"
                  defaultValue={player?.grad_year ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Email">
              <input name="email" type="email" inputMode="email" autoComplete="email" defaultValue={contact?.email ?? viewer.email ?? ""} className={inputClass} />
            </Field>
            {settings.require_gender && (
              <Field label="Gender">
                <ChoiceGroup
                  name="gender"
                  required
                  defaultValue={contact?.gender}
                  options={[
                    { value: "Male", label: "Male" },
                    { value: "Female", label: "Female" },
                  ]}
                />
              </Field>
            )}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-2 font-display text-lg font-bold uppercase text-navy-900">Volleyball</legend>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-navy-900">Primary position</p>
              <ChoiceGroup
                name="primary_position"
                required
                columns={3}
                defaultValue={player?.primary_position}
                options={positions.map((p) => ({ value: p.code, label: p.label }))}
              />
            </div>
            <Field label="Secondary position" optional>
              <select name="secondary_position" defaultValue={player?.secondary_position ?? ""} className={inputClass}>
                <option value="">None</option>
                {positions.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Playing level / experience" optional>
              <select name="experience" defaultValue={player?.experience ?? ""} className={inputClass}>
                <option value="">Prefer not to say</option>
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-2 font-display text-lg font-bold uppercase text-navy-900">Team</legend>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-navy-900">Do you already have a team?</p>
              <ChoiceGroup
                name="has_team"
                required
                defaultValue={player ? (player.has_team ? "yes" : "no") : null}
                options={[
                  { value: "no", label: "No — put me in the Player Pool" },
                  { value: "yes", label: "Yes, I have a team" },
                ]}
              />
              <p className="mt-1 text-xs text-muted">
                Have a team? After this, open your captain’s invite link, or find your team under Teams and request to join.
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-navy-900">Happy to play with alumni from other graduating years?</p>
              <ChoiceGroup
                name="open_to_mixed"
                required
                defaultValue={player ? (player.open_to_mixed ? "yes" : "no") : "yes"}
                options={[
                  { value: "yes", label: "Yes, any batch" },
                  { value: "no", label: "Prefer my own batch" },
                ]}
              />
            </div>
            {player?.has_team && (
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" name="looking" defaultChecked={player.looking_for_team} className="size-5 accent-navy-900" />
                Still show me in the Player Pool while I’m not on a team
              </label>
            )}
            <Field label="Short note" optional hint="e.g. “Usually play OH but can cover opposite.”">
              <textarea name="note" rows={2} maxLength={280} defaultValue={player?.note ?? ""} className={inputClass} />
            </Field>
          </fieldset>

          <SubmitButton size="lg" full pendingText="Saving…">
            {editing ? "Save profile" : "Register"}
          </SubmitButton>
          <p className="text-center text-xs text-muted">
            Your mobile and email are only visible to organisers and the captain of a team you join or apply to.
          </p>
        </ActionForm>
      </Card>
    </div>
  );
}
