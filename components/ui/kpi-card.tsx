import { Card } from "@/components/ui/card";

export function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent to-[#ff6c75]" />
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{title}</p>
      <p className="mt-2 text-[1.72rem] font-black leading-none text-ink">{value}</p>
      {subtitle ? <p className="mt-2 text-xs text-muted">{subtitle}</p> : null}
    </Card>
  );
}
