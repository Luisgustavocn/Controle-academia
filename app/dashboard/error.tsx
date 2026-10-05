"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Não foi possível carregar o Dashboard" message="Os dados não foram alterados. Tente carregar novamente." onRetry={reset} />;
}
