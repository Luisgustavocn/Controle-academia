import Link from "next/link";
import { HTMLAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { clsx } from "clsx";

type Breadcrumb = { label: string; href?: string };

export function PageHeader({ title, description, breadcrumbs, primaryAction, secondaryActions, className, ...props }: HTMLAttributes<HTMLElement> & { title: ReactNode; description?: ReactNode; breadcrumbs?: Breadcrumb[]; primaryAction?: ReactNode; secondaryActions?: ReactNode }) {
  return (
    <header className={clsx("mb-5 space-y-3", className)} {...props}>
      {breadcrumbs?.length ? (
        <nav aria-label="Navegação estrutural">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {breadcrumbs.map((item, index) => (
              <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3 w-3" aria-hidden="true" /> : null}
                {item.href ? <Link href={item.href} className="rounded-ds-sm hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{item.label}</Link> : <span aria-current="page">{item.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-page-title text-ink">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-body text-muted">{description}</p> : null}
        </div>
        {primaryAction || secondaryActions ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </div>
    </header>
  );
}
