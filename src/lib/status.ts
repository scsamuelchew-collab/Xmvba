// Pure rules for how teams and slots are presented. The database enforces the
// rules; this file only decides labels, so it is safe to unit test in isolation.

import type { EventSettings, TeamOverview, TeamStatus } from "./types.ts";

export type Tone = "green" | "blue" | "amber" | "red" | "grey" | "navy" | "gold";

type TeamLike = Pick<
  TeamOverview,
  "status" | "member_count" | "recruiting" | "is_reserved" | "submitted_at" | "roster_locked"
>;
type SettingsLike = Pick<
  EventSettings,
  "open_slots" | "min_roster" | "max_roster" | "registration_open" | "fee_cents"
>;

export interface SlotSummary {
  open: number;
  used: number;
  remaining: number;
  full: boolean;
}

/** Open alumni slots: confirmed non-reserved teams use them up. */
export function slotSummary(settings: Pick<EventSettings, "open_slots">, teams: TeamLike[]): SlotSummary {
  const used = teams.filter((t) => t.status === "confirmed" && !t.is_reserved).length;
  const remaining = Math.max(0, settings.open_slots - used);
  return { open: settings.open_slots, used, remaining, full: remaining === 0 };
}

/**
 * A team is a waitlist team when the organiser put it there, or when it is
 * still in play but every open slot has gone to someone else.
 */
export function isWaitlistTeam(team: TeamLike, slots: SlotSummary): boolean {
  if (team.status === "waitlist") return true;
  if (!slots.full || team.is_reserved) return false;
  return ["forming", "payment_pending", "admin_review", "rejected"].includes(team.status);
}

export interface StatusLabel {
  label: string;
  tone: Tone;
}

export function teamStatusLabel(team: TeamLike, settings: SettingsLike): StatusLabel {
  switch (team.status) {
    case "confirmed":
      return { label: "Confirmed", tone: "green" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "grey" };
    case "waitlist":
      return { label: "Waitlist", tone: "amber" };
    case "admin_review":
      return { label: "Pending Admin Approval", tone: "blue" };
    case "payment_pending":
      return { label: "Payment Pending", tone: "blue" };
    case "rejected":
      return { label: "Changes Needed", tone: "red" };
    case "forming":
      if (!settings.registration_open) return { label: "Registration Closed", tone: "grey" };
      if (team.member_count >= settings.max_roster) return { label: "Full", tone: "navy" };
      if (team.member_count >= settings.min_roster) return { label: "Minimum Reached", tone: "gold" };
      if (!team.recruiting) return { label: "Not Recruiting", tone: "grey" };
      return { label: "Looking for Players", tone: "amber" };
  }
}

export const STAGES = [
  "Forming Team",
  "Minimum Players Reached",
  "Registration Submitted",
  "Payment Pending",
  "Admin Review",
  "Confirmed",
] as const;

/** Index into STAGES of the stage the team is currently at. */
export function currentStage(team: TeamLike, settings: SettingsLike): number {
  const s: TeamStatus = team.status;
  if (s === "confirmed") return 5;
  if (s === "admin_review") return 4;
  if (s === "payment_pending") return 3;
  if (team.submitted_at && (s === "waitlist" || s === "rejected")) return 2;
  if (team.member_count >= settings.min_roster) return 1;
  return 0;
}

export interface JoinCheck {
  ok: boolean;
  reason?: string;
}

/** Mirrors the database's checks so the UI can explain a disabled button. */
export function canRequestToJoin(team: TeamLike, settings: SettingsLike): JoinCheck {
  if (!settings.registration_open) return { ok: false, reason: "Registration closed" };
  if (team.status === "withdrawn") return { ok: false, reason: "Team withdrawn" };
  if (team.member_count >= settings.max_roster) return { ok: false, reason: "Team full" };
  if (team.roster_locked) return { ok: false, reason: "Roster locked" };
  if (!team.recruiting) return { ok: false, reason: "Not recruiting" };
  return { ok: true };
}

export function canSubmit(team: TeamLike, settings: SettingsLike): JoinCheck {
  if (team.status !== "forming" && team.status !== "rejected")
    return { ok: false, reason: "Already submitted" };
  if (team.member_count < settings.min_roster)
    return { ok: false, reason: `Need ${settings.min_roster - team.member_count} more player(s)` };
  if (team.member_count > settings.max_roster)
    return { ok: false, reason: `Over the ${settings.max_roster}-player limit` };
  if (!settings.registration_open) return { ok: false, reason: "Registration closed" };
  return { ok: true };
}

/** Total players still wanted per the team's "looking for" list. */
export function totalNeeded(needs: Record<string, number>): number {
  return Object.values(needs).reduce((a, b) => a + b, 0);
}

/** Rank pool players for a team: matching a needed position first. */
export function matchScore(
  needs: Record<string, number>,
  player: { primary_position: string; secondary_position: string | null }
): number {
  if (needs[player.primary_position]) return 3;
  if (player.secondary_position && needs[player.secondary_position]) return 2;
  if (needs["utility"]) return 1;
  return 0;
}
