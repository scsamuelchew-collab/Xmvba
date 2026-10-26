import type { ReactNode } from "react";
import { cx } from "./ui";

/** Big tappable radio "chips" — easier than a dropdown on a phone. */
export function ChoiceGroup({
  name,
  options,
  defaultValue,
  required,
  columns = 2,
}: {
  name: string;
  options: { value: string; label: ReactNode }[];
  defaultValue?: string | null;
  required?: boolean;
  columns?: 2 | 3;
}) {
  return (
    <div className={cx("grid gap-2", columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-line bg-white px-3 py-2 text-center text-sm font-semibold text-navy-900 transition has-checked:border-navy-900 has-checked:bg-navy-900 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-gold-500"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={defaultValue === o.value}
            required={required}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
