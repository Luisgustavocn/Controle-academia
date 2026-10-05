import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({ page, totalPages, totalItems, onPageChange, disabled }: { page: number; totalPages: number; totalItems?: number; onPageChange: (page: number) => void; disabled?: boolean }) {
  const safeTotal = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), safeTotal);
  return (
    <nav aria-label="Paginação" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-helper text-muted">
        Página <strong className="text-ink">{current}</strong> de <strong className="text-ink">{safeTotal}</strong>
        {typeof totalItems === "number" ? ` · ${totalItems} itens` : ""}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" leadingIcon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />} disabled={disabled || current <= 1} onClick={() => onPageChange(current - 1)}>Anterior</Button>
        <Button variant="outline" size="sm" trailingIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />} disabled={disabled || current >= safeTotal} onClick={() => onPageChange(current + 1)}>Próxima</Button>
      </div>
    </nav>
  );
}
