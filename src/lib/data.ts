import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminNote,
  DirectoryPlayer,
  EventRow,
  EventSettings,
  JoinRequest,
  Notification,
  Player,
  PlayerPrivate,
  Position,
  Profile,
  RegistrationPayment,
  TeamInvitation,
  TeamMember,
  TeamOverview,
} from "@/lib/types";

// Every read goes through the user's own Supabase session, so Row Level
// Security decides what comes back (e.g. contact details only for captains
// and organisers). Queries stay to plain selects on tables and views.

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return res.data as T;
}

export interface EventContext {
  event: EventRow;
  settings: EventSettings;
  positions: Position[];
}

export const getEventContext = cache(async (): Promise<EventContext | null> => {
  const supabase = await createClient();
  const event = must(
    await supabase.from("events").select("*").eq("is_active", true).maybeSingle<EventRow>(),
    "event"
  );
  if (!event) return null;
  const [settings, positions] = await Promise.all([
    supabase.from("event_settings").select("*").eq("event_id", event.id).single<EventSettings>(),
    supabase.from("positions").select("*").eq("sport", event.sport).order("sort_order"),
  ]);
  return {
    event,
    settings: must(settings, "event settings"),
    positions: must(positions, "positions") as Position[],
  };
});

export interface Viewer {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  player: Player | null;
  membership: TeamMember | null;
  unread: number;
}

/** The signed-in user and their player profile for the active event. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const ctx = await getEventContext();

  const [profileRes, playerRes, unreadRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    ctx
      ? supabase.from("players").select("*").eq("event_id", ctx.event.id).eq("user_id", user.id).maybeSingle<Player>()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("notifications").select("id").eq("user_id", user.id).is("read_at", null),
  ]);
  const profile = must(profileRes, "profile");
  const player = must(playerRes, "player") as Player | null;

  let membership: TeamMember | null = null;
  if (player) {
    membership = must(
      await supabase.from("team_members").select("*").eq("player_id", player.id).maybeSingle<TeamMember>(),
      "membership"
    );
  }

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? null,
    isAdmin: profile?.role === "admin",
    player,
    membership,
    unread: (unreadRes.data ?? []).length,
  };
});

export async function getTeams(eventId: string): Promise<TeamOverview[]> {
  const supabase = await createClient();
  return must(
    await supabase.from("team_overview").select("*").eq("event_id", eventId).order("created_at"),
    "teams"
  ) as TeamOverview[];
}

export async function getTeam(teamId: string): Promise<TeamOverview | null> {
  if (!isUuid(teamId)) return null;
  const supabase = await createClient();
  return must(
    await supabase.from("team_overview").select("*").eq("id", teamId).maybeSingle<TeamOverview>(),
    "team"
  );
}

export async function getRoster(teamId: string): Promise<(DirectoryPlayer & { role: "captain" | "player" })[]> {
  const supabase = await createClient();
  const [players, members] = await Promise.all([
    supabase.from("player_directory").select("*").eq("team_id", teamId),
    supabase.from("team_members").select("*").eq("team_id", teamId),
  ]);
  const roles = new Map((must(members, "roster") as TeamMember[]).map((m) => [m.player_id, m]));
  return (must(players, "roster") as DirectoryPlayer[])
    .map((p) => ({ ...p, role: roles.get(p.id)?.role ?? "player" }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "captain" ? -1 : 1;
      return (roles.get(a.id)?.created_at ?? "").localeCompare(roles.get(b.id)?.created_at ?? "");
    });
}

export async function getDirectory(eventId: string): Promise<DirectoryPlayer[]> {
  const supabase = await createClient();
  return must(
    await supabase.from("player_directory").select("*").eq("event_id", eventId).order("created_at"),
    "players"
  ) as DirectoryPlayer[];
}

/** Player Pool: registered, no team, and still looking. */
export async function getPool(eventId: string): Promise<DirectoryPlayer[]> {
  const supabase = await createClient();
  return must(
    await supabase
      .from("player_directory")
      .select("*")
      .eq("event_id", eventId)
      .eq("is_free_agent", true)
      .eq("looking_for_team", true)
      .order("created_at", { ascending: false }),
    "player pool"
  ) as DirectoryPlayer[];
}

