import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/lib/status";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "gold" | "outline" | "ghost" | "danger" | "success";
type Size = "md" | "lg" | "sm";

export function buttonClass(variant: Variant = "primary", size: Size = "md", full = false): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98]",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    size === "lg" && "min-h-14 px-5 text-base",
    size === "md" && "min-h-12 px-4 text-[15px]",
    size === "sm" && "min-h-10 px-3 text-sm",
    full && "w-full",
    variant === "primary" && "bg-navy-900 text-white hover:bg-navy-800",
    variant === "gold" && "bg-gold-500 text-navy-950 hover:bg-gold-400",
    variant === "outline" && "border-2 border-navy-900 bg-white text-navy-900 hover:bg-navy-50",
    variant === "ghost" && "bg-transparent text-navy-800 hover:bg-navy-50",
    variant === "danger" && "border-2 border-red-200 bg-white text-red-700 hover:bg-red-50",
    variant === "success" && "bg-emerald-600 text-white hover:bg-emerald-700"
  );
}

export function LinkButton({
  variant,
  size,
  full,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <Link {...props} className={cx(buttonClass(variant, size, full), className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5", className)}>{children}</div>;
}

const toneClass: Record<Tone, string> = {
  green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  blue: "bg-sky-100 text-sky-800 ring-sky-200",
  amber: "bg-amber-100 text-amber-900 ring-amber-200",
  red: "bg-red-100 text-red-800 ring-red-200",
  grey: "bg-slate-100 text-slate-700 ring-slate-200",
  navy: "bg-navy-900 text-white ring-navy-900",
  gold: "bg-gold-100 text-navy-900 ring-gold-400",
};

export function Badge({ tone = "grey", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-inset",
        toneClass[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-5">
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-court-500">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-extrabold uppercase leading-none text-navy-900 sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 text-[15px] text-muted">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-xl font-bold uppercase text-navy-900">{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-white/60 p-6 text-center">
      <p className="font-semibold text-navy-900">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "gold", children }: { tone?: "gold" | "blue" | "green" | "red"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-xl border-l-4 p-3 text-sm",
        tone === "gold" && "border-gold-500 bg-gold-100 text-navy-900",
        tone === "blue" && "border-sky-500 bg-sky-50 text-sky-900",
        tone === "green" && "border-emerald-500 bg-emerald-50 text-emerald-900",
        tone === "red" && "border-red-500 bg-red-50 text-red-900"
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  optional,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-navy-900">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "block w-full min-h-12 rounded-xl border border-line bg-white px-3.5 py-2.5 text-ink shadow-sm placeholder:text-slate-400 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function Stat({ label, value, tone, href }: { label: string; value: ReactNode; tone?: "gold" | "navy"; href?: string }) {
  const body = (
    <div
      className={cx(
        "h-full rounded-2xl p-4",
        tone === "navy" ? "bg-navy-900 text-white" : tone === "gold" ? "bg-gold-500 text-navy-950" : "border border-line bg-white"
      )}
    >
      <div className="font-display text-3xl font-extrabold leading-none">{value}</div>
      <div className={cx("mt-1 text-xs font-semibold uppercase tracking-wide", tone ? "opacity-80" : "text-muted")}>{label}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}
