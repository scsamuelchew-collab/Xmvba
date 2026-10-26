import type { Metadata } from "next";
import { joinWithInviteCode } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, LinkButton, Notice, PageTitle } from "@/components/ui";
import { getInviteTeam, getTeam, getViewer } from "@/lib/data";
import { requireEvent } from "@/lib/guards";

export const metadata: Metadata = { title: "Team invite" };

export default async function JoinByLink({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const { settings } = await requireEvent();
  const invite = await getInviteTeam(code);
  if (!invite) {
    return <Empty title="This invite link is no longer valid">Ask your captain for a fresh link.</Empty>;
  }
  const [team, viewer] = await Promise.all([getTeam(invite.team_id), getViewer()]);
  const here = `/join/${code}`;

  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="You’re invited" title={invite.team_name}>
        Captain {team?.captain_name} invited you to join. {team?.member_count}/{settings.max_roster} players so far.
      </PageTitle>
      <Card>
        {!viewer ? (
          <LinkButton href={`/login?next=${encodeURIComponent(here)}`} size="lg" full>
            Sign in to accept
          </LinkButton>
        ) : !viewer.player ? (
          <>
            <p className="mb-3 text-[15px]">First, a quick player profile so your captain knows your position.</p>
            <LinkButton href={`/register?next=${encodeURIComponent(here)}`} size="lg" full>
              Create my player profile
            </LinkButton>
          </>
        ) : viewer.membership?.team_id === invite.team_id ? (
          <>
            <Notice tone="green">You’re already on this team.</Notice>
            <LinkButton href={`/teams/${invite.team_id}`} full className="mt-3">
              Open team room
            </LinkButton>
          </>
        ) : viewer.membership ? (
          <Notice tone="red">You’re already on another team. Players may only register for one team — leave it first from My Lobby.</Notice>
        ) : (
          <ActionForm action={joinWithInviteCode}>
            <input type="hidden" name="code" value={code} />
            <SubmitButton size="lg" variant="gold" full pendingText="Joining…">
              Join {invite.team_name}
            </SubmitButton>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
