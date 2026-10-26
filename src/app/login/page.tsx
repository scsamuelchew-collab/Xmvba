import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Notice, PageTitle } from "@/components/ui";
import { getViewer } from "@/lib/data";
import { LoginForms } from "./login-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const nextParam = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/me";
  const error = typeof sp.error === "string" ? sp.error : null;
  if (await getViewer()) redirect(nextParam);

  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="Xinmin Alumni Volleyball" title="Sign in">
        Sign in to create a team, join one, or enter the Player Pool. It takes 10 seconds.
      </PageTitle>
      {error && (
        <div className="mb-4">
          <Notice tone="red">{error}</Notice>
        </div>
      )}
      <Card>
        <LoginForms next={nextParam} />
      </Card>
      <p className="mt-4 text-center text-xs text-muted">
        Your phone number and email are only shown to organisers and your team captain.
      </p>
    </div>
  );
}
