import { HTMLAttributes } from "react";
import { clsx } from "clsx";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "good" | "warn" | "bad";

const tones: Record<BadgeTone, string> = {
  neutral: "border-line bg-bg text-muted",
  primary: "border-accent/20 bg-accentSoft text-accentDark",
  success: "border-success/20 bg-successSoft text-success",
  warning: "border-warning/20 bg-warningSoft text-warning",
  danger: "border-danger/20 bg-dangerSoft text-danger",
  info: "border-info/20 bg-infoSoft text-info",
  good: "border-success/20 bg-successSoft text-success",
  warn: "border-warning/20 bg-warningSoft text-warning",
  bad: "border-danger/20 bg-dangerSoft text-danger"
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} {...props} />;
}

const statusTone: Record<string, BadgeTone> = {
  pago: "success",
  ativo: "success",
  confirmado: "success",
  pendente: "warning",
  parcial: "warning",
  atrasado: "danger",
  cancelado: "danger",
  inativo: "neutral",
  trancado: "info",
  isento: "info"
};

export function StatusBadge({ status, label, className, ...props }: Omit<BadgeProps, "tone"> & { status: string; label?: string }) {
  const normalized = status.trim().toLocaleLowerCase("pt-BR");
  return (
    <Badge tone={statusTone[normalized] ?? "neutral"} className={className} data-status={normalized} {...props}>
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label ?? status}
    </Badge>
  );
}
