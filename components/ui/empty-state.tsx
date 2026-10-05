import { ComponentType, ReactNode } from "react";
import { Inbox, SearchX } from "lucide-react";
import { clsx } from "clsx";

type EmptyStateKind = "empty" | "search";

export function EmptyState({ title, description, action, icon: Icon, kind = "empty", className }: { title: string; description?: string; action?: ReactNode; icon?: ComponentType<{ className?: string }>; kind?: EmptyStateKind; className?: string }) {
  const DefaultIcon = kind === "search" ? SearchX : Inbox;
  const StateIcon = Icon ?? DefaultIcon;
  return (
    <div className={clsx("flex min-h-48 flex-col items-center justify-center rounded-ds-xl border border-dashed border-line bg-bg/50 px-6 py-8 text-center", className)}>
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accentSoft text-accentDark">
        <StateIcon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="text-card-title text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-body text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
