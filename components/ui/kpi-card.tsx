import { Card } from "@/components/ui/card";

export function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
    </Card>
  );
}
