import { Cards } from "@phosphor-icons/react/dist/ssr";
import { UserChip } from "@/components/user-chip";
import { initialsFor } from "@/lib/initials";
import type { Role } from "@/lib/auth-rules";

type Props = {
  user: { name?: string | null; email: string; role: Role };
};

/** Cobalt `.appbar`: sticky, translucent, blurred, one hairline border. */
export function AppBar({ user }: Props) {
  const name = user.name?.trim() || user.email.split("@")[0];

  return (
    <header className="sticky top-0 z-30 flex h-[var(--appbar-h)] items-center gap-3 border-b border-line bg-background/[0.88] px-[18px] pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 backdrop-blur-[12px]">
      <div className="flex items-center gap-[9px] text-[16.5px] font-extrabold tracking-[-0.02em]">
        <span className="grid size-[30px] place-items-center rounded-[9px] bg-brand text-white">
          <Cards size={16} weight="bold" />
        </span>
        SnapCard
      </div>
      <div className="flex-1" />
      <UserChip name={name} email={user.email} initials={initialsFor(user.name, user.email)} role={user.role} />
    </header>
  );
}
