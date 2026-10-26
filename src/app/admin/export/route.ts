import { NextResponse } from "next/server";
import { getContacts, getDirectory, getEventContext, getPayments, getTeams, getViewer } from "@/lib/data";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return new NextResponse("Not found", { status: 404 });
  const ctx = await getEventContext();
  if (!ctx) return new NextResponse("No active event", { status: 404 });

  const [teams, players, payments] = await Promise.all([getTeams(ctx.event.id), getDirectory(ctx.event.id), getPayments()]);
  const contacts = await getContacts(players.map((p) => p.id));
  const posLabel = new Map(ctx.positions.map((p) => [p.code, p.label]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const header = [
    "Team", "Team status", "Reserved slot", "Payment", "Role", "Full name", "Display name", "Graduating year",
    "Primary position", "Secondary position", "Mobile", "Email", "Gender", "Experience", "Note",
  ];
  const rows = players
    .map((p) => {
      const t = p.team_id ? teamById.get(p.team_id) : undefined;
      const c = contacts.get(p.id);
      return [
        t?.name ?? "(Player Pool)",
        t?.status ?? "",
        t?.is_reserved ? "yes" : "",
        t ? (payments.get(t.id)?.status ?? "") : "",
        t ? (t.captain_player_id === p.id ? "Captain" : "Player") : "",
        c?.full_name ?? "",
        p.display_name,
        p.grad_year,
        posLabel.get(p.primary_position) ?? p.primary_position,
        p.secondary_position ? (posLabel.get(p.secondary_position) ?? p.secondary_position) : "",
        c?.mobile ?? "",
        c?.email ?? "",
        c?.gender ?? "",
        p.experience ?? "",
        p.note ?? "",
      ];
    })
    .sort(
      (a, b) =>
        String(a[0]).localeCompare(String(b[0])) ||
        Number(b[4] === "Captain") - Number(a[4] === "Captain") ||
        String(a[5]).localeCompare(String(b[5]))
    );

  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ctx.event.slug}-rosters.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
