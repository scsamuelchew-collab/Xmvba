import type { EventRow, Position } from "./types.ts";

export function formatEventDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

export function formatWeekday(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-SG", { weekday: "long" });
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatTimeRange(event: Pick<EventRow, "start_time" | "end_time">): string | null {
  if (!event.start_time) return null;
  return event.end_time ? `${formatTime(event.start_time)}–${formatTime(event.end_time)}` : formatTime(event.start_time);
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function formatAgo(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

export function positionLabeler(positions: Position[]) {
  const byCode = new Map(positions.map((p) => [p.code, p]));
  return (code: string | null | undefined): string => (code ? (byCode.get(code)?.label ?? code) : "");
}

/** "1 Setter", "2 Flexible Players" style lines for a team's needs. */
export function needsLines(needs: Record<string, number>, positions: Position[]): string[] {
  return positions
    .filter((p) => (needs[p.code] ?? 0) > 0)
    .map((p) => {
      const n = needs[p.code];
      const label = p.is_flexible ? "Flexible Player" : p.label;
      return `${n} ${label}${n > 1 ? "s" : ""}`;
    });
}

/** WhatsApp share link — the main way this app travels. */
export function whatsappShare(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Normalise a phone number into a wa.me chat link (Singapore default). */
export function whatsappChat(mobile: string): string {
  let digits = mobile.replace(/[^0-9]/g, "");
  if (digits.length === 8) digits = `65${digits}`;
  return `https://wa.me/${digits}`;
}
