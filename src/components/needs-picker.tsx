"use client";

import { useState } from "react";
import type { Position } from "@/lib/types";
import { cx } from "./ui";

/** Steppers for "Looking for: 1 Setter, 2 Flexible…". Submits need_<code> fields. */
export function NeedsPicker({ positions, initial }: { positions: Position[]; initial?: Record<string, number> }) {
  const [counts, setCounts] = useState<Record<string, number>>(initial ?? {});
  const set = (code: string, n: number) => setCounts((c) => ({ ...c, [code]: Math.max(0, Math.min(12, n)) }));
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-white">
      {positions.map((p) => {
        const n = counts[p.code] ?? 0;
        return (
          <li key={p.code} className="flex items-center gap-3 px-3 py-2">
            <span className={cx("flex-1 text-sm font-semibold", n > 0 ? "text-navy-900" : "text-muted")}>{p.label}</span>
            <input type="hidden" name={`need_${p.code}`} value={n} />
            <button
              type="button"
              onClick={() => set(p.code, n - 1)}
              disabled={n === 0}
              aria-label={`Fewer ${p.label}`}
              className="grid size-10 place-items-center rounded-lg border border-line text-xl font-bold text-navy-900 disabled:opacity-30"
            >
              −
            </button>
            <span className="w-6 text-center font-display text-xl font-bold text-navy-900" aria-live="polite">
              {n}
            </span>
            <button
              type="button"
              onClick={() => set(p.code, n + 1)}
              aria-label={`More ${p.label}`}
              className="grid size-10 place-items-center rounded-lg bg-navy-900 text-xl font-bold text-white"
            >
              +
            </button>
          </li>
        );
      })}
    </ul>
  );
}
