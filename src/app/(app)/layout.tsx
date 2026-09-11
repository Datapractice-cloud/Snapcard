import { redirect } from "next/navigation";
import { AppBar } from "@/components/app-bar";
import { SideNav, TabBar } from "@/components/nav";
import { InstallPrompt } from "@/components/install-prompt";
import { OutboxRunner } from "@/components/outbox-runner";
import { auth } from "@/lib/auth";

/**
 * The signed-in shell: Cobalt's app bar, plus a left rail on desktop and a
 * bottom tab bar on phones.
 *
 * Middleware already redirects anonymous requests, but it runs on cached
 * routes too, so the session is re-checked here before anything renders.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const isAdmin = session.user.role === "admin";

  return (
    <>
      <AppBar user={{ name: session.user.name, email: session.user.email, role: session.user.role }} />

      <div className="desk:grid desk:min-h-[calc(100dvh-var(--appbar-h))] desk:grid-cols-[232px_1fr]">
        <SideNav isAdmin={isAdmin} />

        {/* Bottom padding clears the tab bar and the home indicator. */}
        <main className="mx-auto w-full max-w-[1180px] px-[18px] pt-5 pb-[calc(var(--nav-h)+32px+env(safe-area-inset-bottom))] desk:px-10 desk:pt-8 desk:pb-[60px]">
          <InstallPrompt />
          {children}
        </main>
      </div>

      <TabBar isAdmin={isAdmin} />

      {/* Renders nothing; keeps the queue draining wherever the rep is. */}
      <OutboxRunner />
    </>
  );
}
