import { redirect } from "next/navigation";
import { Cards } from "@phosphor-icons/react/dist/ssr/Cards";
import { GoogleLogo } from "@phosphor-icons/react/dist/ssr/GoogleLogo";
import { LockSimple } from "@phosphor-icons/react/dist/ssr/LockSimple";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { signInWithGoogle } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

/**
 * Auth.js error codes land here because `pages.error` points at /login.
 * `AccessDenied` is what our signIn callback returns for anything that is not
 * a verified account in the Workspace.
 */
function messageFor(code: string | undefined, domain: string): string | null {
  if (!code) return null;
  if (code === "AccessDenied") return `Use your ${domain} Google account.`;
  if (code === "Configuration") return "Sign-in is not configured correctly. Tell the admin.";
  return "Sign-in did not complete. Try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/scan");

  const { error, next } = await searchParams;
  const domain = env.ALLOWED_EMAIL_DOMAIN;
  const message = messageFor(error, domain);

  return (
    <main className="grid min-h-[100dvh] place-items-center px-[18px] py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-[9px] text-[16.5px] font-extrabold tracking-[-0.02em]">
          <span className="grid size-[30px] place-items-center rounded-[9px] bg-brand text-white">
            <Cards size={16} weight="bold" />
          </span>
          SnapCard
        </div>

        <div className="rounded-[14px] border border-line bg-surface p-6 shadow-card">
          <h1 className="text-2xl tracking-[-0.03em]">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SnapCard is for the {domain} team. Sign in with your work Google account.
          </p>

          {message && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-bad/20 bg-bad-soft px-3.5 py-3 text-[13px] font-bold text-bad"
            >
              <WarningCircle size={17} weight="bold" className="mt-px shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <form action={signInWithGoogle} className="mt-5">
            <input type="hidden" name="next" value={next ?? "/scan"} />
            <Button type="submit" className="h-12 w-full text-[14.5px] font-bold shadow-brand">
              <GoogleLogo size={19} weight="bold" />
              Continue with Google
            </Button>
          </form>

          <p className="mt-3.5 flex items-start gap-[7px] text-xs text-subtle">
            <LockSimple size={14} weight="bold" className="mt-0.5 shrink-0" />
            Card images are sent for text extraction only and are never stored before you confirm consent.
          </p>
        </div>
      </div>
    </main>
  );
}
