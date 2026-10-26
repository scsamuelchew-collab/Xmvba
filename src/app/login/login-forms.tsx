"use client";

import { signInWithEmail, signInWithGoogle } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";

export function LoginForms({ next }: { next: string }) {
  return (
    <div className="space-y-5">
      <ActionForm action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <SubmitButton variant="outline" size="lg" full pendingText="Opening Google…">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
          </svg>
          Continue with Google
        </SubmitButton>
      </ActionForm>

      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted">
        <span className="h-px flex-1 bg-line" /> or use your email <span className="h-px flex-1 bg-line" />
      </div>

      <ActionForm action={signInWithEmail}>
        <input type="hidden" name="next" value={next} />
        <Field label="Email address" hint="We’ll email you a one-tap sign-in link. No password needed.">
          <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" className={inputClass} />
        </Field>
        <div className="mt-3">
          <SubmitButton size="lg" full pendingText="Sending link…">
            Email me a sign-in link
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
