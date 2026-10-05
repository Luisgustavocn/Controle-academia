import { StudentListing, type StudentListingInitialFilters } from "@/components/students/student-listing";

const STATUS = new Set(["ATIVO", "INATIVO", "CANCELADO", "TRANCADO"]);
const FINANCIAL = new Set(["EM_DIA", "INADIMPLENTE"]);
const SORT = new Set(["name.asc", "name.desc", "status.asc", "dueDay.asc", "dueDay.desc"]);
const PAGE_SIZE = new Set([10, 20, 50]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AlunosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const rawPage = Number(first(query.page));
  const rawPageSize = Number(first(query.pageSize));
  const rawStatus = first(query.status).toUpperCase();
  const rawFinancial = first(query.financial).toUpperCase();
  const rawSort = first(query.sort);
  const initialFilters: StudentListingInitialFilters = {
    q: first(query.q).slice(0, 120),
    status: STATUS.has(rawStatus) ? rawStatus : "",
    modalidadeId: first(query.modalidadeId),
    financial: FINANCIAL.has(rawFinancial) ? rawFinancial : "",
    sort: SORT.has(rawSort) ? rawSort : "name.asc",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: PAGE_SIZE.has(rawPageSize) ? rawPageSize : 20
  };
  return <StudentListing initialFilters={initialFilters} />;
}
