import { AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";

export function ErrorState({ title = "Não foi possível carregar", message = "Tente novamente em instantes.", onRetry, retryLabel = "Tentar novamente", className }: { title?: string; message?: string; onRetry?: () => void; retryLabel?: string; className?: string }) {
  return (
    <div role="alert" className={clsx("flex min-h-48 flex-col items-center justify-center rounded-ds-xl border border-danger/25 bg-dangerSoft px-6 py-8 text-center", className)}>
      <AlertTriangle className="mb-3 h-6 w-6 text-danger" aria-hidden="true" />
      <h3 className="text-card-title text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-body text-muted">{message}</p>
      {onRetry ? <Button className="mt-4" variant="outline" onClick={onRetry}>{retryLabel}</Button> : null}
    </div>
  );
}
