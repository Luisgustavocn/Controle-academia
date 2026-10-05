import { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function KpiCard({ title, value, subtitle, icon }: { title: string; value: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</p>
        {icon ? <span className="text-accent" aria-hidden="true">{icon}</span> : null}
      </div>
      <p className="mt-2 text-[1.6rem] font-black leading-none text-ink">{value}</p>
      {subtitle ? <p className="mt-2 text-xs text-muted">{subtitle}</p> : null}
    </Card>
  );
}
