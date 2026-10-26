import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for Google sign-in and email magic links.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/me";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/me";
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let error: string | null = null;
  if (code) {
    error = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
  } else if (tokenHash && type) {
    error = (await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error?.message ?? null;
  } else {
    error = url.searchParams.get("error_description") ?? "Sign-in link is missing or incomplete.";
  }

  if (error) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
