"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/types";
import { buttonClass, cx } from "./ui";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/**
 * A form wired to a server action, with pending state, inline error/success
 * messages and an optional "are you sure?" prompt.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess,
  hideOk,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  hideOk?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {state.error}
        </p>
      )}
      {state?.ok && !hideOk && (
        <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingText = "Working…",
  variant = "primary",
  size = "md",
  full = false,
  name,
  value,
  className,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  full?: boolean;
  name?: string;
  value?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending, data } = useFormStatus();
  // When a form has several submit buttons, only the pressed one says "Working…".
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={cx(buttonClass(variant, size, full), className)}
    >
      {mine ? pendingText : children}
    </button>
  );
}
