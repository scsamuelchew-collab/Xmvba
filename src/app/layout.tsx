import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import Link from "next/link";
import { BottomNav, TopLinks } from "@/components/nav";
import { getEventContext, getViewer } from "@/lib/data";
import "./globals.css";

const display = Barlow_Condensed({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getEventContext().catch(() => null);
  const title = ctx?.event.name ?? "Xinmin Alumni Volleyball Team Lobby";
  return {
    title: { default: "Xinmin Alumni Volleyball Team Lobby", template: "%s · Xinmin Alumni Volleyball" },
    description:
      "No team? No problem. Create a team, join an alumni team, or enter the Player Pool for " + title + ".",
    openGraph: {
      title: "No team? No problem. — Xinmin Alumni Volleyball",
      description: "Create a team, join one, or enter the Player Pool. Mixed graduating batches welcome.",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b1f4d",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer().catch(() => null);
  return (
    <html lang="en-SG" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-40 bg-navy-900 text-white shadow-md">
          <nav className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4" aria-label="Site">
            <Link href="/" className="flex items-center gap-2">
              <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
                <circle cx="32" cy="32" r="26" fill="#ffc20e" />
                <path
                  d="M32 6a26 26 0 0 1 0 52M8 22c13 3 29 13 34 34M56 20c-13 8-31 10-44 5"
                  fill="none"
                  stroke="#0b1f4d"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
              <span className="font-display text-lg font-extrabold uppercase leading-none tracking-wide">
                Xinmin <span className="text-gold-500">Alumni</span>
                <span className="block text-[11px] font-semibold tracking-[0.2em] text-navy-100">Volleyball Lobby</span>
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <TopLinks isAdmin={!!viewer?.isAdmin} />
              {viewer?.isAdmin && (
                <Link href="/admin" className="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-bold uppercase text-navy-950 md:hidden">
                  Organiser
                </Link>
              )}
              {viewer ? (
                <Link
                  href="/me"
                  className="relative hidden rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold md:inline-block"
                >
                  {viewer.player?.display_name ?? "My Lobby"}
                  {viewer.unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-court-500 px-1 text-[10px] font-bold">
                      {viewer.unread}
                    </span>
                  )}
                </Link>
              ) : (
                <Link href="/login" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:pb-12">{children}</main>
        <footer className="hidden border-t border-line py-6 text-center text-xs text-muted md:block">
          Xinmin Alumni Volleyball · Reconnect. Compete. Support the next generation.
        </footer>
        <BottomNav unread={viewer?.unread ?? 0} />
      </body>
    </html>
  );
}
