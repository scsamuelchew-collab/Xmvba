import "server-only";
import { notFound, redirect } from "next/navigation";
import { getEventContext, getViewer, type EventContext, type Viewer } from "@/lib/data";

export async function requireEvent(): Promise<EventContext> {
  const ctx = await getEventContext();
  if (!ctx) notFound();
  return ctx;
}

/** Signed-in user, or off to sign-in and back here afterwards. */
export async function requireViewer(next: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/admin");
  if (!viewer.isAdmin) notFound();
  return viewer;
}
