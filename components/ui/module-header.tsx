import { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";

type HeaderStat = {
  label: string;
  value: string;
};

type ModuleHeaderProps = {
  title: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  badges?: string[];
  stats?: HeaderStat[];
};

export function ModuleHeader({ title, description, icon: Icon, badges, stats }: ModuleHeaderProps) {
  return (
    <header className="relative mb-5 overflow-hidden rounded-2xl border border-white/75 bg-[rgba(255,255,255,0.86)] p-4 shadow-[0_14px_32px_rgba(43,16,22,0.09)] backdrop-blur-sm md:p-5">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[rgba(207,22,33,0.16)] blur-2xl" />
      <div className="pointer-events-none absolute -left-6 bottom-0 h-20 w-20 rounded-full bg-[rgba(159,16,24,0.12)] blur-2xl" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(207,22,33,0.2)] bg-[rgba(252,236,239,0.9)] text-accent shadow-[0_6px_16px_rgba(159,16,24,0.12)]">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">Academia</p>
            <h1 className="mt-1 text-2xl font-black leading-tight text-ink">{title}</h1>
            <p className="mt-1 text-sm text-muted">{description}</p>
            {badges?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {badges.map((badge) => (
                  <Badge key={badge}>{badge}</Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {stats?.length ? (
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto">
            {stats.map((stat) => (
              <div key={`${stat.label}-${stat.value}`} className="rounded-xl border border-line/75 bg-white/75 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{stat.label}</p>
                <p className="mt-1 text-sm font-bold text-ink">{stat.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
