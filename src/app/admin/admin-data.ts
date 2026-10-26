import "server-only";
import { getDirectory, getPayments, getTeams } from "@/lib/data";
import { isWaitlistTeam, slotSummary } from "@/lib/status";
import type { DirectoryPlayer, EventSettings, RegistrationPayment, TeamOverview } from "@/lib/types";

export type TeamFilter = "all" | "incomplete" | "pending" | "confirmed" | "waitlist" | "withdrawn";

export const TEAM_FILTERS: { key: TeamFilter; label: string }[] = [
  { key: "all", label: "All Teams" },
  { key: "incomplete", label: "Incomplete" },
  { key: "pending", label: "Pending Approval" },
  { key: "confirmed", label: "Confirmed" },
  { key: "waitlist", label: "Waitlist" },
  { key: "withdrawn", label: "Withdrawn" },
];

export interface AdminOverview {
  teams: TeamOverview[];
  players: DirectoryPlayer[];
  payments: Map<string, RegistrationPayment>;
}

export async function loadOverview(eventId: string): Promise<AdminOverview> {
  const [teams, players, payments] = await Promise.all([getTeams(eventId), getDirectory(eventId), getPayments()]);
  return { teams, players, payments };
}

export function filterTeams(teams: TeamOverview[], settings: EventSettings, filter: TeamFilter): TeamOverview[] {
  const slots = slotSummary(settings, teams);
  switch (filter) {
    case "incomplete":
      return teams.filter((t) => t.status !== "withdrawn" && t.member_count < settings.min_roster);
    case "pending":
      return teams.filter((t) => t.status === "admin_review" || t.status === "payment_pending");
    case "confirmed":
      return teams.filter((t) => t.status === "confirmed");
    case "waitlist":
      return teams.filter((t) => isWaitlistTeam(t, slots));
    case "withdrawn":
      return teams.filter((t) => t.status === "withdrawn");
    default:
      return teams.filter((t) => t.status !== "withdrawn");
  }
}

/** Fee is outstanding for an active team whose payment row is unpaid. */
export function feesOutstanding(teams: TeamOverview[], payments: Map<string, RegistrationPayment>): TeamOverview[] {
  return teams.filter((t) => t.status !== "withdrawn" && payments.get(t.id)?.status === "unpaid");
}
