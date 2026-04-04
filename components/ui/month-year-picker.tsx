import { clsx } from "clsx";
import { Select } from "@/components/ui/select";

type MonthYearPickerProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const MONTH_OPTIONS = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" }
] as const;

function parseCompetencia(value: string) {
  const now = new Date();
  const [year, month] = value.split("-");

  if (!year || !month || month.length !== 2) {
    return {
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, "0")
    };
  }

  return {
    year,
    month
  };
}

export function MonthYearPicker({ value, onChange, className }: MonthYearPickerProps) {
  const parsed = parseCompetencia(value);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, index) => String(currentYear + 2 - index));

  return (
    <div className={clsx("grid gap-2 sm:grid-cols-[1.2fr_0.8fr]", className)}>
      <Select
        value={parsed.month}
        onChange={(event) => onChange(`${parsed.year}-${event.target.value}`)}
        aria-label="Selecionar mês"
      >
        {MONTH_OPTIONS.map((month) => (
          <option key={month.value} value={month.value}>
            {month.label}
          </option>
        ))}
      </Select>

      <Select
        value={parsed.year}
        onChange={(event) => onChange(`${event.target.value}-${parsed.month}`)}
        aria-label="Selecionar ano"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </Select>
    </div>
  );
}