export async function getPlayersByIds(ids: string[]): Promise<DirectoryPlayer[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  return must(await supabase.from("player_directory").select("*").in("id", ids), "players") as DirectoryPlayer[];
}

/** Contact details the viewer is allowed to see (RLS filters the rest out). */
export async function getContacts(playerIds: string[]): Promise<Map<string, PlayerPrivate>> {
  if (playerIds.length === 0) return new Map();
  const supabase = await createClient();
  const rows = must(
    await supabase.from("player_private").select("*").in("player_id", playerIds),
    "contacts"
  ) as PlayerPrivate[];
  return new Map(rows.map((r) => [r.player_id, r]));
}

export async function getTeamRequests(teamId: string, status?: string): Promise<JoinRequest[]> {
  const supabase = await createClient();
  let q = supabase.from("join_requests").select("*").eq("team_id", teamId);
  if (status) q = q.eq("status", status);
  return must(await q.order("created_at"), "join requests") as JoinRequest[];
}

export async function getTeamInvitations(teamId: string, status?: string): Promise<TeamInvitation[]> {
  const supabase = await createClient();
  let q = supabase.from("team_invitations").select("*").eq("team_id", teamId);
  if (status) q = q.eq("status", status);
  return must(await q.order("created_at"), "invitations") as TeamInvitation[];
}

export async function getMyRequests(playerId: string): Promise<JoinRequest[]> {
  const supabase = await createClient();
  return must(
    await supabase.from("join_requests").select("*").eq("player_id", playerId).order("created_at", { ascending: false }).limit(20),
    "your requests"
  ) as JoinRequest[];
}

export async function getMyInvitations(playerId: string): Promise<TeamInvitation[]> {
  const supabase = await createClient();
  return must(
    await supabase.from("team_invitations").select("*").eq("player_id", playerId).order("created_at", { ascending: false }).limit(20),
    "your invitations"
  ) as TeamInvitation[];
}

export async function getTeamsByIds(ids: string[]): Promise<Map<string, TeamOverview>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const rows = must(await supabase.from("team_overview").select("*").in("id", ids), "teams") as TeamOverview[];
  return new Map(rows.map((t) => [t.id, t]));
}

export async function getInviteCode(teamId: string): Promise<string | null> {
  const supabase = await createClient();
  const row = must(
    await supabase.from("team_secrets").select("invite_code").eq("team_id", teamId).maybeSingle<{ invite_code: string }>(),
    "invite link"
  );
  return row?.invite_code ?? null;
}

export async function getPayment(teamId: string): Promise<RegistrationPayment | null> {
  const supabase = await createClient();
  return must(
    await supabase.from("registration_payments").select("*").eq("team_id", teamId).maybeSingle<RegistrationPayment>(),
    "payment"
  );
}

export async function getPayments(): Promise<Map<string, RegistrationPayment>> {
  const supabase = await createClient();
  const rows = must(await supabase.from("registration_payments").select("*"), "payments") as RegistrationPayment[];
  return new Map(rows.map((p) => [p.team_id, p]));
}

export async function getNotes(filter: { teamId?: string; playerId?: string }): Promise<AdminNote[]> {
  const supabase = await createClient();
  let q = supabase.from("admin_notes").select("*");
  if (filter.teamId) q = q.eq("team_id", filter.teamId);
  if (filter.playerId) q = q.eq("player_id", filter.playerId);
  return must(await q.order("created_at", { ascending: false }), "notes") as AdminNote[];
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const supabase = await createClient();
  return must(
    await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    "notifications"
  ) as Notification[];
}

export async function getInviteTeam(code: string): Promise<{ team_id: string; team_name: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_for_invite_code", { p_code: code });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { team_id: string; team_name: string }[];
  return rows[0] ?? null;
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
