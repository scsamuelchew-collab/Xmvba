import type { Metadata } from "next";
import Link from "next/link";
import { adminTransferPlayer } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, cx, Empty, inputClass, PageTitle } from "@/components/ui";
import { getContacts } from "@/lib/data";
import { formatAgo, positionLabeler, whatsappChat } from "@/lib/format";
import { requireAdmin, requireEvent } from "@/lib/guards";
import { loadOverview } from "../admin-data";

export const metadata: Metadata = { title: "Players · Organiser" };

export default async function AdminPlayers({ searchParams }: PageProps<"/admin/players">) {
  await requireAdmin();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = s("q").toLowerCase();
  const year = s("year");
  const pos = s("pos");
  const team = s("team") || (s("filter") === "free" ? "none" : "");

  const { event, settings, positions } = await requireEvent();
  const { teams, players } = await loadOverview(event.id);
  const contacts = await getContacts(players.map((p) => p.id));
  const label = positionLabeler(positions);
  const activeTeams = teams.filter((t) => t.status !== "withdrawn");

  const list = players.filter((p) => {
    const c = contacts.get(p.id);
    if (q && ![p.display_name, c?.full_name, c?.mobile, c?.email].some((v) => v?.toLowerCase().includes(q))) return false;
    if (year && String(p.grad_year) !== year) return false;
    if (pos && p.primary_position !== pos && p.secondary_position !== pos) return false;
    if (team === "none" && !p.is_free_agent) return false;
    if (team && team !== "none" && p.team_id !== team) return false;
    return true;
  });
  const years = [...new Set(players.map((p) => p.grad_year))].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <PageTitle title="Players">
        {list.length} of {players.length} shown.{" "}
        <Link href="/admin/players?filter=free" className="font-semibold text-navy-700 underline">
          Without a team
        </Link>{" "}
        ·{" "}
        <Link href="/admin/players?pos=setter" className="font-semibold text-navy-700 underline">
          All setters
        </Link>
      </PageTitle>

      <form className="grid gap-2 rounded-2xl border border-line bg-white p-3 sm:grid-cols-5" action="/admin/players">
        <input name="q" defaultValue={s("q")} placeholder="Name, mobile or email" className={cx(inputClass, "sm:col-span-2")} />
        <select name="year" defaultValue={year} className={inputClass} aria-label="Graduating year">
          <option value="">Any year</option>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select name="pos" defaultValue={pos} className={inputClass} aria-label="Position">
          <option value="">Any position</option>
          {positions.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
        <select name="team" defaultValue={team} className={inputClass} aria-label="Team">
          <option value="">Any team</option>
          <option value="none">No team (Player Pool)</option>
          {activeTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="min-h-12 rounded-xl bg-navy-900 font-semibold text-white sm:col-span-5">Search</button>
      </form>

      {list.length === 0 ? (
        <Empty title="No players match" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => {
            const c = contacts.get(p.id);
            const isCaptain = teams.some((t) => t.captain_player_id === p.id && t.id === p.team_id);
            return (
              <li key={p.id} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-navy-900">{c?.full_name ?? p.display_name}</p>
                    <p className="text-sm text-muted">
                      Class of {p.grad_year} · {label(p.primary_position)}
                      {p.secondary_position && ` / ${label(p.secondary_position)}`}
                    </p>
                  </div>
                  {p.team_id ? (
                    <Link href={`/admin/teams/${p.team_id}`}>
                      <Badge tone="green">{p.team_name}</Badge>
                    </Link>
                  ) : (
                    <Badge tone="amber">{p.looking_for_team ? "Player Pool" : "No team (hidden)"}</Badge>
                  )}
                </div>
                {c && (
                  <p className="mt-1 text-sm">
                    <a href={whatsappChat(c.mobile)} className="font-semibold text-emerald-700 underline" target="_blank" rel="noopener noreferrer">
                      {c.mobile}
                    </a>
                    {c.email && <span className="text-muted"> · {c.email}</span>}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {p.experience && `${p.experience} · `}
                  {p.open_to_mixed ? "Open to mixed batches" : "Prefers own batch"} · registered {formatAgo(p.created_at)}
                </p>
                {p.note && <p className="mt-2 text-sm italic text-navy-900">“{p.note}”</p>}
                {!isCaptain && (
                  <ActionForm action={adminTransferPlayer} className="mt-3 flex gap-2">
                    <input type="hidden" name="player_id" value={p.id} />
                    <select name="to_team" required defaultValue="" className={cx(inputClass, "flex-1")} aria-label="Move to">
                      <option value="" disabled>
                        {p.team_id ? "Move to…" : "Add to team…"}
                      </option>
                      {p.team_id && <option value="pool">Player Pool (remove from team)</option>}
                      {activeTeams
                        .filter((t) => t.id !== p.team_id)
                        .map((t) => (
                          <option key={t.id} value={t.id} disabled={t.member_count >= settings.max_roster}>
                            {t.name} ({t.member_count}/{settings.max_roster})
                          </option>
                        ))}
                    </select>
                    <SubmitButton>Go</SubmitButton>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
