"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
// Deep imports, not the barrel: `@phosphor-icons/react` re-exports ~9000
// icons, and in dev that lands every one of them in the browser. The type-only
// import is erased at compile time, so it costs nothing.
import type { Icon } from "@phosphor-icons/react";
import { AddressBook } from "@phosphor-icons/react/dist/csr/AddressBook";
import { Gauge } from "@phosphor-icons/react/dist/csr/Gauge";
import { Scan } from "@phosphor-icons/react/dist/csr/Scan";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  /** Long label for the sidebar, short one for the tab bar. */
  label: string;
  short: string;
  icon: Icon;
  adminOnly?: boolean;
};

const WORKSPACE: NavItem[] = [
  { href: "/scan", label: "Scan Card", short: "Scan", icon: Scan },
  { href: "/leads", label: "My Leads", short: "Leads", icon: AddressBook },
];

const MANAGE: NavItem[] = [
  { href: "/admin", label: "Admin Panel", short: "Admin", icon: Gauge, adminOnly: true },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

function visible(items: NavItem[], isAdmin: boolean) {
  return items.filter((item) => !item.adminOnly || isAdmin);
}

/** Desktop (>= 900px) left rail. Hidden below that, where the tab bar takes over. */
export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const isActive = useIsActive();
  const manage = visible(MANAGE, isAdmin);

  return (
    <nav className="sticky top-[var(--appbar-h)] hidden h-[calc(100dvh-var(--appbar-h))] flex-col gap-0.5 border-r border-line bg-surface px-3.5 py-[22px] desk:flex">
      <NavLabel>Workspace</NavLabel>
      {visible(WORKSPACE, isAdmin).map((item) => (
        <SideNavLink key={item.href} item={item} active={isActive(item.href)} />
      ))}
      {manage.length > 0 && (
        <>
          <NavLabel>Manage</NavLabel>
          {manage.map((item) => (
            <SideNavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </>
      )}
    </nav>
  );
}

function NavLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3.5 pb-1.5 text-[11px] font-extrabold tracking-[0.08em] text-subtle uppercase">
      {children}
    </div>
  );
}

function SideNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-[13.5px] font-bold transition-colors",
        active
          ? "bg-brand-soft text-brand-strong"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon size={18} weight="bold" />
      {item.label}
    </Link>
  );
}

/** Mobile (< 900px) bottom tab bar, sitting above the home indicator. */
export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const isActive = useIsActive();
  const items = [...visible(WORKSPACE, isAdmin), ...visible(MANAGE, isAdmin)];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--nav-h)+env(safe-area-inset-bottom))] border-t border-line bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-[14px] desk:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "m-1.5 flex flex-1 flex-col items-center justify-center gap-[3px] rounded-xl text-[10.5px] font-bold transition-colors active:scale-[0.96]",
              active ? "text-brand" : "text-subtle",
            )}
          >
            <Icon size={22} weight="bold" />
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
