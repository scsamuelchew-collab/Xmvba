// Row shapes for the tables and views in supabase/migrations.

export type TeamStatus =
  | "forming"
  | "payment_pending"
  | "admin_review"
  | "confirmed"
  | "waitlist"
  | "rejected"
  | "withdrawn";

export type RequestStatus = "pending" | "accepted" | "rejected" | "cancelled";
export type PaymentStatus = "not_required" | "unpaid" | "paid" | "waived";
export type UserRole = "player" | "admin";

export interface EventRow {
  id: string;
  slug: string;
  name: string;
  sport: string;
  event_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  venue: string | null;
  format_label: string | null;
  tagline: string | null;
  is_active: boolean;
}

export interface EventSettings {
  event_id: string;
  open_slots: number;
  reserved_slots: number;
  reserved_label: string;
  other_slots: number;
  other_slots_label: string;
  min_roster: number;
  max_roster: number;
  registration_open: boolean;
  fee_cents: number;
  payment_instructions: string | null;
  require_gender: boolean;
}

export interface Position {
  code: string;
  sport: string;
  label: string;
  short_label: string;
  sort_order: number;
  guide_min: number | null;
  guide_max: number | null;
  is_flexible: boolean;
}

export interface Profile {
  id: string;
  email: string | null;
  role: UserRole;
}

export interface Player {
  id: string;
  event_id: string;
  user_id: string;
  display_name: string;
  grad_year: number;
  primary_position: string;
  secondary_position: string | null;
  experience: string | null;
  has_team: boolean;
  open_to_mixed: boolean;
  looking_for_team: boolean;
  note: string | null;
  created_at: string;
}

/** `player_directory` view: player + their team, if any. */
export interface DirectoryPlayer extends Player {
  team_id: string | null;
  team_name: string | null;
  is_free_agent: boolean;
}

export interface PlayerPrivate {
  player_id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  gender: string | null;
}

/** `team_overview` view. */
export interface TeamOverview {
  id: string;
  event_id: string;
  name: string;
  captain_player_id: string;
  description: string | null;
  approx_batch: string | null;
  mixed_batch: boolean;
  declared_existing_players: number;
  recruiting: boolean;
  status: TeamStatus;
  roster_locked: boolean;
  is_reserved: boolean;
  submitted_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  captain_name: string;
  captain_grad_year: number;
  member_count: number;
  needs: Record<string, number>;
}

export interface TeamMember {
  id: string;
  team_id: string;
  player_id: string;
  role: "captain" | "player";
  created_at: string;
}

export interface JoinRequest {
  id: string;
  team_id: string;
  player_id: string;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
}

export interface TeamInvitation {
  id: string;
  team_id: string;
  player_id: string;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
}

export interface RegistrationPayment {
  team_id: string;
  amount_cents: number;
  status: PaymentStatus;
  reference: string | null;
  paid_at: string | null;
}

export interface AdminNote {
  id: string;
  team_id: string | null;
  player_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type ActionResult = { ok?: string; error?: string } | null;
