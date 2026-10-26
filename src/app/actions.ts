"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEventContext } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// Every mutation calls a database function. The function checks who is
// calling and enforces the rules, so these actions stay thin: read the form,
// call the function, refresh the pages.

type Args = Record<string, unknown>;

async function call(fn: string, args: Args): Promise<{ data: unknown; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: error.message };
  revalidatePath("/", "layout");
  return { data, error: null };
}

async function run(fn: string, args: Args, ok: string): Promise<ActionResult> {
  const { error } = await call(fn, args);
  return error ? { error } : { ok };
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}

function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "yes";
}

function int(fd: FormData, key: string, fallback = 0): number {
  const n = parseInt(str(fd, key), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Position counts from `need_<code>` inputs → {"setter": 1, ...}. */
function needs(fd: FormData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("need_") || typeof v !== "string") continue;
    const n = parseInt(v, 10);
    if (n > 0) out[k.slice(5)] = Math.min(n, 12);
  }
  return out;
}

/** Only same-site relative paths are allowed as post-login destinations. */
function safeNext(next: string | null | undefined, fallback = "/me"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

async function activeEventId(): Promise<string> {
  const ctx = await getEventContext();
  if (!ctx) throw new Error("No active event.");
  return ctx.event.id;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signInWithEmail(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = str(fd, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
  const next = safeNext(optStr(fd, "next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.message };
  return { ok: `Check ${email} — we've sent you a sign-in link. Open it on this phone.` };
}

export async function signInWithGoogle(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const next = safeNext(optStr(fd, "next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) return { error: error?.message ?? "Google sign-in is not available right now." };
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export async function registerPlayer(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const fullName = str(fd, "full_name");
  const { error } = await call("register_player", {
    p_event: await activeEventId(),
    p_full_name: fullName,
    p_display_name: str(fd, "display_name") || fullName.split(/\s+/)[0],
    p_mobile: str(fd, "mobile"),
    p_email: optStr(fd, "email"),
    p_gender: optStr(fd, "gender"),
    p_grad_year: int(fd, "grad_year"),
    p_primary: str(fd, "primary_position"),
    p_secondary: optStr(fd, "secondary_position"),
    p_experience: optStr(fd, "experience"),
    p_has_team: str(fd, "has_team") === "yes",
    p_open_to_mixed: str(fd, "open_to_mixed") !== "no",
    p_looking: str(fd, "has_team") !== "yes" || bool(fd, "looking"),
    p_note: optStr(fd, "note"),
  });
  if (error) return { error };
  redirect(safeNext(optStr(fd, "next"), "/me?registered=1"));
}

export async function setLookingForTeam(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const looking = bool(fd, "looking");
  return run(
    "set_looking_for_team",
    { p_event: await activeEventId(), p_looking: looking },
    looking ? "You're visible in the Player Pool." : "You're hidden from the Player Pool."
  );
}

export async function requestToJoin(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(
    "request_to_join",
    { p_team: str(fd, "team_id"), p_message: optStr(fd, "message") },
    "Request sent! The captain will accept or reject it — check My Lobby for updates."
  );
}

export async function cancelJoinRequest(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("cancel_join_request", { p_request: str(fd, "request_id") }, "Request withdrawn.");
}

export async function respondInvitation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const accept = str(fd, "decision") === "accept";
  return run(
    "respond_invitation",
    { p_invitation: str(fd, "invitation_id"), p_accept: accept },
    accept ? "Welcome to the team!" : "Invitation declined."
  );
}

export async function joinWithInviteCode(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { data, error } = await call("join_with_invite_code", { p_code: str(fd, "code") });
  if (error) return { error };
  redirect(`/teams/${data as string}?joined=1`);
}

export async function leaveTeam(_prev: ActionResult, _fd: FormData): Promise<ActionResult> {
  return run("leave_team", { p_event: await activeEventId() }, "You've left the team and are back in the Player Pool.");
}

export async function markNotificationsRead(_prev: ActionResult, _fd: FormData): Promise<ActionResult> {
  return run("mark_notifications_read", {}, "All caught up.");
}

// ---------------------------------------------------------------------------
// Captain
// ---------------------------------------------------------------------------

export async function createTeam(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!bool(fd, "acknowledge"))
    return { error: "Please tick the box to confirm you understand creating a team doesn't secure a slot." };
  const { data, error } = await call("create_team", {
    p_event: await activeEventId(),
    p_name: str(fd, "name"),
    p_description: optStr(fd, "description"),
    p_approx_batch: optStr(fd, "approx_batch"),
    p_mixed: str(fd, "mixed_batch") !== "no",
    p_existing: int(fd, "existing_players", 1),
    p_needs: needs(fd),
  });
  if (error) return { error };
  redirect(`/teams/${data as string}/manage?created=1`);
}

export async function updateTeam(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(
    "update_team",
    {
      p_team: str(fd, "team_id"),
      p_name: str(fd, "name"),
      p_description: optStr(fd, "description"),
      p_approx_batch: optStr(fd, "approx_batch"),
      p_mixed: str(fd, "mixed_batch") !== "no",
      p_recruiting: str(fd, "recruiting") !== "no",
      p_needs: needs(fd),
    },
    "Team updated."
  );
}

export async function respondJoinRequest(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const accept = str(fd, "decision") === "accept";
  return run(
    "respond_join_request",
    { p_request: str(fd, "request_id"), p_accept: accept },
    accept ? "Player added to your roster." : "Request rejected."
  );
}

export async function invitePlayer(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(
    "invite_player",
    { p_team: str(fd, "team_id"), p_player: str(fd, "player_id"), p_message: optStr(fd, "message") },
    "Invitation sent."
  );
}

export async function cancelInvitation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("cancel_invitation", { p_invitation: str(fd, "invitation_id") }, "Invitation cancelled.");
}

export async function regenerateInviteCode(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("regenerate_invite_code", { p_team: str(fd, "team_id") }, "New invite link created. The old link no longer works.");
}

export async function removeMember(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("remove_member", { p_team: str(fd, "team_id"), p_player: str(fd, "player_id") }, "Player removed.");
}

export async function transferCaptaincy(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(
    "transfer_captaincy",
    { p_team: str(fd, "team_id"), p_player: str(fd, "player_id") },
    "Captaincy handed over."
  );
}

export async function disbandTeam(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { error } = await call("disband_team", { p_team: str(fd, "team_id") });
  if (error) return { error };
  redirect("/me");
}

export async function submitTeam(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { data, error } = await call("submit_team", { p_team: str(fd, "team_id") });
  if (error) return { error };
  const status = data as string;
  if (status === "waitlist")
    return { ok: "Submitted. Both open slots are already taken, so your team is on the waitlist." };
  if (status === "payment_pending") return { ok: "Submitted! Next step: pay the registration fee." };
  return { ok: "Submitted! The organiser will review your team." };
}

// ---------------------------------------------------------------------------
// Organiser
// ---------------------------------------------------------------------------

export async function adminTeamAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const team = str(fd, "team_id");
  switch (str(fd, "op")) {
    case "confirm":
      return run("admin_confirm_team", { p_team: team }, "Team confirmed — slot secured.");
    case "reject":
      return run("admin_reject_team", { p_team: team, p_reason: optStr(fd, "reason") }, "Team sent back to the captain.");
    case "waitlist":
      return run("admin_waitlist_team", { p_team: team }, "Team moved to the waitlist.");
    case "promote":
      return run("admin_promote_team", { p_team: team }, "Team promoted off the waitlist.");
    case "withdraw":
      return run(
        "admin_withdraw_team",
        { p_team: team, p_release_players: bool(fd, "release") },
        "Team withdrawn."
      );
    case "reopen":
      return run("admin_reopen_team", { p_team: team }, "Team reopened as forming.");
    case "lock":
      return run("admin_set_roster_lock", { p_team: team, p_locked: true }, "Roster locked.");
    case "unlock":
      return run("admin_set_roster_lock", { p_team: team, p_locked: false }, "Roster unlocked.");
    case "reserve":
      return run("admin_set_reserved", { p_team: team, p_reserved: true }, "Team holds the reserved slot.");
    case "unreserve":
      return run("admin_set_reserved", { p_team: team, p_reserved: false }, "Reserved slot released.");
    case "payment":
      return run(
        "admin_set_payment",
        { p_team: team, p_status: str(fd, "payment_status"), p_reference: optStr(fd, "reference") },
        "Payment status updated."
      );
    default:
      return { error: "Unknown action." };
  }
}

export async function adminTransferPlayer(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const to = optStr(fd, "to_team");
  return run(
    "admin_transfer_player",
    { p_player: str(fd, "player_id"), p_to_team: to === "pool" ? null : to },
    to === "pool" ? "Player moved to the Player Pool." : "Player transferred."
  );
}

export async function adminAddNote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(
    "admin_add_note",
    {
      p_event: await activeEventId(),
      p_team: optStr(fd, "team_id"),
      p_player: optStr(fd, "player_id"),
      p_body: str(fd, "body"),
    },
    "Note saved."
  );
}

export async function adminDeleteNote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("admin_delete_note", { p_note: str(fd, "note_id") }, "Note deleted.");
}

export async function adminUpdateSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const event = await activeEventId();
  const ev = await call("admin_update_event", {
    p_event: event,
    p_name: str(fd, "name"),
    p_event_date: str(fd, "event_date"),
    p_start_time: optStr(fd, "start_time"),
    p_end_time: optStr(fd, "end_time"),
    p_venue: optStr(fd, "venue"),
    p_format_label: optStr(fd, "format_label"),
    p_tagline: optStr(fd, "tagline"),
  });
  if (ev.error) return { error: ev.error };
  const fee = Math.round(parseFloat(str(fd, "fee") || "0") * 100);
  return run(
    "admin_update_settings",
    {
      p_event: event,
      p_open_slots: int(fd, "open_slots"),
      p_reserved_slots: int(fd, "reserved_slots"),
      p_other_slots: int(fd, "other_slots"),
      p_min_roster: int(fd, "min_roster", 10),
      p_max_roster: int(fd, "max_roster", 12),
      p_registration_open: str(fd, "registration_open") === "open",
      p_fee_cents: Number.isFinite(fee) ? fee : 0,
      p_payment_instructions: optStr(fd, "payment_instructions"),
      p_require_gender: bool(fd, "require_gender"),
    },
    "Settings saved."
  );
}

export async function adminSetRole(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const role = str(fd, "role") === "admin" ? "admin" : "player";
  return run(
    "admin_set_role",
    { p_email: str(fd, "email"), p_role: role },
    role === "admin" ? "Organiser access granted." : "Organiser access removed."
  );
}
