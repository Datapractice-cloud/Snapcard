/** Cobalt `h1.page-title` + `p.page-sub`. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-[22px]">
      <h1 className="text-2xl tracking-[-0.03em]">{title}</h1>
      {subtitle && <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
