import { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { clsx } from "clsx";

export function DataTableContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("w-full overflow-x-auto rounded-ds-xl border border-line bg-card shadow-surface-sm", className)} {...props} />;
}

export function DataTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={clsx("min-w-full border-0 bg-transparent", className)} {...props} />;
}

export function DataTableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={clsx("bg-bg", className)} {...props} />;
}

export function DataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function DataTableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={clsx("border-b border-line last:border-b-0 hover:bg-accentSoft/40", className)} {...props} />;
}

export function DataTableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={clsx("whitespace-nowrap border-0 bg-transparent px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted", className)} {...props} />;
}

export function DataTableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={clsx("border-0 px-4 py-3 text-sm text-ink", className)} {...props} />;
}
