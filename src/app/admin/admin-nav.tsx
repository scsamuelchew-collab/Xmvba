"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Organiser" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cx(
              "shrink-0 border-b-4 px-3 py-3 text-sm font-bold uppercase tracking-wide",
              active ? "border-gold-500 text-navy-900" : "border-transparent text-muted hover:text-navy-900"
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
