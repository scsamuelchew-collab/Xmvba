import { formatEventDate, formatMoney, formatTimeRange, formatWeekday } from "@/lib/format";
import type { SlotSummary } from "@/lib/status";
import type { EventRow, EventSettings, Position } from "@/lib/types";
import { cx } from "./ui";

export function EventFacts({ event, settings }: { event: EventRow; settings: EventSettings }) {
  const time = formatTimeRange(event);
  const facts = [
    { k: formatWeekday(event.event_date), v: formatEventDate(event.event_date) },
    time && { k: "Time", v: time },
    event.format_label && { k: "Format", v: event.format_label },
    { k: "Open slots", v: `${settings.open_slots} Alumni Teams` },
    { k: "Roster", v: `Min ${settings.min_roster} · Max ${settings.max_roster}` },
    { k: "Batches", v: "Mixed Batches Welcome" },
  ].filter(Boolean) as { k: string; v: string }[];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {facts.map((f) => (
        <div key={f.k} className="rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-gold-400">{f.k}</dt>
          <dd className="font-display text-lg font-bold uppercase leading-tight text-white">{f.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The single most important number on the site. */
export function SlotsBanner({ slots, settings, compact }: { slots: SlotSummary; settings: EventSettings; compact?: boolean }) {
  return (
    <div
      className={cx(
        "flex items-center gap-4 rounded-2xl p-4",
        slots.full ? "bg-navy-900 text-white" : "bg-gold-500 text-navy-950"
      )}
      aria-live="polite"
    >
      <div className="font-display text-6xl font-black leading-none">{slots.remaining}</div>
      <div className="min-w-0">
        <p className="font-display text-xl font-extrabold uppercase leading-tight">
          Open Alumni Team Slot{slots.remaining === 1 ? "" : "s"} Left
        </p>
        {!compact && (
          <p className="text-sm opacity-85">
            {slots.full
              ? "All open slots are confirmed. New teams can still form and join the waitlist."
              : `${slots.used} of ${slots.open} confirmed · first ${slots.open} fully completed & approved teams secure them.`}
          </p>
        )}
      </div>
      {!compact && !settings.registration_open && (
        <span className="ml-auto rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase text-white">Registration closed</span>
      )}
    </div>
  );
}

export function SlotBreakdown({ settings }: { settings: EventSettings }) {
  const total = settings.open_slots + settings.reserved_slots + settings.other_slots;
  const rows = [
    settings.reserved_slots > 0 && { n: settings.reserved_slots, label: settings.reserved_label, note: "Reserved" },
    { n: settings.open_slots, label: "Open alumni team slots", note: "Up for grabs" },
    settings.other_slots > 0 && { n: settings.other_slots, label: settings.other_slots_label, note: "Invited" },
  ].filter(Boolean) as { n: number; label: string; note: string }[];
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{total} teams in total:</p>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-navy-900 font-display text-lg font-bold text-gold-500">{r.n}</span>
            <span className="flex-1 text-sm font-semibold text-navy-900">{r.label}</span>
            <span className="text-xs text-muted">{r.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SquadGuide({ positions, settings }: { positions: Position[]; settings: EventSettings }) {
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        A suggested shape for a {settings.min_roster}–{settings.max_roster} player squad. This is guidance only — no
        positions are required.
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {positions.map((p) => (
          <li key={p.code} className="rounded-xl border border-line bg-white px-3 py-2.5">
            <p className="font-display text-xl font-extrabold text-navy-900">
              {p.guide_min != null ? `${p.guide_min}–${p.guide_max}` : "As needed"}
            </p>
            <p className="text-sm text-muted">{p.is_flexible ? "Flexible players" : `${p.label}s`}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RulesList({ settings }: { settings: EventSettings }) {
  const rules = [
    `Minimum ${settings.min_roster} players per team`,
    `Maximum ${settings.max_roster} players per team`,
    "Players may come from different graduating batches",
    "Players may only register for one team",
    "Captain must approve incoming players",
    "Team slots are not reserved when a room is created",
    "Only completed and approved teams secure competition slots",
    settings.fee_cents > 0 && `Registration fee: ${formatMoney(settings.fee_cents)} per team`,
    "Organiser decisions are final",
    "Roster changes after confirmation require organiser approval",
  ].filter(Boolean) as string[];
  return (
    <ol className="grid gap-2">
      {rules.map((r, i) => (
        <li key={r} className="flex gap-3 rounded-xl bg-white px-3 py-2.5 text-[15px] ring-1 ring-line">
          <span className="font-display text-lg font-extrabold text-court-500">{String(i + 1).padStart(2, "0")}</span>
          <span className="text-navy-900">{r}</span>
        </li>
      ))}
    </ol>
  );
}

export const SLOT_DISCLAIMER =
  "Creating a team does not secure a competition slot. Slots are confirmed only after the team reaches the minimum roster requirement, completes registration and receives organiser approval.";
