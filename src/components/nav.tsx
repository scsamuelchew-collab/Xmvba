"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Home", icon: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/teams", label: "Teams", icon: "M7 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-2a5 5 0 0 1 10 0v2m2 0v-2a5 5 0 0 1 8-4" },
  { href: "/pool", label: "Player Pool", icon: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-8 10a8 8 0 0 1 16 0" },
  { href: "/me", label: "My Lobby", icon: "M4 5h16v14H4zM4 9h16M9 13h6" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

/** Thumb-reachable tab bar on phones; hidden on wider screens. */
export function BottomNav({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Main"
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map((it) => {
          const active = isActive(path, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cx(
                  "relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  active ? "text-navy-900" : "text-muted"
                )}
                aria-current={active ? "page" : undefined}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinejoin="round" strokeLinecap="round">
                  <path d={it.icon} />
                </svg>
                {it.label}
                {it.href === "/me" && unread > 0 && (
                  <span className="absolute top-2 right-[calc(50%-20px)] grid min-w-5 place-items-center rounded-full bg-court-500 px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
                {active && <span className="absolute top-0 h-1 w-10 rounded-b-full bg-gold-500" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TopLinks({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = isAdmin ? [...ITEMS.slice(1), { href: "/admin", label: "Organiser" }] : ITEMS.slice(1);
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {items.map((it) => (
        <li key={it.href}>
          <Link
            href={it.href}
            className={cx(
              "rounded-lg px-3 py-2 text-sm font-semibold",
              isActive(path, it.href) ? "bg-white/15 text-white" : "text-navy-100 hover:text-white"
            )}
          >
            {it.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
